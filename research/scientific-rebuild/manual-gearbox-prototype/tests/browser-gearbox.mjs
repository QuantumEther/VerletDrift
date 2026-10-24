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
  await page.addInitScript(()=>{window.framesPending=[];window.requestAnimationFrame=fn=>window.framesPending.push(fn);});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.framesPending.length>0);
  const result=await page.evaluate(async()=>{
    const app=await import('/src/main.js');let time=performance.now();
    const tick=()=>{time+=100;window.framesPending.shift()(time);};
    const key=(type,value)=>window.dispatchEvent(new KeyboardEvent(type,{key:value}));
    const setE=e=>document.querySelector('#engagement').value=e;
    const snap=()=>app.simulationSnapshot();
    const assert=(v,m)=>{if(!v)throw new Error(m);};
    setE(1);key('keydown','w');for(let i=0;i<10;i++)tick();key('keyup','w');
    setE(0);key('keydown','n');assert(snap().gearbox.selected==='N','keyboard N');
    const before=snap();key('keydown','2');assert(snap().gearbox.selected==='N','reject mismatched shift');assert(snap().gearbox.reason.includes('mismatch'),'reason');
    assert(snap().gearbox.neutralOmega===before.gearbox.neutralOmega,'rejected shift changed speed');
    document.querySelector('#match').click();let waited=0;
    while(snap().gearbox.selected==='N'&&waited<200){tick();waited++;}
    assert(snap().gearbox.selected==='2','natural first-to-second shift');
    setE(1);for(let i=0;i<10;i++)tick();assert(snap().flywheel.state==='locked','reengagement');
    key('keydown','n');assert(snap().gearbox.selected==='2','clutch-open rule');
    const physics=JSON.stringify(snap());
    document.querySelector('#view').value='3d';document.querySelector('#view').dispatchEvent(new Event('change'));document.querySelector('#cutaway').value='xray';window.framesPending.shift()(time);
    assert(JSON.stringify(snap())===physics,'gearbox view mutated physics');
    setE(0);document.querySelector('#rest').click();key('keydown','n');key('keydown','2');assert(snap().gearbox.selected==='2','gear 2 at rest');
    setE(1);key('keydown','w');for(let i=0;i<10;i++)tick();key('keyup','w');assert(snap().v>0,'gear 2 propulsion');
    setE(0);document.querySelector('#rest').click();key('keydown','n');setE(1);key('keydown','w');for(let i=0;i<10;i++)tick();key('keyup','w');
    assert(Math.abs(snap().v)<1e-10,'neutral propelled vehicle');assert(snap().flywheel.omega>0,'neutral motor');
    return {status:'PASS',movingShiftWait_s:waited*.1,neutralEngine_rad_s:snap().flywheel.omega};
  });
  assert.deepEqual(errors,[]);assert.equal(await page.locator('#warning').textContent(),'');console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.close();
}
