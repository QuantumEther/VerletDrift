import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { install } from '../../research/vehicle-audit/browser-harness.mjs';
import { scenarios } from '../../research/vehicle-audit/scenarios.mjs';

// Exact mechanical telemetry parity against the preserved Mission 5 revision.
// Render/input event behavior is intentionally tested separately.
test('representative Mission 5 physical-input replays remain bit-exact', async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  const chosen = ['gentle-launch', 'upshift', 'engine-braking', 'hard-brake', 'steering-reversal', 'steering-release', 'handbrake'];
  const results = [];
  for (const baseline of [true, false]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
      if (baseline) {
        const cache = new Map();
        await page.route('**/js/**', route => {
          const path = new URL(route.request().url()).pathname.slice(1);
          if (!cache.has(path)) cache.set(path, execFileSync('git', ['show', `3870cc9:${path}`], { encoding: 'utf8' }));
          return route.fulfill({ contentType: 'text/javascript', body: cache.get(path) });
        });
      }
      await page.goto(`${baseURL}/?renderer=canvas&debugMode=quiet`);
      await page.waitForFunction(() => Boolean(window.state), {}, { polling: 50 });
      await page.evaluate(async ({ source, base }) => {
        window.__audit = await (new Function(`return (${source})`)())(base);
      }, { source: install.toString(), base: `${baseURL}/` });
      const runs = [];
      for (const name of chosen) {
        const result = await page.evaluate(spec => __audit.run(spec), scenarios.find(s => s.name === name));
        const columns = await page.evaluate(() => __audit.columns);
        runs.push({ name, anomalies: result.anomalies,
          rows: result.rows.map(row => row.filter((_, i) => columns[i] !== 'tickMs')) });
      }
      results.push(runs);
    } finally { await context.close(); }
  }
  expect(results[1]).toEqual(results[0]);
  expect(results[1].every(r => r.anomalies.length === 0)).toBe(true);
  console.log('Mission 5 parity:', results[1].map(r => `${r.name} ${r.rows.length} ticks`).join(', '));
});
