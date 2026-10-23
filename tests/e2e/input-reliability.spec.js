import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?debugMode=quiet&inputDebug=1');
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
});

test('driving keys work together and while a non-text control has focus', async ({ page }) => {
  await page.keyboard.down('KeyA');
  await page.keyboard.down('KeyS');
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyF');
  await expect.poll(() => page.evaluate(() => [
    state.input.clutchKeyHeld, state.input.brakeKeyHeld,
    state.input.throttleKeyHeld, state.input.handbrakeKeyHeld,
  ])).toEqual([true, true, true, true]);
  for (const code of ['KeyA', 'KeyS', 'KeyD', 'KeyF']) await page.keyboard.up(code);

  const slider = page.locator('#tireFrictionCoeff');
  await slider.focus();
  await page.keyboard.down('KeyD');
  expect(await page.evaluate(() => state.input.throttleKeyHeld)).toBe(true);
  await page.keyboard.up('KeyD');
  expect(await page.evaluate(() => state.input.throttleKeyHeld)).toBe(false);
  await expect(page.locator('#input-diagnostics')).toContainText('keyup KeyD');
});

test('text editing is preserved, UI focus does not disable driving, and blur clears held keys', async ({ page }) => {
  const search = page.locator('#search');
  await search.fill('');
  await search.focus();
  await page.keyboard.press('KeyD');
  expect(await page.evaluate(() => state.input.throttleKeyHeld)).toBe(false);
  await expect(search).toHaveValue('d');
  await page.evaluate(() => Object.assign(state.engine, { mode: 'stopped', command: null }));
  await page.keyboard.press('KeyR');
  await expect(search).toHaveValue('dr');
  expect(await page.evaluate(() => state.engine.command)).toBeNull();

  await page.locator('#soundToggle').focus();
  await page.keyboard.down('KeyD');
  expect(await page.evaluate(() => state.input.throttleKeyHeld)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => ({
    throttle: state.input.throttleKeyHeld, held: Object.keys(state.input.heldKeys),
  }))).toEqual({ throttle: false, held: [] });
  await page.keyboard.down('KeyS');
  expect(await page.evaluate(() => state.input.brakeKeyHeld)).toBe(true);
  await page.keyboard.up('KeyS');
});

test('hidden tab clears input and R requests a starter without toggling a running engine', async ({ page }) => {
  await page.keyboard.down('KeyA');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => state.input.clutchKeyHeld)).toBe(false);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.assign(state.engine, { mode: 'running', omega: 100, command: null });
  });
  await page.keyboard.press('KeyR');
  expect(await page.evaluate(() => state.engine.command)).toBeNull();

  await page.evaluate(() => Object.assign(state.engine, {
    mode: 'stalled', omega: 0, rpm: 0, isRunning: false, isStalled: true, command: null,
  }));
  await page.keyboard.down('KeyD');
  expect(await page.evaluate(() => ({ throttle: state.input.throttleKeyHeld, mode: state.engine.mode })))
    .toEqual({ throttle: true, mode: 'stalled' });
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyR');
  await expect.poll(() => page.evaluate(() => state.engine.mode)).toBe('starting');
  expect(await page.evaluate(() => state.engine.omega)).toBeGreaterThan(0);
  const repeated = await page.evaluate(() => {
    const omega = state.engine.omega;
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyR', repeat: true, bubbles: true, cancelable: true,
    }));
    return { command: state.engine.command, omegaBefore: omega, omegaAfter: state.engine.omega };
  });
  expect(repeated.command).toBeNull();
  expect(repeated.omegaAfter).toBe(repeated.omegaBefore);
  await page.keyboard.up('KeyR');
  await page.keyboard.press('Digit7');
  expect(await page.evaluate(() => state.engine.requestedGear)).toBe('R');
  expect(await page.evaluate(() => state.input.lastKeyEvent.code)).toBe('Digit7');
});
