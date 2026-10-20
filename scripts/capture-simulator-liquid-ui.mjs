// Visual correctness capture only: actual UI/collision/WGSL on software WebGPU.
// Hold the animation loop after the collision; do not infer native FPS from this.
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {writeFileSync,mkdirSync} from 'node:fs';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const root=resolve(option('--output','/tmp/simulator-liquid-ui'));mkdirSync(root,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:1440,height:1100}});
 await p.addInitScript(()=>{
  const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(window.__captureHold&&cb.name==='mainLoop')return;cb(t);});
  const get=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,...args){
   if(type==='webgpu')window.__ctxSeen=this.id;
   if(type!=='webgpu'||this.id!=='gpuCanvas')return get.call(this,type,...args);
   const canvas=this;let d,f,t;
   return {configure(o){d=o.device;f=o.format;window.__uiGPU={device:d,get texture(){return t;}};},getCurrentTexture(){
    if(!t||t.width!==canvas.width||t.height!==canvas.height){t?.destroy();t=d.createTexture({size:[canvas.width,canvas.height],format:f,usage:GPUTextureUsage.COPY_SRC|GPUTextureUsage.RENDER_ATTACHMENT});}return t;
   },unconfigure(){t?.destroy();}};
  };
 });
 await p.goto(option('--url','http://localhost:8000')+'/?renderer=gpu&debugMode=quiet&quality=balanced');
 await p.waitForFunction(()=>!!window.__uiGPU?.texture,null,{timeout:30000});
 
 await p.evaluate(async()=>{
  const s=window.state;window.__captureHold=true;s.debug.faults.isFrozen=true;
  const {initializeCarBody}=await import('/js/physics/index.js');initializeCarBody(0,1);
  Object.assign(s.body,{centerX:0,centerY:1,heading:0,velocityX:0,velocityY:-22,speed:22});Object.assign(s.camera,{x:0,y:0,zoom:2.5});
  const w=s.wheels.frontLeft;for(const wheel of Object.values(s.wheels))wheel.prevY=wheel.y+.22;
  s.balloons=[{x:w.x,y:w.y,radius:.6,hue:0,isPopped:false,deformTime:0,deformScale:1,deformDir:{x:0,y:0}}];s.params.smokeEnabled=false;s.params.showTrailArrows=false;s.params.motionBlurIntensity=0;s.screenShake.magnitude=0;
  const {checkBalloonCollisions}=await import('/js/balloon.js');checkBalloonCollisions(.01,0);
 });
 const results=[];
 for(const time of [.7,5,70,300]){
  results.push(await p.evaluate(async(time)=>{
   const gpu=await import('/js/gpu-renderer.js'),s=window.state;s.loop.simulationTime=time;s.screenShake.magnitude=0;
   const overlay=document.getElementById('simCanvas'),hud=overlay.getContext('2d');hud.clearRect(0,0,overlay.width,overlay.height);(await import('/js/renderer/hud.js')).drawScoreHud(hud,overlay.width,overlay.height);
   const c=document.getElementById('gpuCanvas');gpu.renderFrameGPU(c.clientWidth,c.clientHeight);
   const {device:d,texture:t}=window.__uiGPU,stride=Math.ceil(t.width*4/256)*256,r=d.createBuffer({size:stride*t.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   const e=d.createCommandEncoder();e.copyTextureToBuffer({texture:t},{buffer:r,bytesPerRow:stride},[t.width,t.height]);d.queue.submit([e.finish()]);await r.mapAsync(GPUMapMode.READ);
   const source=new Uint8Array(r.getMappedRange()),pixels=new Uint8ClampedArray(t.width*t.height*4);
   for(let y=0;y<t.height;y++)pixels.set(source.subarray(y*stride,y*stride+t.width*4),y*t.width*4);
   if(t.format==='bgra8unorm')for(let i=0;i<pixels.length;i+=4){const red=pixels[i];pixels[i]=pixels[i+2];pixels[i+2]=red;}
   r.unmap();r.destroy();const ctx=c.getContext('2d');ctx.putImageData(new ImageData(pixels,t.width,t.height),0,0);
   return {time,stats:gpu.getGPURenderStats(),score:s.score};
  },time));
  await p.locator('#gpuCanvas').screenshot({path:`${root}/simulator-${time}.png`});
 }
 await p.locator('[data-system="Rendering"]').count().then(async count=>{if(count)await p.locator('[data-system="Rendering"]').click();});
 await p.waitForTimeout(900);await p.locator('#search').fill('liquid');await p.waitForTimeout(900);await p.locator('#cardsContainer').screenshot({path:`${root}/controls.png`});
 writeFileSync(`${root}/measurements.json`,JSON.stringify(results,null,2));
}finally{await b.close();}
