import {test,expect} from '@playwright/test';

// Exercise the real main loop and DOM bindings with a real GPU texture target.
// Headless SwiftShader cannot reliably present a browser swap chain; only that
// presentation boundary is replaced. Shaders, physics and UI handlers are real.
test('drifting collisions retain liquid through live lighting, quality and resolution edits',async({page})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:640,height:480});
 await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.getContext;
  navigator.gpu.getPreferredCanvasFormat=()=> 'rgba8unorm';
  HTMLCanvasElement.prototype.getContext=function(type,...args){
   if(type!=='webgpu')return original.call(this,type,...args);
   const canvas=this;let device,format,texture;
   return {
    configure(options){({device,format}=options);window.__liveGPU=device;},
    getCurrentTexture(){
     if(!texture||texture.width!==canvas.width||texture.height!==canvas.height){
      texture?.destroy();texture=device.createTexture({size:[canvas.width,canvas.height],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
     }return texture;
    },
    unconfigure(){texture?.destroy();texture=null;},
   };
  };
 });
 await page.goto('/?renderer=gpu&quality=performance&debugMode=quiet');
 await page.waitForFunction(()=>window.state?.loop.previousTimestamp>0);
 await page.locator('#gpuResolutionScale').evaluate(n=>{n.value=.25;n.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.evaluate(async()=>{
  window.__gpuModule=await import('/js/gpu-renderer.js');
  window.__eventModule=await import('/js/renderer/liquid-events.js');
 });
 await page.waitForFunction(()=>window.__gpuModule.isGPUReady());
 const start=await page.evaluate(()=>{
  const s=state,dt=1/s.params.simulationFps;
  s.balloons=[];s.engine.currentGear='N';s.engine.clutchEngagement=0;s.engine.clutchPedalPosition=0;
  for(const w of Object.values(s.wheels)){w.prevX=w.x;w.prevY=w.y+18*dt;}
  for(const n of Object.keys(s.wheelOmega))s.wheelOmega[n]=18/s.params.wheelRadius;
  for(const f of Object.values(s.prevTireForce)){f.lon=0;f.lat=0;}
  s.steering.isDragging=true;s.steering.wheelAngle=.22/s.params.maxFrontWheelAngle*Math.PI*2.5;
  return {x:s.body.centerX,y:s.body.centerY,time:s.loop.simulationTime};
 });
 await page.keyboard.down('KeyF');
 for(const [id,value]of [['sceneLightAzimuth',75],['liquidQuality',1],['gpuResolutionScale',.35],['liquidRoughness',1.5]]){
  const count=await page.evaluate(()=>{
   const s=state,w=s.wheels.frontLeft;
   s.balloons=[{x:w.x,y:w.y,radius:.6,hue:350,isPopped:false,deformTime:0,deformScale:1,deformDir:{x:0,y:0}}];
   return window.__eventModule.getLiquidImpacts().events.length;
  });
  await page.waitForFunction(count=>window.__eventModule.getLiquidImpacts().events.length>count,count);
  await page.locator('#'+id).evaluate((n,value)=>{n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await expect.poll(()=>page.evaluate(()=>window.__gpuModule.getGPURenderStats().liquid?.airborne??0)).toBeGreaterThan(0);
  const stats=await page.evaluate(()=>window.__gpuModule.getGPURenderStats());
  expect(stats.ready,id).toBe(true);expect(stats.error,id).toBeNull();expect(stats.liquidError,id).toBeUndefined();
  expect(stats.liquid.retainedEvents,id).toBeGreaterThan(count);
 }
 const end=await page.evaluate(()=>({x:state.body.centerX,y:state.body.centerY,time:state.loop.simulationTime}));
 expect(Math.hypot(end.x-start.x,end.y-start.y)).toBeGreaterThan(.3);
 expect(end.time).toBeGreaterThan(start.time);
 await page.keyboard.up('KeyF');
});
