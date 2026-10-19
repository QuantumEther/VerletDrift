// Controlled offscreen throughput test. Fences and dense timestamp sampling are
// diagnostic only; these are not native presentation/FPS measurements.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { offscreenSplash } from '../tests/e2e/helpers/splash-gpu.js';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const backend=option('--backend','software');
const browser=await chromium.launch({headless:!process.argv.includes('--headed'),executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:backend==='software'?['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']:JSON.parse(option('--browser-args','[]'))});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await offscreenSplash(page);
 await page.goto(`${option('--url','http://localhost:8000')}/experiments/splash-lab/?paused=1&time=.3&quality=${option('--quality','balanced')}&seed=${option('--seed','1337')}`);
 if(!await page.evaluate(()=>window.splashLab.ready))throw Error(await page.locator('#failure').textContent());
 await page.waitForFunction(()=>window.splashLab.renderer.stats.frames>0);
 const result=await page.evaluate(async ({samples,selected})=>{
  const {renderer:r,getSettings}=window.splashLab,settings=getSettings();
  const summarize=v=>{const a=v.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?{samples:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],mean:a.reduce((x,y)=>x+y,0)/a.length}:null;};
  const phases=[];
  for(const [name,time] of [['approach',.3],['peak',1.25],['landing',1.85],['wet',5],['drying',18],['dry',45]].filter(([name])=>!selected.length||selected.includes(name))){
   const measurements={cpu:[],completed:[],scene:[],air:[],deposition:[]};
   const timers=[['scene',r.sceneTimer],['air',r.liquidTimer],['deposition',r.groundTimer]].filter(([,t])=>t);
   const before=r.getStats();
   for(let i=0;i<samples+2;i++){
    // Resolve earlier timer maps, then request a timestamp for this frame.
    for(const [,t] of timers){while(t.pending)await new Promise(resolve=>setTimeout(resolve,0));t.frame=29;}
    const counts=timers.map(([,t])=>t.sampleCount),start=performance.now();
    r.render(time+i*.002,settings);const cpu=performance.now()-start;
    await r.device.queue.onSubmittedWorkDone();const completed=performance.now()-start;
    for(const [,t] of timers){while(t.pending)await new Promise(resolve=>setTimeout(resolve,0));}
    if(r.stats.error)throw Error(r.stats.error);
    if(i>=2){measurements.cpu.push(cpu);measurements.completed.push(completed);timers.forEach(([key,t],j)=>{if(t.sampleCount>counts[j])measurements[key].push(t.milliseconds);});}
   }
   phases.push({name,time,stats:r.getStats(),allocationsAdded:r.stats.resourceAllocations-before.resourceAllocations,measurements:Object.fromEntries(Object.entries(measurements).map(([k,v])=>[k,summarize(v)]))});
  }
  return {settings,phases};
 },{samples:Math.max(3,Number(option('--samples','9'))),selected:option('--phases','').split(',').filter(Boolean)});
 const output={backend,scope:'Offscreen WGSL. Dense asynchronous GPU timestamps per pass; CPU encoding and fenced completion measured separately. Excludes presentation. Software GPU results do not predict hardware speedups.',...result,errors};
 writeFileSync(option('--output','/tmp/splash-benchmark.json'),JSON.stringify(output,null,2));
 console.log(JSON.stringify(output,null,2));
} finally {await browser.close();}
