import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
const root=process.env.PERF_SOURCE?pathToFileURL(process.env.PERF_SOURCE+'/'):new URL('../../',import.meta.url),server=createServer(async(req,res)=>{try{const p=req.url==='/'?'index.html':req.url.slice(1);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL(p,root)));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const results=[];
const profiling=process.env.CPU_PROFILE==='1';
const duration=Number(process.env.PHASE_MS||2000),out=process.env.PERF_OUT||'/tmp/e11-browser-performance';
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--enable-unsafe-swiftshader']});
 for(const kind of (process.env.PERF_KINDS||'e10,flat,road').split(',')){
 const path=kind==='e10'?'four-corner-load-transfer':'procedural-terrain',page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.frameTimes=[];const raf=requestAnimationFrame.bind(window);let previous;window.requestAnimationFrame=callback=>raf(t=>{if(previous!==undefined)frameTimes.push(t-previous);previous=t;callback(t);});});
 await page.goto(`http://127.0.0.1:${server.address().port}/${path}/index.html`);await page.evaluate(async path=>window.app=await import(`/${path}/src/main.js`),path);
 if(kind!=='e10'&&process.env.PHYSICS_HZ)await page.selectOption('#physics-frequency',process.env.PHYSICS_HZ);
 if(kind==='road'){await page.selectOption('#terrain','road');await page.locator('#parked-first').click();}
 const session=await page.context().newCDPSession(page);await session.send('Profiler.enable');await session.send('Performance.enable');if(profiling)await session.send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});if(profiling)await session.send('Profiler.start');
 for(const phase of ['stationary','starter','accelerate-steer','brake','selector']){
 if(phase==='starter')await page.keyboard.down('e');
 if(phase==='accelerate-steer'){await page.keyboard.up('e');await page.locator('#engagement').evaluate(e=>e.value='.3');await page.keyboard.down('w');await page.keyboard.down('a');}
 if(phase==='brake'){await page.keyboard.up('w');await page.keyboard.up('a');await page.keyboard.down('s');}
 if(phase==='selector'){await page.keyboard.up('s');await page.keyboard.down('1');}
 const start=await page.evaluate(()=>{frameTimes=[];return {clock:app.runtimeSnapshot(),time:performance.now(),state:app.simulationSnapshot()};});
 if(phase==='starter'&&process.env.REAL_START==='1')await page.waitForFunction(()=>app.simulationSnapshot().engine.mode==='running',null,{timeout:90000});
 else await new Promise(r=>setTimeout(r,duration));
 const end=await page.evaluate(()=>({clock:app.runtimeSnapshot(),time:performance.now(),state:app.simulationSnapshot(),renderer:app.rendererInfo(),frames:frameTimes}));
 results.push({kind,phase,start,end,errors:[...errors]});console.error(kind,phase,end.state.time,end.clock.clock.fault?.message||'ok');
 }
 if(profiling){const {profile}=await session.send('Profiler.stop');await writeFile(out+`-${kind}.cpuprofile`,JSON.stringify(profile));const allocation=await session.send('HeapProfiler.stopSampling');await writeFile(out+`-${kind}-allocations.json`,JSON.stringify(allocation));}await page.close();
 }
 await writeFile(out+'.json',JSON.stringify({browser:await browser.version(),duration,profiling,rendering:'headless Chromium SwiftShader, uncontrolled real RAF',results},null,2));
 console.log(out+'.json');
}finally{await browser?.close();server.close();}
