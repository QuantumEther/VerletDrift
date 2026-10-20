// Real application loop + GPU commands, replacing only headless swap-chain presentation.
export async function installLiveGPUTarget(page){
 await page.addInitScript(()=>{
  if(!navigator.gpu)return;
  const original=HTMLCanvasElement.prototype.getContext;
  navigator.gpu.getPreferredCanvasFormat=()=> 'rgba8unorm';
  HTMLCanvasElement.prototype.getContext=function(type,...args){
   if(type!=='webgpu')return original.call(this,type,...args);
   const canvas=this;let device,format,texture;
   return {configure(options){({device,format}=options);window.__liveGPU=device;},getCurrentTexture(){
    if(!texture||texture.width!==canvas.width||texture.height!==canvas.height){texture?.destroy();texture=device.createTexture({size:[canvas.width,canvas.height],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});}
    window.__liveTexture=texture;return texture;
   },unconfigure(){texture?.destroy();texture=null;}};
  };
 });
}
export async function startDyedDrift(page){
 await page.goto('/?renderer=gpu&quality=performance&debugMode=quiet');
 await page.waitForFunction(()=>window.state?.loop.previousTimestamp>0);
 await page.locator('#gpuResolutionScale').evaluate(n=>{n.value=.35;n.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.evaluate(async()=>{
  window.__gpuModule=await import('/js/gpu-renderer.js');
  window.__events=await import('/js/renderer/liquid-events.js');
  window.__transfers=await import('/js/renderer/wet-trail-events.js');
 });
 await page.waitForFunction(()=>window.__gpuModule.isGPUReady());
 await page.evaluate(()=>{
  const s=state,dt=1/s.params.simulationFps;
  s.balloons=[];s.splatDecals=[];s.params.smokeEnabled=false;s.params.showSparks=false;s.params.showTrailArrows=false;s.params.showKinematicArrows=false;s.params.motionBlurIntensity=0;
  s.engine.currentGear='N';s.engine.clutchEngagement=0;s.engine.clutchPedalPosition=0;
  for(const w of Object.values(s.wheels)){w.prevX=w.x;w.prevY=w.y+22*dt;}
  for(const n of Object.keys(s.wheelOmega))s.wheelOmega[n]=22/s.params.wheelRadius;
  for(const f of Object.values(s.prevTireForce)){f.lon=0;f.lat=0;}
  s.steering.isDragging=true;s.steering.wheelAngle=.25/s.params.maxFrontWheelAngle*Math.PI*2.5;
 });
 await page.keyboard.down('KeyF');
}
export async function collideDyedBalloon(page,hue){
 const count=await page.evaluate(hue=>{
  const s=state,w=s.wheels.frontLeft;
  s.balloons=[{x:w.x,y:w.y,radius:.6,hue,isPopped:false,deformTime:0,deformScale:1,deformDir:{x:0,y:0}}];
  return window.__events.getLiquidImpacts().events.length;
 },hue);
 await page.waitForFunction(n=>window.__events.getLiquidImpacts().events.length>n,count);
}
