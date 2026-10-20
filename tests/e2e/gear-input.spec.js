import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
});

test('number row selects forward gears and reverse while old numpad shortcuts remain', async ({ page }) => {
  const stateGear = () => page.evaluate(() => window.state.engine.currentGear);
  const shortcuts = [
    ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'],
    ['Digit4', '4'], ['Digit5', '5'], ['Digit6', '6'], ['Digit7', 'R'],
    ['Numpad7', '1'], ['Numpad1', '2'], ['Numpad8', '3'],
    ['Numpad2', '4'], ['Numpad9', '5'], ['Numpad3', '6'],
    ['Numpad4', 'N'], ['Numpad5', 'N'], ['Numpad6', 'N'],
  ];
  for (const [code, gear] of shortcuts) {
    await page.keyboard.press(code);
    await expect.poll(stateGear).toBe(gear);
    await expect(page.locator('#instrument-gear')).toHaveText(gear);
  }
  await page.keyboard.down('KeyQ');
  await page.keyboard.press('Numpad1');
  await page.keyboard.up('KeyQ');
  await expect.poll(stateGear).toBe('R');
});

test('gear keys respect text inputs and do not interfere with unrelated driving keys', async ({ page }) => {
  await page.keyboard.press('Digit3');
  await page.keyboard.down('KeyD');
  await page.keyboard.press('Digit5');
  expect(await page.evaluate(() => state.input.throttleKeyHeld)).toBe(true);
  await page.keyboard.up('KeyD');
  await expect.poll(() => page.evaluate(() => state.engine.currentGear)).toBe('5');

  const search = page.locator('#search');
  await search.fill('');
  await search.focus();
  await page.keyboard.press('Digit1');
  await expect.poll(() => page.evaluate(() => state.engine.currentGear)).toBe('5');
  await expect(search).toHaveValue('1');
});

test('gear selection survives engine off/on and remains distinct from torque availability', async ({ page }) => {
  await page.keyboard.down('KeyA');
  await page.evaluate(() => { state.engine.isStalled = true; state.engine.rpm = 0; });
  await page.locator('#engineToggle').click();
  await expect.poll(() => page.evaluate(() => state.engine.isRunning)).toBe(false);
  await page.keyboard.press('Digit4');
  await expect.poll(() => page.evaluate(() => state.engine.currentGear)).toBe('4');
  expect(await page.evaluate(() => state.engine.rpm)).toBe(0);
  expect(await page.evaluate(() => state.engine.isStalled)).toBe(true);
  await page.locator('#engineToggle').click();
  await expect.poll(() => page.evaluate(() => state.engine.isRunning)).toBe(true);
  await expect.poll(() => page.evaluate(() => state.engine.currentGear)).toBe('4');
  await expect(page.locator('#instrument-gear')).toHaveText('4');
  expect(await page.evaluate(() => state.engine.isStalled)).toBe(false);

  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => state.engine.rpm), { timeout: 5000 })
    .toBeGreaterThan(900);
  expect(await page.evaluate(() => ({ locked: state.engine.drivetrainLocked,
    torque: state.engine.transmittedTorqueNm, speed: state.body.speed })))
    .toMatchObject({ locked: false, torque: 0, speed: 0 });
  await page.keyboard.up('KeyA');
  await expect.poll(() => page.evaluate(() => state.body.speed), { timeout: 10000 })
    .toBeGreaterThan(0.2);
  await page.keyboard.up('KeyD');
});
