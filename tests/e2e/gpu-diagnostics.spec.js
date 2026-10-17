import { test, expect } from '@playwright/test';

test('presentation diagnostic reports results without loading the simulator', async ({ page }) => {
  test.setTimeout(120000);
  const requests = [], errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/gpu-diagnostics.html');
  await page.getByRole('button', { name: 'Run diagnostic' }).click();
  await expect(page.locator('#status')).toContainText('Finished:', { timeout: 100000 });
  const report = JSON.parse(await page.locator('#report').textContent());
  expect(report.results).toHaveLength(10);
  for (const result of report.results) {
    expect(typeof result.passed).toBe('boolean');
    if (result.passed) {
      expect(result.frames).toBe(12);
      expect(result.errors).toEqual([]);
    } else {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  }
  expect(requests.some(url => /\/js\/(main|state)\.js/.test(url))).toBe(false);
  expect(errors).toEqual([]);
  await expect(page.getByRole('button', { name: 'Download report' })).toBeEnabled();
});

test('missing decorative RPM marker does not interrupt live instruments', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?renderer=canvas');
  await page.waitForFunction(() => document.querySelector('.redline-marker'));
  const result = await page.evaluate(async () => {
    const { default: state } = await import('/js/state.js');
    const { updateInstruments } = await import('/js/ui/instruments.js');
    document.querySelector('.redline-marker').remove();
    const now = performance.now() + 100;
    updateInstruments(state, now);
    state.engine.rpm = 2400;
    state.engine.isRunning = true;
    state.engine.isStalled = false;
    updateInstruments(state, now + 100);
    return document.getElementById('instrument-rpm').textContent;
  });
  expect(result.replace(/\D/g, '')).toBe('2400');
  expect(errors).toEqual([]);
});

test('opt-in performance recorder downloads bounded CPU/GPU scope data', async ({ page }) => {
  await page.goto('/?renderer=canvas&gpuProfile=1');
  await page.getByRole('button', { name: 'Record 30s performance' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.evaluate(async () => {
    const { recordPerformanceFrame } = await import('/js/diagnostics/performance-capture.js');
    recordPerformanceFrame(performance.now()+31000, 16.67, 2, 3, 6, 0);
  });
  const download = await downloadEvent;
  const { readFile } = await import('node:fs/promises');
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(report.endReason).toBe('30-second capture complete');
  expect(report.frames.length).toBeGreaterThan(0);
  expect(report.frames.length).toBeLessThanOrEqual(15000);
  expect(report.summary.cpuRenderMs.samples).toBeGreaterThan(0);
  expect(report.summary.gpuRenderMs).toBeNull();
  expect(report.scope).toContain('not independently measured presented FPS');
  expect(report.finalRenderer.backend).toBe('canvas');
  await expect(page.getByRole('button', { name: 'Record 30s performance' })).toBeEnabled();
});
