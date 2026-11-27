// The r180 motion blur example uses one MRT scene pass and a directional gather.
// Use the lab's floating origin, per-corner telemetry and the existing HDR output quad.
import {createMotionHistory,motionDefaults,samplePresets} from './motion-history.js';
export {motionDefaults,exposureScale} from './motion-history.js';

export async function createMotionBlur(renderer, body, hubs, recenteredMeshes){
 const T=await import('./vendor/three-r180/three.webgpu.js');
 const N=await import('./vendor/three-r180/three.tsl.js');
 const target=new T.RenderTarget(1,1,{count:2,type:T.HalfFloatType,samples:renderer.samples});
 target.texture.name='output';
 const data=target.textures[1];data.name='motionDepth';data.minFilter=data.magFilter=T.NearestFilter;
 const history=createMotionHistory(T,body,hubs,recenteredMeshes);
 const previousVP=N.uniform(history.previousVP),currentVP=N.uniform(history.currentVP);
 const resolution=N.uniform(new T.Vector2(1,1)),scale=N.uniform(0),radius=N.uniform(16),periphery=N.uniform(0);
 const cameraAmount=N.uniform(1),sampleCount=N.uniform(8,'int'),rejectDepth=N.uniform(1);
 const previousModel=N.uniform(new T.Matrix4()).onObjectUpdate(({object},node)=>node.value.copy(history.previousModel(object)));
 const bodyFactor=N.uniform(1).onObjectUpdate(({object})=>history.bodyFactor(object));
 let options=motionDefaults,passes=0;
 const origin=N.uniform(history.originShift);
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
 function reset(){history.reset();scale.value=0;}
 function configure(next){if(options.enabled!==next.enabled){reset();if(!next.enabled)target.setSize(1,1);}options=next;}
 function render(scene,camera,p,width,height,now=performance.now()){
  if(width<1||height<1)return;
  const frame=history.begin(camera,p,width,height,options,now);
  target.setSize(width,height);resolution.value.set(width,height);
  scale.value=frame.exposure;periphery.value=frame.periphery;
  cameraAmount.value=options.camera;radius.value=options.radius;
  rejectDepth.value=Number(options.depth);sampleCount.value=samplePresets[options.quality]??8;
  const restore=renderer.getRenderTarget(),previousMRT=renderer.getMRT();
  try{
   renderer.setRenderTarget(target);renderer.setMRT(buffers);renderer.render(scene,camera);
  }finally{
   renderer.setMRT(previousMRT);renderer.setRenderTarget(restore);
  }
  renderer._renderOutput(target,quad);passes++;
 }
 return {render,configure,reset,info:()=>({enabled:options.enabled,quality:options.quality,passes,exposure:scale.value}),
  dispose(){target.dispose();quad.material.dispose();}};
}
