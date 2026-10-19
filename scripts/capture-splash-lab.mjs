// Real offscreen WGSL captures + bounded completed-frame benchmark, not native
// presentation/FPS qualification. Serve the repo first, then run this script.
import { chromium } from '@playwright/test';
import { DEFAULTS } from '../experiments/splash-lab/scene.js';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { offscreenSplash,splashPixels,seekSplash,groundPixels } from '../tests/e2e/helpers/splash-gpu.js';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const root=resolve(option('--output','/tmp/splash-lab-capture'));mkdirSync(root,{recursive:true});
const backend=option('--backend','software');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:backend==='software'?['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await offscreenSplash(page);
 const query=new URLSearchParams({time:'.3',paused:'1',quality:option('--quality','balanced')});
 for(const key of Object.keys(DEFAULTS))if(option(`--${key}`,null)!==null)query.set(key,option(`--${key}`,null));
 await page.goto(`${option('--url','http://localhost:8000')}/experiments/splash-lab/?${query}`);
 if(!await page.evaluate(()=>window.splashLab.ready))throw Error(await page.locator('#failure').textContent());
 await page.waitForFunction(()=>window.splashLab.renderer.stats.frames>0);
 const camera={zoom:Number(option('--zoom','1')),x:option('--focus-x',null),y:option('--focus-y',null)};
 if(camera.zoom!==1||camera.x!==null||camera.y!==null)await page.evaluate(camera=>{
  // Capture-only camera framing; no change to motion, deposition or app controls.
  const renderer=window.splashLab.renderer;renderer.terrainKey=null;const write=renderer.device.queue.writeBuffer.bind(renderer.device.queue);
  renderer.device.queue.writeBuffer=(buffer,offset,data,...rest)=>{
   if(buffer===renderer.uniformBuffer){
    const view=new Float32Array(data);view[2]*=camera.zoom;
    if(camera.x!==null)view[26]=Number(camera.x);if(camera.y!==null)view[27]=Number(camera.y);
    return write(buffer,offset,view,...rest);
   }
   return write(buffer,offset,data,...rest);
  };
 },camera);
 const phases=[];
 for(const time of option('--times','.3,.70,.95,1.25,1.85,2.9,5,8').split(',').map(Number)){
  await seekSplash(page,time);const pixels=await splashPixels(page,true);
  await page.screenshot({path:resolve(root,`time-${time}.png`)});
  const ground=await page.evaluate(()=>!!window.splashLab.renderer.groundTexture)?await groundPixels(page):null;
  phases.push({time:await page.evaluate(()=>window.splashLab.clock.time),requestedTime:time,...pixels,ground});
 }
 const benchmark=Number(option('--frames','60'))===0?null:await page.evaluate(async ({frames,settled})=>{
  const lab=window.splashLab,renderer=lab.renderer,settings=lab.getSettings();
  const cpu=[],completed=[],scene=[],liquid=[],deposition=[];let sampled=0,groundSamples=0;
  const allocations=renderer.stats.resourceAllocations,rebuilds=renderer.stats.depositionRebuilds??null;
  for(let i=0;i<frames;i++){
   const start=performance.now();renderer.render(settled?4.2+i/(frames-1)*3.8:.55+i/(frames-1)*2.2,settings);const encoded=performance.now();
   await renderer.device.queue.onSubmittedWorkDone(); // Diagnostic only, never the live rAF path.
   if(i>=6){cpu.push(encoded-start);completed.push(performance.now()-start);}
   const stats=renderer.getStats();
   if(stats.depositionTimestampSamples>groundSamples){deposition.push(stats.depositionGpuMs);groundSamples=stats.depositionTimestampSamples;}
   if(stats.gpuTimestampSamples>sampled){scene.push(stats.sceneGpuMs);liquid.push(stats.splashGpuMs);sampled=stats.gpuTimestampSamples;}
  }
  const summarize=values=>{
   const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;
   return {samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],mean:a.reduce((x,y)=>x+y,0)/a.length};
  };
  return {settled,scope:'Offscreen real WGSL. CPU encode excludes GPU completion; completed-frame latency includes an explicit benchmark-only fence. GPU timestamps cover separate deposition (when available), scene and airborne passes, excluding browser presentation. No native speedup or display-FPS claim.',settings,stats:renderer.getStats(),cpuEncodeMs:summarize(cpu),completedFrameMs:summarize(completed),gpuSceneMs:summarize(scene),gpuLiquidMs:summarize(liquid),gpuDepositionMs:summarize(deposition),allocationsBefore:allocations,allocationsAfter:renderer.stats.resourceAllocations,depositionRebuildsBefore:rebuilds,depositionRebuildsAfter:renderer.stats.depositionRebuilds??null};
 },{frames:Math.max(12,Number(option('--frames','60'))),settled:process.argv.includes('--settled')});
 writeFileSync(resolve(root,'measurements.json'),JSON.stringify({requestedBackend:backend,captureCamera:camera,phases,benchmark,errors},null,2));
 console.log(JSON.stringify({benchmark,errors},null,2));
}finally{await browser.close();}
