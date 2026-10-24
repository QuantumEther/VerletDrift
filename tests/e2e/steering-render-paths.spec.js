import { test, expect } from '@playwright/test';
import { installLiveGPUTarget } from './helpers/live-gpu.js';

for (const renderer of ['canvas', 'gpu']) test(`${renderer} world rendering preserves pending steering`, async ({ page }) => {
  if (renderer === 'gpu') await installLiveGPUTarget(page);
  await page.addInitScript(() => {
    let queued = [];
    window.requestAnimationFrame = cb => { queued.push(cb); return queued.length; };
    window.__frame = t => { const callbacks = queued; queued = []; for (const cb of callbacks) cb(t); };
  });
  await page.goto(`/?renderer=${renderer}&debugMode=quiet`);
  await page.waitForFunction(() => Boolean(window.state), {}, { polling: 50 });
  if (renderer === 'gpu') {
    const available = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
    test.skip(!available, 'No WebGPU adapter; run with software WebGPU or supported GPU flags');
    await page.evaluate(async () => { window.__steeringGPU = await import('/js/gpu-renderer.js'); });
    await page.waitForFunction(() => __steeringGPU.isGPUReady(), {}, { polling: 50 });
  }
  await page.evaluate(() => { __frame(1000); __frame(1011); });
  await page.locator('#simCanvas').scrollIntoViewIfNeeded();
  const b = await page.locator('#simCanvas').boundingBox(), x = b.x + 100, y = b.y + 100;
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' }); await page.mouse.move(x + 30, y);
  const pending = await page.evaluate(() => state.steering.wheelAngle);
  await page.evaluate(() => { __frame(1012); __frame(1013); __frame(1014); });
  expect(await page.evaluate(() => state.steering.wheelAngle)).toBe(pending);
  await page.evaluate(() => __frame(1022));
  expect(await page.evaluate(() => state.steering.frontWheelAngle)).toBeCloseTo(.104, 12);
  if (renderer === 'gpu') {
    expect(await page.evaluate(() => Boolean(window.__liveTexture))).toBe(true);
    await page.evaluate(() => __liveGPU.queue.onSubmittedWorkDone());
    expect(await page.evaluate(() => __steeringGPU.isGPUReady())).toBe(true);
    expect(await page.evaluate(() => __steeringGPU.getGPURenderStats().error)).toBeNull();
  }
});
