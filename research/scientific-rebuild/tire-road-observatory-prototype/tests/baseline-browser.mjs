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
  const result=await page.evaluate(()=>{const original=CanvasRenderingContext2D.prototype.clearRect;CanvasRenderingContext2D.prototype.clearRect=()=>{throw new Error('reproduced draw fault');};window.pending.shift()(performance.now()+10);CanvasRenderingContext2D.prototype.clearRect=original;const afterFault=window.pending.length;document.querySelector('#rest').click();return {afterFault,afterReset:window.pending.length,message:document.querySelector('#warning').textContent};});
  assert.equal(result.afterFault,0);assert.equal(result.afterReset,0);console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  server.close();
}
