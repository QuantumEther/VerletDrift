import { test, expect } from '@playwright/test';

test('suspension controls change physics and survive preset export/import', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  await expect(page.locator('#suspensionEnabled')).toBeChecked();
  await page.locator('#antiRollStiffnessFront').fill('30000');
  await page.locator('#antiRollStiffnessFront').dispatchEvent('input');
  expect(await page.evaluate(() => window.state.params.antiRollStiffnessFront)).toBe(30000);
  await page.locator('#suspensionEnabled').uncheck();
  await expect.poll(() => page.evaluate(() => window.state.suspension.wasEnabled)).toBe(false);
  await page.locator('#suspensionEnabled').check();
  await expect.poll(() => page.evaluate(() => window.state.suspension.wasEnabled)).toBe(true);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportPreset').click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.locator('#antiRollStiffnessFront').fill('0');
  await page.locator('#antiRollStiffnessFront').dispatchEvent('input');
  await page.locator('#suspensionEnabled').uncheck();
  await page.locator('#importPreset').setInputFiles(path);
  await expect(page.locator('#suspensionEnabled')).toBeChecked();
  expect(await page.evaluate(() => window.state.params.antiRollStiffnessFront)).toBe(30000);
  await expect(page.locator('#suspensionReadout')).toContainText('Loads FL/FR/RL/RR');
  expect(errors).toEqual([]);
});
