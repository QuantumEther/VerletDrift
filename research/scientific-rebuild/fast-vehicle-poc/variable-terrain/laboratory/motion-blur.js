// The r180 motion blur example uses one MRT scene pass and a directional gather.
// Use the lab's floating origin, per-corner telemetry and the existing HDR output quad.
export const motionDefaults=Object.freeze({
 enabled:true,quality:'fast',intensity:.82,shutter:7,periphery:.18,camera:1,body:1,wheels:true,radius:16,depth:true,
});
export function exposureScale(milliseconds, shutter){
 return milliseconds>=1&&milliseconds<=50?Math.min(shutter/milliseconds,12):0;
}

export async function createMotionBlur(renderer, body, hubs, recenteredMeshes){
 const T=await import('./vendor/three-r180/three.webgpu.js');
 const N=await import('./vendor/three-r180/three.tsl.js');
 const target=new T.RenderTarget(1,1,{count:2,type:T.HalfFloatType,samples:renderer.samples});
 target.texture.name='output';
 const data=target.textures[1];data.name='motionDepth';data.minFilter=data.magFilter=T.NearestFilter;
 const previousVP=N.uniform(new T.Matrix4()),currentVP=N.uniform(new T.Matrix4());
 const savedVP=new T.Matrix4(),saved=new WeakMap(),originShift=new T.Vector3();
 const offset=new T.Matrix4(),rotate=new T.Matrix4(),around=new T.Matrix4(),axis=new T.Vector3();
 const resolution=N.uniform(new T.Vector2(1,1)),scale=N.uniform(0),radius=N.uniform(16),periphery=N.uniform(0);
 const cameraAmount=N.uniform(1),bodyAmount=N.uniform(1),sampleCount=N.uniform(8,'int'),rejectDepth=N.uniform(1);
 let serial=0,contiguous=false,last=null,options=motionDefaults,passes=0;
 const previousModel=N.uniform(new T.Matrix4()).onObjectUpdate(({object},node)=>{
  let history=saved.get(object);
  if(!history){history={current:new T.Matrix4(),previous:new T.Matrix4(),frame:0};saved.set(object,history);}
  if(history.frame!==serial){
   const hasPrior=contiguous&&history.frame===serial-1;
   history.previous.copy(hasPrior?history.current:object.matrixWorld);
   if(hasPrior&&isRecentered(object))history.previous.copy(object.matrixWorld).premultiply(offset);
   if(hasPrior){
    const index=wheelIndex(object);
    if(index>=0&&corrections[index])history.previous.premultiply(corrections[index]);
   }
   history.current.copy(object.matrixWorld);history.frame=serial;
  }
  return node.value.copy(history.previous);
 });
 function isRecentered(object){
  for(let parent=object;parent;parent=parent.parent)if(parent.userData.motionRecentered||recenteredMeshes.has(parent))return true;
  return false;
 }
 function wheelIndex(object){
  for(let parent=object;parent;parent=parent.parent){
   const index=hubs.indexOf(parent);
   if(index>=0)return index;
  }
  return -1;
 }
 const bodyFactor=N.uniform(1).onObjectUpdate(({object})=>{
  for(let parent=object;parent;parent=parent.parent)if(parent===body||hubs.includes(parent))return bodyAmount.value;
  return 1;
 });
 const origin=N.uniform(originShift);
 const world=N.modelWorldMatrix.mul(N.positionLocal.toVec4());
 const centerClip=N.varying(currentVP.mul(world));
 const cameraClip=N.varying(previousVP.mul(N.vec4(world.xyz.add(origin),1)));
 const previousClip=N.varying(previousVP.mul(previousModel.mul(N.positionLocal.toVec4())));
 const project=p=>p.xy.div(N.max(p.w,.01));
 const cameraFlow=project(centerClip).sub(project(cameraClip));
 const objectFlow=project(cameraClip).sub(project(previousClip));
 const uvMotion=cameraFlow.mul(cameraAmount).add(objectFlow.mul(bodyFactor)).mul(N.vec2(.5,-.5));
 // Store eye depth alongside signed UV velocity, so MSAA resolves a single MRT.
 const buffers=N.mrt({output:N.output,motionDepth:N.vec4(uvMotion,N.max(.001,N.positionView.z.negate()),1)});
 const uv=N.screenUV,color=N.texture(target.texture),motion=N.texture(data);
 const gather=N.Fn(()=>{
  const center=color.sample(uv).toVar();
  const velocity=motion.sample(uv).toVar();
  const edge=N.clamp(N.length(uv.sub(.5)).mul(1.7),0,1);
  const displacement=velocity.xy.mul(scale).mul(edge.mul(edge).mul(periphery).add(1)).mul(resolution).toVar();
  const length=N.length(displacement);
  N.If(length.greaterThan(.65).and(velocity.z.greaterThan(.001)).and(velocity.z.lessThan(150)),()=>{
   const direction=displacement.mul(N.min(1,radius.div(length))).div(resolution);
   const sum=center.toVar(),weights=N.float(1).toVar();
   N.Loop(sampleCount,({i})=>{
    const portion=N.float(i).add(.5).div(N.float(sampleCount)).sub(.5);
    const lookup=N.clamp(uv.add(direction.mul(portion)),N.vec2(0),N.vec2(1));
    const neighbor=motion.sample(lookup);
    const threshold=N.max(.32,velocity.z.mul(.042));
    const accept=rejectDepth.lessThan(.5).or(N.abs(neighbor.z.sub(velocity.z)).lessThan(threshold)
      .and(N.dot(neighbor.xy.sub(velocity.xy),neighbor.xy.sub(velocity.xy)).lessThan(N.dot(velocity.xy,velocity.xy).mul(2).add(.000008))));
    N.If(accept,()=>{
     const weight=N.float(1).sub(N.abs(portion));
     sum.addAssign(color.sample(lookup).mul(weight));weights.addAssign(weight);
    });
   });
   center.assign(sum.div(weights));
  });
  return center;
 })();
 const quad=new T.QuadMesh(new T.NodeMaterial());
 quad.material.name='VerletDrift_MotionOutput';
 quad.material.fragmentNode=gather.renderOutput(renderer.toneMapping,renderer.outputColorSpace);
 quad.material.depthTest=quad.material.depthWrite=false;
 const corrections=Array(4).fill(null),correctionMatrices=hubs.map(()=>new T.Matrix4());
 const samplePresets={fast:4,balanced:8,cinematic:16,ultra:24};
 function reset(){last=null;contiguous=false;scale.value=0;}
 function configure(next){if(options.enabled!==next.enabled){reset();if(!next.enabled)target.setSize(1,1);}options=next;}
 function render(scene,camera,p,width,height,now=performance.now()){
  if(width<1||height<1)return;
  const elapsed=last?now-last.now:0;
  contiguous=!!last&&exposureScale(elapsed,options.shutter)>0&&last.width===width&&last.height===height;
  camera.updateMatrixWorld();
  currentVP.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  previousVP.value.copy(contiguous?savedVP:currentVP.value);
  const x=p.planar.x,y=p.planar.y;
  originShift.set(contiguous?x-last.x:0,contiguous?y-last.y:0,0);
  offset.makeTranslation(originShift.x,originShift.y,0);
  const wheelState=p.wheels.map((w,i)=>{
   corrections[i]=null;
   const before=last?.wheels[i],delta=before?w.angle-before.angle:0;
   if(contiguous&&before&&delta!==0&&(!options.wheels||Math.abs(delta)>1.25)){
    // Keep previous carrier pose. Remove spin, or bound its angular sweep
    // using actual signed rotor velocity when frame samples are far apart.
    const sweep=options.wheels?Math.max(-1.25,Math.min(1.25,w.omega*elapsed/1000)):0;
    const [px,py,pz]=before.hub;
    axis.set(...before.axis);rotate.makeRotationAxis(axis,delta-sweep);
    corrections[i]=correctionMatrices[i].makeTranslation(px,py,pz).multiply(rotate).multiply(around.makeTranslation(-px,-py,-pz));
   }
   return {angle:w.angle,hub:hubs[i].position.toArray(),axis:w.lateral};
  });
  target.setSize(width,height);resolution.value.set(width,height);
  scale.value=contiguous?exposureScale(elapsed,options.shutter)*options.intensity:0;
  periphery.value=options.periphery*Math.min(1,Math.hypot(p.planar.u,p.planar.v)/30);
  cameraAmount.value=options.camera;bodyAmount.value=options.body;radius.value=options.radius;
  rejectDepth.value=Number(options.depth);sampleCount.value=samplePresets[options.quality]??8;
  serial++;
  const restore=renderer.getRenderTarget(),previousMRT=renderer.getMRT();
  try{
   renderer.setRenderTarget(target);renderer.setMRT(buffers);renderer.render(scene,camera);
  }finally{
   renderer.setMRT(previousMRT);renderer.setRenderTarget(restore);
  }
  renderer._renderOutput(target,quad);passes++;
  savedVP.copy(currentVP.value);last={x,y,now,width,height,wheels:wheelState};
 }
 return {render,configure,reset,info:()=>({enabled:options.enabled,quality:options.quality,passes,exposure:scale.value}),
  dispose(){target.dispose();quad.material.dispose();}};
}
