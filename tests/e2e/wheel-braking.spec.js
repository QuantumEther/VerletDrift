import { test, expect } from '@playwright/test';

test('held throttle launches the vehicle and front brakes stop it in neutral', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  const start = await page.evaluate(() => ({ ...window.state.body }));

  await page.keyboard.down('KeyA');
  await page.keyboard.press('Numpad7');
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.state.engine.rpm), { timeout: 5000 })
    .toBeGreaterThan(1500);
  await page.keyboard.up('KeyA');
  await expect.poll(() => page.evaluate(() => window.state.body.speed), { timeout: 8000 })
    .toBeGreaterThan(3);
  const launched = await page.evaluate(() => ({ ...window.state.body }));
  expect(launched.centerY).toBeLessThan(start.centerY);

  await page.keyboard.up('KeyD');
  await page.keyboard.press('Numpad4');
  await page.keyboard.down('KeyS');
  await expect.poll(() => page.evaluate(() => window.state.body.speed), { timeout: 10000 })
    .toBeLessThan(0.05);
  const stopped = await page.evaluate(() => ({
    speed: window.state.body.speed,
    omega: window.state.wheelOmega.frontLeft,
    gear: window.state.engine.currentGear,
  }));
  expect(stopped.gear).toBe('N');
  expect(stopped.omega).toBe(0);
  expect(errors).toEqual([]);
});

test('braking a backward-rolling vehicle removes kinetic energy', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  await page.keyboard.down('KeyS');
  const initialEnergy = await page.evaluate(async () => {
    const { computeBodyDerivedState } = await import('/js/physics/kinematics.js');
    const s = window.state;
    const speed = -10;
    const dt = s.params.timeScale / s.params.simulationFps;
    s.engine.currentGear = 'N';
    for (const [name, wheel] of Object.entries(s.wheels)) {
      wheel.prevY = wheel.y + speed * dt;
      s.wheelOmega[name] = speed / s.params.wheelRadius;
    }
    computeBodyDerivedState(dt);
    return 0.5 * s.params.carMassKg * s.body.speed ** 2
      + Object.values(s.wheelOmega).reduce((sum, omega) => sum + 0.5 * s.params.wheelInertia * omega ** 2, 0);
  });
  await expect.poll(() => page.evaluate(() => window.state.body.speed), { timeout: 15000 })
    .toBeLessThan(0.05);
  const final = await page.evaluate(() => {
    const s = window.state;
    return {
      energy: 0.5 * s.params.carMassKg * s.body.speed ** 2
        + Object.values(s.wheelOmega).reduce((sum, omega) => sum + 0.5 * s.params.wheelInertia * omega ** 2, 0),
      frontOmega: s.wheelOmega.frontLeft,
    };
  });
  expect(final.energy).toBeLessThan(initialEnergy * 0.001);
  expect(final.frontOmega).toBe(0);
  expect(errors).toEqual([]);
});

test('clutch shifts to second and reverse drives in the selected direction', async ({ page }) => {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  const startY = await page.evaluate(() => window.state.body.centerY);

  await page.keyboard.down('KeyA');
  await page.keyboard.press('Numpad7');
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.state.engine.rpm), { timeout: 5000 })
    .toBeGreaterThan(1500);
  await page.keyboard.up('KeyA');
  await expect.poll(() => page.evaluate(() => window.state.body.speed), { timeout: 8000 })
    .toBeGreaterThan(3);

  await page.keyboard.down('KeyA');
  await expect.poll(() => page.evaluate(() => window.state.engine.clutchPedalPosition), { timeout: 2000 })
    .toBeLessThan(0.01);
  await page.keyboard.press('Numpad1');
  await expect.poll(() => page.evaluate(() => window.state.engine.currentGear)).toBe('2');
  expect(await page.evaluate(() => window.state.engine.drivetrainLocked)).toBe(false);
  await page.keyboard.up('KeyA');

  await page.keyboard.up('KeyD');
  await page.keyboard.press('Numpad4');
  await page.keyboard.down('KeyS');
  await expect.poll(() => page.evaluate(() => window.state.body.speed), { timeout: 10000 })
    .toBeLessThan(0.05);
  await page.keyboard.up('KeyS');

  await page.keyboard.down('KeyA');
  await expect.poll(() => page.evaluate(() => window.state.engine.clutchPedalPosition), { timeout: 2000 })
    .toBeLessThan(0.01);
  await page.keyboard.down('KeyQ');
  await page.keyboard.press('Numpad1');
  await page.keyboard.up('KeyQ');
  await expect.poll(() => page.evaluate(() => window.state.engine.currentGear)).toBe('R');
  await page.keyboard.down('KeyD');
  await page.keyboard.up('KeyA');

  await expect.poll(() => page.evaluate(() => window.state.body.centerY), { timeout: 8000 })
    .toBeGreaterThan(startY + 0.5);
});

test('low-traction wheelspin respects engine redline and service brakes stop the rear wheels', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  await page.keyboard.down('KeyA');
  await page.evaluate(() => {
    window.state.params.tireFrictionCoeff = 0.05;
    window.state.engine.currentGear = '1';
  });
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.state.engine.rpm), { timeout: 5000 })
    .toBeGreaterThan(1500);
  await page.keyboard.up('KeyA');
  await expect.poll(() => page.evaluate(() => window.state.engine.rpm / window.state.params.redlineRpm),
    { timeout: 5000 }).toBeGreaterThan(0.98);
  await page.waitForTimeout(4000);
  const spinning = await page.evaluate(() => ({ omega: window.state.wheelOmega.rearLeft,
    rpm: window.state.engine.rpm, ratio: window.state.params.gearRatio1 * window.state.params.finalDriveRatio,
    redline: window.state.params.redlineRpm }));
  expect(spinning.omega).toBeLessThan(70);
  expect(spinning.rpm).toBeLessThan(spinning.redline + 150);
  expect(spinning.rpm).toBeCloseTo(spinning.omega * spinning.ratio * 60 / (2 * Math.PI), 5);
  await page.keyboard.up('KeyD');
  await page.evaluate(() => { window.state.engine.currentGear = 'N'; });
  await page.keyboard.down('KeyS');
  await expect.poll(() => page.evaluate(() => Math.max(Math.abs(window.state.wheelOmega.rearLeft),
    Math.abs(window.state.wheelOmega.rearRight))), { timeout: 5000 }).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});
