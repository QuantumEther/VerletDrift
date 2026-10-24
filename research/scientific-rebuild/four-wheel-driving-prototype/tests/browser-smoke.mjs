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
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.querySelector('#front').textContent.includes('rad/s'));
  await page.selectOption('#view','side');
  const rest=await page.locator('#pitch').textContent();
  await page.keyboard.press('Space');await page.waitForTimeout(150);
  assert.notEqual(await page.locator('#pitch').textContent(),rest);
  const initialImage=await page.locator('canvas').screenshot();
  await page.keyboard.press('b');
  await page.keyboard.down('w');await page.waitForTimeout(2500);
  const driven=await page.locator('#speed').textContent();
  assert.ok(parseFloat(driven)>.1);
  assert.ok(parseFloat(await page.locator('#position').textContent())>0);
  assert.ok(!initialImage.equals(await page.locator('canvas').screenshot()));
  assert.ok((await page.locator('#rear').textContent()).includes('drive 20.0'));
  await page.keyboard.up('w');
  await page.keyboard.down('s');await page.waitForTimeout(1500);await page.keyboard.up('s');
  const braked=await page.locator('#speed').textContent();assert.ok(parseFloat(braked)<parseFloat(driven));
  await page.selectOption('#view','top');
  const beforeTurn=await page.locator('canvas').screenshot();
  await page.keyboard.down('w');await page.keyboard.down('a');await page.waitForTimeout(2000);
  await page.keyboard.up('a');await page.keyboard.up('w');
  const dynamics=await page.locator('#planar').textContent();
  assert.ok(parseFloat(dynamics.match(/heading ([\d.-]+)/)[1])>1,dynamics);
  assert.ok(!beforeTurn.equals(await page.locator('canvas').screenshot()));
  await page.selectOption('#view','side');
  await page.keyboard.press('b');await page.waitForTimeout(200);
  await page.keyboard.press('r');await page.waitForTimeout(100);
  assert.equal(parseFloat(await page.locator('#position').textContent()),0);
  assert.equal(await page.locator('#warning').textContent(),'');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', driven, braked, errors }));
} finally {
  await browser?.close();
  server.close();
}
