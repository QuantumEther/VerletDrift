import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Uses the repository's existing Playwright installation; no new dependencies.
const root = new URL('file://'+process.argv[2]+'/');
const server = createServer(async (request, response) => {
  try {
    const path = request.url === '/' ? 'index.html' : request.url.slice(1);
    const file = new URL(path, root);
    if (!file.href.startsWith(root.href)) throw new Error('Invalid path');
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, args:['--enable-unsafe-swiftshader'], executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(()=>{window.pending=[];window.requestAnimationFrame=fn=>window.pending.push(fn);});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.pending.length>0);
  const result=await page.evaluate(async()=>{
    const app=await import('/src/main.js');const view=document.querySelector('#view');view.value='3d';view.dispatchEvent(new Event('change'));
    const canvas=document.querySelector('#perspective');canvas.style.width='800px';canvas.style.height='450px';
    let time=performance.now();const run=dt=>{time+=dt;const t=performance.now();window.pending.shift()(time);return performance.now()-t;};
    const init=run(16);for(let i=0;i<5;i++)run(16);
    const samples=[],accepted=[],start=app.simulationSnapshot().time;
    for(let i=0;i<100;i++){
      const key=i%10<5?'1':'2';window.dispatchEvent(new KeyboardEvent('keyup',{key:key==='1'?'2':'1'}));window.dispatchEvent(new KeyboardEvent('keydown',{key}));
      document.querySelector('#engagement').value=i%10<5?1:0;window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}));
      const before=app.simulationSnapshot().time;samples.push(run(16));accepted.push(Math.round((app.simulationSnapshot().time-before)/.001));
    }
    const stall=run(1000),end=app.simulationSnapshot().time,sorted=[...samples].sort((a,b)=>a-b);
    return {frames:100,canvas:'800x450 CSS pixels, headless software WebGL',initMs:init,meanCPUFrameMs:samples.reduce((a,b)=>a+b)/samples.length,p95CPUFrameMs:sorted[95],worstCPUFrameMs:sorted.at(-1),postStallCPUFrameMs:stall,simulatedDuringReplay_s:end-start,meanStepsPerFrame:accepted.reduce((a,b)=>a+b)/100,worstStepsPerFrame:Math.max(...accepted)};
  });console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.close();
}
