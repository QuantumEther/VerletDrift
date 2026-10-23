// Real RAF and real input events, with CDP timeline/GC observation. No manual
// timestamp replay. This measures browser cadence, not physical display scanout.
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {instrument,installProfiler} from './instrument.mjs';
import {installDriver} from './browser.mjs';
import {install} from '../vehicle-audit/browser-harness.mjs';
const baseline=process.argv.includes('--baseline'),inputDebug=process.argv.includes('--input-debug'),noTrace=process.argv.includes('--no-trace'),out=process.argv.find(s=>s.startsWith('--out='))?.slice(6)||'/tmp/mission7-interactive';
const originalArtwork=baseline?execFileSync('git',['show','e3cb371:js/renderer/vehicle-sprites.js'],{encoding:'utf8'}):null;
const root=resolve('.'),mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wgsl':'text/plain'};
const server=createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://local');let p=decodeURIComponent(u.pathname);if(p.endsWith('/'))p+='index.html';
 const local=resolve(root,'.'+p);if(!local.startsWith(root+'/'))throw Error('Path escape');
 let body=baseline&&p==='/js/renderer/vehicle-sprites.js'?originalArtwork:await readFile(local);if(!u.searchParams.has('auditReset')&&['/js/main.js','/js/physics/tires.js','/js/physics/wheel.js','/js/renderer/vehicle-sprites.js'].includes(p))body=instrument(p.slice(1),body.toString());
 res.writeHead(200,{'Content-Type':mime[extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
}catch(e){res.writeHead(404);res.end(e.message);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--disable-gpu','--enable-precise-memory-info']});
const results=[];
try{
 for(const name of ['idle','straight','gradual-power','countersteer','turn-brake']){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],roundTrips=[],responses=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   const native=requestAnimationFrame.bind(window);let queued=[],gate=true;
   window.requestAnimationFrame=cb=>{if(gate){queued.push(cb);return queued.length;}return native(cb);};
   window.__resume=()=>{gate=false;for(const cb of queued)native(cb);queued=[];};
   window.__longTasks=[];try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(__longTasks.length<1000)__longTasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
  });
  await page.addInitScript(installProfiler);
  await page.goto(`${base}?renderer=canvas&debugMode=quiet${inputDebug?'&inputDebug=1':''}`);await page.waitForFunction(()=>Boolean(window.state),{},{polling:50});
  await page.evaluate(async({driver,source,base,name})=>{
   const d=await(new Function(`return (${driver})`)())({installSource:source,base});
   d.reset({speed:name==='idle'?0:15,gear:name==='idle'?'N':'2',pedal:1,events:[]});
   window.__resume();
  },{driver:installDriver.toString(),source:install.toString().replace('${base}js/main.js','${base}js/main.js?auditReset=1'),base,name});
  await page.waitForTimeout(500);
  const cdp=await context.newCDPSession(page);
  if(!noTrace)await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.gc',transferMode:'ReturnAsStream'});
  const captureStart=await page.evaluate(()=>{__corneringProfile.reset();__longTasks.length=0;return {time:performance.now(),heap:performance.memory?.usedJSHeapSize,sim:state.loop.simulationTime,dropped:state.loop.droppedSubsteps};});
  await page.locator('#simCanvas').scrollIntoViewIfNeeded();const box=await page.locator('#simCanvas').boundingBox(),x=box.x+150,y=box.y+250;
  await page.mouse.move(x,y);
  if(['gradual-power','countersteer'].includes(name))await page.keyboard.down('KeyD');
  if(name==='turn-brake'){await page.keyboard.down('KeyA');await page.keyboard.down('KeyS');}
  if(!['idle','straight'].includes(name)){
   await page.mouse.down({button:'right'});
   for(let i=1;i<=12;i++){
    const target=name==='countersteer'?(i%2?60:-60):Math.min(150,i*12),begin=performance.now();
    await page.mouse.move(x+target,y);roundTrips.push(performance.now()-begin);
    const pending=await page.evaluate(()=>({command:state.steering.wheelAngle,time:state.loop.simulationTime}));
    await page.waitForTimeout(150);
    responses.push(await page.evaluate(pending=>({pending,road:state.steering.frontWheelAngle,expected:pending.command/(Math.PI*2.5)*state.params.maxFrontWheelAngle,simTime:state.loop.simulationTime,held:state.input.throttleKeyHeld,clutch:state.input.clutchKeyHeld,brake:state.input.brakeKeyHeld}),pending));
    if(i===6){await page.mouse.up({button:'right'});await page.mouse.down({button:'right'});}
   }
   await page.mouse.up({button:'right'});
  }else await page.waitForTimeout(2000);
  await page.waitForTimeout(500);
  for(const key of ['KeyD','KeyS','KeyA'])await page.keyboard.up(key);
  const result=await page.evaluate(start=>({start,end:{time:performance.now(),heap:performance.memory?.usedJSHeapSize,sim:state.loop.simulationTime,dropped:state.loop.droppedSubsteps},
   profile:{ticks:__corneringProfile.ticks,frames:__corneringProfile.frames},longTasks:__longTasks,
   final:__cornerDriver.sample(),columns:__cornerDriver.columns}),captureStart);
  const traceSummary={};
  if(!noTrace){
  const finished=new Promise(r=>cdp.once('Tracing.tracingComplete',r));await cdp.send('Tracing.end');const {stream}=await finished;
  let trace='';for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(trace.length>64*1024*1024)throw Error('Trace size bound');if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
  const events=JSON.parse(trace).traceEvents;
  for(const e of events)if(e.ph==='X'&&Number.isFinite(e.dur)&&/GC|Layout|Paint|Raster|DrawFrame|FunctionCall/.test(e.name)){
   const s=traceSummary[e.name]??={count:0,totalMs:0,maxMs:0};s.count++;s.totalMs+=e.dur/1000;s.maxMs=Math.max(s.maxMs,e.dur/1000);
  }
  }
  Object.assign(result,{name,errors,eventRoundTripMs:roundTrips,responses,traceSummary});results.push(result);
  console.log(name,'frames',result.profile.frames.length,'sim/wall',(result.end.sim-result.start.sim)/((result.end.time-result.start.time)/1000),'longTasks',result.longTasks.length);
  await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
await writeFile(`${out}.json.gz`,gzipSync(JSON.stringify({baseline,inputDebug,traceEnabled:!noTrace,results})));
await writeFile(`${out}-summary.json`,JSON.stringify({results:results.map(({profile,...r})=>({...r,frames:profile.frames,tickMs:profile.ticks.map(t=>t.ms)}))},null,2));
