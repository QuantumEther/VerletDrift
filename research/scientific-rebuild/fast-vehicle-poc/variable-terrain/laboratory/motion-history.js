export const motionDefaults=Object.freeze({
 enabled:true,quality:'fast',intensity:.82,shutter:7,periphery:.18,camera:1,body:1,wheels:true,radius:16,depth:true,
});
export function exposureScale(milliseconds, shutter){
 return milliseconds>=1&&milliseconds<=50?Math.min(shutter/milliseconds,12):0;
}

export const samplePresets=Object.freeze({fast:4,balanced:8,cinematic:16,ultra:24});

export function createMotionHistory(T,body,hubs,recenteredMeshes){
 const currentVP=new T.Matrix4(),previousVP=new T.Matrix4(),savedVP=new T.Matrix4();
 const saved=new WeakMap(),originShift=new T.Vector3();
 const offset=new T.Matrix4(),rotate=new T.Matrix4(),around=new T.Matrix4(),axis=new T.Vector3();
 const corrections=Array(4).fill(null),correctionMatrices=hubs.map(()=>new T.Matrix4());
 let serial=0,contiguous=false,last=null,options=motionDefaults;
 function previousModel(object){
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
  return history.previous;
 }
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
 function bodyFactor(object){
  for(let parent=object;parent;parent=parent.parent)if(parent===body||hubs.includes(parent))return options.body;
  return 1;
 }

 function reset(){last=null;contiguous=false;}
 function begin(camera,p,width,height,settings,now){
  options=settings;
  const elapsed=last?now-last.now:0;
  contiguous=!!last&&exposureScale(elapsed,options.shutter)>0&&last.width===width&&last.height===height;
  camera.updateMatrixWorld();
  currentVP.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  previousVP.copy(contiguous?savedVP:currentVP);
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

  serial++;
  savedVP.copy(currentVP);last={x,y,now,width,height,wheels:wheelState};
  return {exposure:contiguous?exposureScale(elapsed,options.shutter)*options.intensity:0,
   periphery:options.periphery*Math.min(1,Math.hypot(p.planar.u,p.planar.v)/30)};
 }
 return {begin,reset,previousModel,bodyFactor,currentVP,previousVP,originShift};
}
