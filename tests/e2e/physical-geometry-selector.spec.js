import { test, expect } from '@playwright/test';

test('experimental geometry switch updates chassis, tire, suspension and diagnostics', async ({ page }) => {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
  const result = await page.evaluate(async () => {
    state.debug.faults.isFrozen = true;
    const select = document.getElementById('experimentalGeometry');
    const { physicalGeometry } = await import('/js/physics/vehicle-geometry.js');
    const { resetSuspension, updateSuspension } = await import('/js/physics/suspension.js');
    const { computeTireForces } = await import('/js/physics/tires.js');
    const { computeWeightTransfer } = await import('/js/physics/weight.js');
    const { DEFAULT_PHYSICAL_VEHICLE_GEOMETRY } = await import('/js/physics/vehicle-geometry.js');
    const { initializeCarBody } = await import('/js/physics/kinematics.js');
    initializeCarBody(50, 60);
    state.body.centerX = 50; state.body.centerY = 60; state.body.heading = 0;
    select.value = 'asymmetric'; select.dispatchEvent(new Event('change', { bubbles: true }));
    const g = physicalGeometry(state.physicalGeometry);
    state.body.angularVelocity = 1;
    computeTireForces(.01);
    computeWeightTransfer(); resetSuspension(); updateSuspension(.01);
    const front = state.wheelLoads.frontLeft + state.wheelLoads.frontRight;
    const rear = state.wheelLoads.rearLeft + state.wheelLoads.rearRight;
    const arms = Object.fromEntries(Object.entries(g.coordinates).map(([name, p]) => [name,
      [state.wheels[name].x - state.body.centerX, state.wheels[name].y - state.body.centerY]]));
    const tireVel = state.wheelKinematics.frontLeft.wheelVelX;
    const expectedTireVel = -(state.wheels.frontLeft.y - state.body.centerY);
    const asymmetricInertia = g.yawInertia(state.params.carMassKg);
    select.value = 'original'; select.dispatchEvent(new Event('change', { bubbles: true }));
    return { asymmetricInertia, originalInertia:
      physicalGeometry(DEFAULT_PHYSICAL_VEHICLE_GEOMETRY).yawInertia(state.params.carMassKg),
      front, rear, expectedFront: state.params.carMassKg * 9.81 * g.frontStaticLoadFraction,
      wheelbase: physicalGeometry(state.physicalGeometry).wheelbase,
      resetSpeed: state.body.speed, arms, tireVel, expectedTireVel,
      diagnostic: document.getElementById('physicalGeometryReadout').textContent };
  });
  expect(result.front).toBeCloseTo(result.expectedFront, 4);
  expect(result.rear).toBeGreaterThan(result.front);
  expect(result.asymmetricInertia).not.toBeCloseTo(result.originalInertia, 5);
  expect(result.arms.frontLeft[1]).toBeCloseTo(-1.6, 5);
  expect(result.arms.rearLeft[1]).toBeCloseTo(1.1, 5);
  expect(result.tireVel).toBeCloseTo(result.expectedTireVel, 6);
  expect(result.wheelbase).toBeCloseTo(2.408, 8);
  expect(result.resetSpeed).toBe(0);
  expect(result.diagnostic).toContain('Wheelbase 2.408 m');
  await expect(page.locator('#experimentalGeometry')).toHaveValue('original');
});
