import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=new URL('../../',import.meta.url),server=createServer(async(req,res)=>{try{const p=req.url.split('?')[0].slice(1);res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL(p,root)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const results=[];let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--enable-unsafe-swiftshader']});
 for(let repeat=0;repeat<3;repeat++)for(const batched of repeat%2?[true,false]:[false,true]){
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.samples=[];let previous;window.requestAnimationFrame=fn=>raf(t=>{if(previous!==undefined)window.samples.push({dt:t-previous});previous=t;const a=performance.now();fn(t);if(window.samples.length)Object.assign(window.samples.at(-1),{callbackMs:performance.now()-a,renderMs:window.app?.runtimeSnapshot().renderMs});});});
  await page.goto(`http://127.0.0.1:${server.address().port}/procedural-terrain/index.html${batched?'':'?unbatched'}`);
  await page.evaluate(async()=>{window.app=await import('/procedural-terrain/src/main.js');document.querySelector('#pause').click();const c=document.querySelector('#perspective');c.style.width='800px';c.style.height='500px';});
  const backend=await page.evaluate(()=>{const gl=document.querySelector('#perspective').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:e?gl.getParameter(e.UNMASKED_VENDOR_WEBGL):null};});
  for(const mode of ['normal','xray']){
   await page.selectOption('#cutaway',mode);await page.evaluate(()=>app.recreateRenderer());await page.waitForTimeout(1000);
   const frozen=await page.evaluate(()=>app.simulationSnapshot());await page.evaluate(()=>window.samples=[]);await page.waitForTimeout(2500);
   if(repeat===1)await page.locator('#perspective').screenshot({path:new URL(`../results/performance-m14/${mode}-${batched?'batched':'original'}.png`,import.meta.url).pathname});
   const data=await page.evaluate(()=>({samples:window.samples,renderer:app.rendererInfo(),presentation:app.presentationSnapshot(),state:app.simulationSnapshot()}));assert.deepEqual(data.state,frozen);
   results.push({repeat,batched,mode,backend,errors:[...errors],...data});assert.deepEqual(errors,[]);
  }
  await page.close();
 }
 await writeFile(new URL('../results/performance-m14/browser-rendering.json',import.meta.url),JSON.stringify({browser:await browser.version(),protocol:'Paused identical state, 800x500 canvas, 1s warmup then 2.5s real RAF; alternating order; repeat zero warmup; software GPU, no GPU-time query',results}));
 console.log('PASS rendering and state preservation');
}finally{await browser?.close();server.close();}
