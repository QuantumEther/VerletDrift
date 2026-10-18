// Real offscreen WGSL captures + bounded completed-frame benchmark, not native
// presentation/FPS qualification. Serve the repo first, then run this script.
import { chromium } from '@playwright/test';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { offscreenSplash,splashPixels,seekSplash } from '../tests/e2e/helpers/splash-gpu.js';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const root=resolve(option('--output','/tmp/splash-lab-capture'));mkdirSync(root,{recursive:true});
const backend=option('--backend','software');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:backend==='software'?['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await offscreenSplash(page);
 await page.goto(`${option('--url','http://localhost:8000')}/experiments/splash-lab/?time=.3&paused=1&quality=${option('--quality','balanced')}`);
 if(!await page.evaluate(()=>window.splashLab.ready))throw Error(await page.locator('#failure').textContent());
 await page.waitForFunction(()=>window.splashLab.renderer.stats.frames>0);
 const phases=[];
 for(const time of [.3,.70,.95,1.25,1.85,2.9]){
  await seekSplash(page,time);const pixels=await splashPixels(page,true);
  await page.screenshot({path:resolve(root,`time-${time}.png`)});phases.push({time,...pixels});
 }
 const benchmark=await page.evaluate(async frames=>{
  const lab=window.splashLab,renderer=lab.renderer,settings=lab.getSettings();
  const cpu=[],completed=[],scene=[],liquid=[];let sampled=0;
  const allocations=renderer.stats.resourceAllocations;
  for(let i=0;i<frames;i++){
   const start=performance.now();renderer.render(.55+i/(frames-1)*2.2,settings);const encoded=performance.now();
   await renderer.device.queue.onSubmittedWorkDone(); // Diagnostic only, never the live rAF path.
   if(i>=6){cpu.push(encoded-start);completed.push(performance.now()-start);}
   const stats=renderer.getStats();
   if(stats.gpuTimestampSamples>sampled){scene.push(stats.sceneGpuMs);liquid.push(stats.splashGpuMs);sampled=stats.gpuTimestampSamples;}
  }
  const summarize=values=>{
   const a=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!a.length)return null;
   return {samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],mean:a.reduce((x,y)=>x+y,0)/a.length};
  };
  return {scope:'Offscreen real WGSL. CPU encode excludes GPU completion; completed-frame latency includes an explicit benchmark-only fence. GPU timestamps cover separate scene/liquid passes, excluding browser presentation. No native speedup or display-FPS claim.',settings,stats:renderer.getStats(),cpuEncodeMs:summarize(cpu),completedFrameMs:summarize(completed),gpuSceneMs:summarize(scene),gpuLiquidMs:summarize(liquid),allocationsBefore:allocations,allocationsAfter:renderer.stats.resourceAllocations};
 },Math.max(12,Number(option('--frames','60'))));
 writeFileSync(resolve(root,'measurements.json'),JSON.stringify({requestedBackend:backend,phases,benchmark,errors},null,2));
 console.log(JSON.stringify({benchmark,errors},null,2));
}finally{await browser.close();}
