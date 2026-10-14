import { test, expect } from '@playwright/test';

async function runTurn(page, handbrake) {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  await page.evaluate((applyHandbrake) => {
    const s = window.state;
    const dt = 1 / s.params.simulationFps;
    const speed = 18;
    s.engine.currentGear = 'N';
    s.engine.clutchEngagement = 0;
    s.engine.clutchPedalPosition = 0;
    for (const wheel of Object.values(s.wheels)) {
      wheel.prevX = wheel.x;
      wheel.prevY = wheel.y + speed * dt;
    }
    for (const name of Object.keys(s.wheelOmega)) {
      s.wheelOmega[name] = speed / s.params.wheelRadius;
    }
    for (const force of Object.values(s.prevTireForce)) {
      force.lon = 0;
      force.lat = 0;
    }
    s.steering.isDragging = true;
    s.steering.wheelAngle = 0.22 / s.params.maxFrontWheelAngle * Math.PI * 2.5;
    s.input.handbrakeKeyHeld = applyHandbrake;
  }, handbrake);

  await page.waitForTimeout(2200);
  return page.evaluate(() => {
    const s = window.state;
    const b = s.body;
    const beta = Math.atan2(
      b.velocityX * Math.cos(b.heading) + b.velocityY * Math.sin(b.heading),
      b.velocityX * Math.sin(b.heading) - b.velocityY * Math.cos(b.heading),
    );
    return {
      speed: b.speed,
      sideslipDegrees: Math.abs(beta * 180 / Math.PI),
      rearOmega: Math.max(Math.abs(s.wheelOmega.rearLeft), Math.abs(s.wheelOmega.rearRight)),
    };
  });
}

test('handbrake lock helps a steered car rotate and build sideslip', async ({ page }) => {
  const coastingTurn = await runTurn(page, false);
  const handbrakeTurn = await runTurn(page, true);

  expect(handbrakeTurn.rearOmega).toBeLessThan(0.01);
  expect(handbrakeTurn.sideslipDegrees).toBeGreaterThan(coastingTurn.sideslipDegrees + 1.5);
  expect(handbrakeTurn.speed).toBeLessThan(coastingTurn.speed);
});
