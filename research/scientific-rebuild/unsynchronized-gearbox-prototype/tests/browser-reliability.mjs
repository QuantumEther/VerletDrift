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
  page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>document.querySelector('#actual-gear').textContent.includes('Gear'));
  const api=expression=>page.evaluate(async expression=>{const m=await import('/src/main.js');return Function('m',expression)(m);},expression);
  await page.keyboard.down('1');await page.waitForTimeout(120);await page.keyboard.up('1');
  await page.locator('#engagement').fill('1');await page.keyboard.down('w');await page.waitForTimeout(400);await page.keyboard.up('w');
  const button=page.locator('[data-selector="2"]'),box=await button.boundingBox();
  await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(5,5);await page.mouse.up();
  assert.equal((await api('return m.runtimeSnapshot()')).pointers,0);
  await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.evaluate(()=>document.querySelector('[data-selector="2"]').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));assert.equal((await api('return m.runtimeSnapshot()')).pointers,0);await page.mouse.up();
  await page.keyboard.down('1');await page.locator('#rest').click();await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',repeat:true})));assert.deepEqual((await api('return m.runtimeSnapshot()')).keys,[]);await page.keyboard.up('1');
  await page.keyboard.down('2');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.deepEqual((await api('return m.runtimeSnapshot()')).keys,[]);await page.keyboard.up('2');
  for(let i=0;i<12;i++){await page.keyboard.down(i%2?'1':'2');await page.locator('#engagement').fill(i%2?'0':'1');await page.waitForTimeout(20);await page.keyboard.up(i%2?'1':'2');}
  const other=await browser.newPage();await other.bringToFront();await page.waitForTimeout(100);const realTabVisibility=await page.evaluate(()=>document.visibilityState);await page.bringToFront();await other.close();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(60);const hidden=await api('return m.runtimeSnapshot()');await page.waitForTimeout(150);assert.equal((await api('return m.runtimeSnapshot()')).clock.accepted,hidden.clock.accepted);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'injected recoverable fault'})));
  const fault=await api('return m.runtimeSnapshot()');assert.equal(fault.clock.status,'fault-paused');await page.waitForTimeout(100);assert.equal((await api('return m.runtimeSnapshot()')).clock.accepted,fault.clock.accepted);
  await page.locator('#rest').click();await page.waitForTimeout(100);assert.equal((await api('return m.runtimeSnapshot()')).clock.fault,null);
  await page.locator('#pause').click();await page.waitForTimeout(100);await page.selectOption('#view','top');
  await page.evaluate(()=>{const original=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=function(...args){CanvasRenderingContext2D.prototype.clearRect=original;throw new Error('injected draw fault');};});await page.waitForTimeout(100);assert.equal((await api('return m.runtimeSnapshot()')).clock.status,'fault-paused');await page.locator('#rest').click();await page.waitForTimeout(100);
  const state=await api('return m.simulationSnapshot()');
  for(const view of ['top','side','3d']){await page.selectOption('#view',view);await page.waitForTimeout(100);assert.deepEqual(await api('return m.simulationSnapshot()'),state);}
  for(const mode of ['normal','xray','driveline']){await page.selectOption('#cutaway',mode);await page.waitForTimeout(200);}
  await page.setViewportSize({width:1100,height:850});
  const memory=await api('return m.rendererInfo()');await page.waitForTimeout(500);assert.deepEqual(await api('return m.rendererInfo()'),memory);
  await api('m.recreateRenderer()');for(const mode of ['normal','xray','driveline']){await page.selectOption('#cutaway',mode);await page.waitForTimeout(200);}assert.deepEqual(await api('return m.simulationSnapshot()'),state);const rebuilt=await api('return m.rendererInfo()');assert.equal(rebuilt.sceneGeometries,memory.sceneGeometries);assert.equal(rebuilt.materials,memory.materials);assert.ok(rebuilt.geometries<=memory.geometries);assert.equal(rebuilt.textures,memory.textures);
  await page.locator('#focus-clutch').click();await page.waitForTimeout(400);
  await page.locator('#perspective').screenshot({path:'/tmp/mission36-mechanism.png'});
  await page.selectOption('#cutaway','normal');await page.locator('#reset-camera').click();await page.waitForTimeout(400);await page.locator('#perspective').screenshot({path:'/tmp/mission36-vehicle.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',realTabVisibility,runtime:await api('return m.runtimeSnapshot()'),memory}));
} finally {
  await browser?.close();
  server.close();
}
