import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Run headed with DISPLAY and XTest. CDP key events alone do not execute Chrome's
// browser accelerators, even in headed mode; these are actual X11 input events.
test.use({ headless: false });
test.skip(process.platform !== 'linux' || !process.env.DISPLAY, 'Requires headed X11, xwininfo and libXtst');
test('native Ctrl+R and Ctrl+Shift+R reload without dispatching the starter', async ({ page }) => {
  const records = [];
  await page.exposeFunction('__recordR', data => records.push(data));
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyR') window.__recordR({ prevented: e.defaultPrevented,
        held: Boolean(state.input.heldKeys.KeyR), command: state.engine.command });
    });
  });
  const original = execFileSync('git', ['show', '3870cc9:js/input.js'], { encoding: 'utf8' });
  for (const baseline of [true, false]) {
    if (baseline) await page.route('**/js/input.js', route => route.fulfill({ contentType: 'text/javascript', body: original }));
    else await page.unroute('**/js/input.js');
    for (const kind of ['normal', 'hard']) {
      await page.goto('/?renderer=canvas&debugMode=quiet');
      await page.waitForFunction(() => Boolean(window.state), {}, { polling: 50 });
      await page.evaluate(() => {
        document.title = 'Mission6NativeRefresh';
        Object.assign(state.engine, { mode: 'stopped', command: null });
      });
      let id;
      await expect.poll(() => {
        const tree = execFileSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8' });
        id = tree.split('\n').find(line => line.includes('Mission6NativeRefresh'))?.trim().split(' ')[0];
        return Boolean(id);
      }).toBe(true);
      const before = await page.evaluate(() => performance.timeOrigin), count = records.length;
      execFileSync('python3', ['tests/e2e/helpers/native-refresh.py', id, kind]);
      await expect.poll(() => records.length).toBeGreaterThan(count);
      expect(records.at(-1)).toEqual(baseline
        ? { prevented: true, held: true, command: 'start' }
        : { prevented: false, held: false, command: null });
      if (baseline) await page.waitForTimeout(500);
      else await page.waitForLoadState('domcontentloaded');
      await expect.poll(() => page.evaluate(value => performance.timeOrigin !== value, before)).toBe(!baseline);
      console.log('native refresh', { baseline, kind, reloaded: !baseline, ...records.at(-1) });
    }
  }
});
