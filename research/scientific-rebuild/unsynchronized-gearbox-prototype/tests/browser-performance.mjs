import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
// Real RAF / wall-clock observation, kept distinct from CPU submission replay.
const root=process.argv[2]?new URL('file://'+process.argv[2]+'/'):new URL('../',import.meta.url),server=createServer(async(req,res)=>{try{const path=req.url==='/'?'index.html':req.url.slice(1),file=new URL(path,root);if(!file.href.startsWith(root.href))throw new Error('path');res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const raf=requestAnimationFrame;window.framesMeasured=[];window.measuring=false;window.requestAnimationFrame=callback=>raf(time=>{const t=performance.now();callback(time);if(window.measuring)window.framesMeasured.push({time,cpu:performance.now()-t});});});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>document.querySelector('#actual-gear').textContent.includes('Gear'));
 const expandable=await page.locator('#experiments').count();if(expandable)await page.locator('#experiments summary').click();await page.locator('#moving-second').click();if(expandable)await page.locator('#experiments summary').click();await page.locator('#engagement').fill('1');await page.keyboard.down('w');await page.keyboard.down('a');
 await page.waitForTimeout(2000);
 const start=await page.evaluate(async()=>{const app=await import('/src/main.js');window.measuring=true;window.framesMeasured=[];return {wall:performance.now(),sim:app.simulationSnapshot().time,runtime:app.runtimeSnapshot()};});
 await page.waitForTimeout(5000);
 const result=await page.evaluate(async start=>{window.measuring=false;const app=await import('/src/main.js'),a=window.framesMeasured,wall=(performance.now()-start.wall)/1000,state=app.simulationSnapshot(),runtime=app.runtimeSnapshot();const intervals=a.slice(1).map((s,i)=>s.time-a[i].time),cpu=a.map(s=>s.cpu);const stats=v=>{const q=[...v].sort((a,b)=>a-b);return {mean:v.reduce((x,y)=>x+y,0)/v.length,p95:q[Math.floor(.95*q.length)],worst:q.at(-1)};};const gl=document.querySelector('#perspective').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {wallSeconds:wall,observedFrames:a.length,framesPerWallSecond:a.length/wall,stepsPerWallSecond:(runtime.clock.accepted-start.runtime.clock.accepted)/wall,simulatedSeconds:state.time-start.sim,slowWallSeconds:runtime.clock.dilated-start.runtime.clock.dilated,cpuCallbackMs:stats(cpu),rafIntervalMs:stats(intervals),renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),runtime,viewport:{width:innerWidth,height:innerHeight},status:runtime.clock.fault?'FAIL':'PASS'};},start);
 assert.deepEqual(errors,[]);assert.equal(result.status,'PASS');console.log(JSON.stringify({browser:await browser.version(),warmupSeconds:2,workload:'Moving in second, clutch closed, held W+A, default workshop view; real RAF',...result}));
}finally{await browser?.close();server.close();}
