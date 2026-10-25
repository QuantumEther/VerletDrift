import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Uses the repository's existing Playwright installation; no new dependencies.
const root = new URL('../', import.meta.url);
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
  await page.addInitScript(()=>{const Base=window.AudioContext;window.audioStarts=0;window.AudioContext=class extends Base{createOscillator(){const n=super.createOscillator(),start=n.start.bind(n);n.start=(...args)=>{window.audioStarts++;return start(...args);};return n;}};window.framesPending=[];window.requestAnimationFrame=fn=>window.framesPending.push(fn);});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.framesPending.length>0);
  await page.locator('#audio').check();
  const result=await page.evaluate(async()=>{
    const app=await import('/src/main.js');let time=performance.now();window.framesPending.shift()(time);
    const tick=ms=>{time+=ms;window.framesPending.shift()(time);};
    const advance=ms=>{while(ms>0){const h=Math.min(ms,10);tick(h);ms-=h;}};
    const key=(type,k)=>window.dispatchEvent(new KeyboardEvent(type,{key:k}));
    const snapshot=()=>app.simulationSnapshot();const check=(v,m)=>{if(!v)throw new Error(m);};
    const E=e=>document.querySelector('#engagement').value=e;
    const trial=blip=>{
      document.querySelector('#moving-second').click();E(0);
      key('keydown','n');advance(250);key('keyup','n');check(snapshot().gearbox.selected==='N','neutral lever');
      if(blip){E(1);document.querySelector('#drive').value=30;key('keydown','w');advance(102);key('keyup','w');E(0);}
      const before=snapshot().gearbox.impactHeat;key('keydown','1');advance(30);key('keyup','1');check(snapshot().gearbox.selected==='1','mechanical first engagement '+blip+' '+JSON.stringify({g:snapshot().gearbox,w:snapshot().wheels.map(w=>[w.omega,w.angle])}));
      return snapshot().gearbox.impactHeat-before;
    };
    document.querySelector('#differential').value='open';
    const clean=trial(true),harsh=trial(false);check(clean<.02&&harsh>clean*50,'technique shock comparison');
    document.querySelector('#worn').checked=true;document.querySelector('#worn').dispatchEvent(new Event('change'));E(0);key('keydown','2');advance(300);check(snapshot().gearbox.selected==='2','worn second selection');
    document.querySelector('#drive').value=20;E(1);key('keydown','w');advance(500);check(snapshot().gearbox.selected==='2','hand pressure holds');key('keyup','2');advance(600);check(snapshot().gearbox.selected==='N','load ejects worn gear');key('keyup','w');
    check(!document.querySelector('#match')&&!document.querySelector('#mismatch'),'no matching assistant');
    check(!document.querySelector('#inspection').open,'developer data hidden');
    return {status:'PASS',cleanImpact_J:clean,harshImpact_J:harsh,contacts:snapshot().gearbox.impactCount};
  });
  assert.ok(await page.evaluate(()=>window.audioStarts>0));
  await page.locator('#audio').uncheck();assert.deepEqual(errors,[]);assert.equal(await page.locator('#warning').textContent(),'');console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.close();
}
