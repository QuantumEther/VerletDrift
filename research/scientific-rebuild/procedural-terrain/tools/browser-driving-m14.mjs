import {createServer} from 'node:http';import {readFile,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';import {chromium} from 'playwright';
const roots={before:pathToFileURL((process.env.M14_BASE||'/tmp/m14-base')+'/research/scientific-rebuild/'),after:new URL('../../',import.meta.url)},results=[];
const server=createServer(async(req,res)=>{try{const [kind,...parts]=req.url.split('?')[0].slice(1).split('/'),p=parts.join('/');res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL(p,roots[kind])));}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']});
 for(const kind of ['before','after']){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.frames=[];let previous;const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>raf(t=>{if(previous!==undefined)frames.push({dt:t-previous});previous=t;callback(t);if(frames.length&&window.app)frames.at(-1).renderMs=app.runtimeSnapshot().renderMs;});});
  const path=`/${kind}/procedural-terrain`;await page.goto(`http://127.0.0.1:${server.address().port}${path}/index.html`);await page.evaluate(async path=>window.app=await import(path+'/src/main.js'),path);
  const backend=await page.evaluate(()=>{const gl=document.querySelector('#perspective').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  await page.selectOption('#view','top');await page.selectOption('#terrain','road');
  for(const hz of [1000,500,250]){
   await page.keyboard.up('w');await page.keyboard.up('a');await page.keyboard.up('s');await page.selectOption('#physics-frequency',String(hz));await page.locator('#parked-first').click();
   await page.keyboard.down('e');await page.waitForFunction(()=>app.simulationSnapshot().engine.mode==='running'||app.runtimeSnapshot().clock.fault,null,{timeout:30000});await page.keyboard.up('e');
   await page.locator('#engagement').evaluate(e=>{e.value='.3';e.dispatchEvent(new Event('input',{bubbles:true}));});
   for(const phase of ['acceleration','steering','braking']){
    if(phase==='acceleration')await page.keyboard.down('w');if(phase==='steering')await page.keyboard.down('a');if(phase==='braking'){await page.keyboard.up('w');await page.keyboard.up('a');await page.keyboard.down('s');}
    const start=await page.evaluate(()=>{frames=[];return {at:performance.now(),clock:app.runtimeSnapshot().clock,state:app.simulationSnapshot()};});await page.waitForTimeout(2000);
    const end=await page.evaluate(()=>({at:performance.now(),clock:app.runtimeSnapshot().clock,state:app.simulationSnapshot(),frames,renderer:app.rendererInfo(),heap:performance.memory?.usedJSHeapSize??null}));results.push({kind,hz,phase,backend,errors:[...errors],start,end});console.error(kind,hz,phase,end.state.time,end.clock.fault?.message||'pass');
   }
  }
  await page.close();
 }
 await writeFile(new URL('../results/performance-m14/browser-driving.json',import.meta.url),JSON.stringify({browser:await browser.version(),protocol:'One sequential before/after real-RAF top-view run per rate; engine actually started, first dogs stationary engaged, torque through clutch; 2s wall per phase; 3D backend initialized but hidden. Observational, not a high-confidence timing interval.',results}));console.log('saved browser-driving.json');
}finally{await browser?.close();server.close();}
