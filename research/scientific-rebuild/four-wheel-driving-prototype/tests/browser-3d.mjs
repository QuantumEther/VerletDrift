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
    const app=await import('/src/main.js');
    const tick=time=>{const fn=window.framesPending.shift();if(!fn)throw new Error('Frame loop stopped');fn(time);};
    let time=performance.now();tick(time);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'}));
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'a'}));
    for(let i=0;i<150;i++){time+=16;tick(time);}
    window.dispatchEvent(new KeyboardEvent('keyup',{key:'a'}));
    const before=app.simulationSnapshot();
    const timings=[];
    for(const view of ['3d','side','top','3d']){
      const select=document.querySelector('#view');select.value=view;select.dispatchEvent(new Event('change'));
      const start=performance.now();tick(time);timings.push(performance.now()-start);
      if(JSON.stringify(app.simulationSnapshot())!==JSON.stringify(before))throw new Error('View changed physics');
    }
    document.querySelector('#reset-camera').click();tick(time);
    const start=performance.now();
    for(let i=0;i<120;i++){time+=16;tick(time);}
    return {status:'PASS',heading:before.planar.heading,wheelAngles:before.wheels.map(w=>w.angle),viewSwitchMs:timings,mean3dFrameMs:(performance.now()-start)/120};
  });
  assert.ok(result.heading>0);assert.ok(result.wheelAngles.every(a=>a>0));
  assert.equal(await page.locator('#warning').textContent(),'');
  assert.deepEqual(errors,[]);
  const canvas=page.locator('#perspective');await canvas.screenshot({path:'/tmp/mission301-3d.png'});
  const beforeOrbit=await canvas.screenshot();const box=await canvas.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+30,{steps:5});await page.mouse.up();await page.mouse.wheel(0,100);
  await page.evaluate(()=>{window.framesPending.shift()(performance.now()+4000);});
  assert.ok(!beforeOrbit.equals(await canvas.screenshot()));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.close();
}
