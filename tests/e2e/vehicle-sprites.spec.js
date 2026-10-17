import { test, expect } from '@playwright/test';

async function start(page) {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
}

async function waitForSprites(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { drawVehicleSprites } = await import('/js/renderer/vehicle-sprites.js');
    return drawVehicleSprites(document.createElement('canvas').getContext('2d'), {
      cx: 0, cy: 0, heading: 0, steerAngle: 0, wheels: state.wheels,
    });
  })).toBe(true);
}

test('sprites offset live anchors into wheel arches, preserve steering, camera transform and state', async ({ page }) => {
  await start(page);
  await waitForSprites(page);
  const result = await page.evaluate(async () => {
    const { drawCar } = await import('/js/renderer/world.js');
    const { drawVehicleSprites } = await import('/js/renderer/vehicle-sprites.js');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.translate(200, 200);
    ctx.scale(30, 30);
    const initialTransform = Array.from(ctx.getTransform().toFloat64Array());
    const calls = [];
    const originalDraw = ctx.drawImage.bind(ctx);
    ctx.drawImage = (image, ...args) => {
      const { a, b, e, f } = ctx.getTransform();
      calls.push({ src: image.src.split('/').pop(), args, a, b, e, f });
      originalDraw(image, ...args);
    };
    // Nonzero independent wheel positions and steering detect local/world mixups.
    const pose = { cx: 1, cy: 2, heading: .7, steerAngle: .25,
      wheelOmega: { frontLeft: 80, frontRight: -20, rearLeft: 0, rearRight: 40 },
      wheels: { frontLeft: { x: -.4, y: .2 }, frontRight: { x: 2, y: .8 },
        rearLeft: { x: -1, y: 3 }, rearRight: { x: 1.5, y: 3.7 } } };
    const beforePose = JSON.stringify(pose);
    drawVehicleSprites(ctx, pose);
    const spriteCalls = calls.splice(0);
    const snapshot = () => JSON.stringify({ body: state.body, wheels: state.wheels,
      steering: state.steering, engine: state.engine, omega: state.wheelOmega });
    const before = snapshot();
    drawCar(ctx);
    return { spriteCalls, liveCalls: calls, liveBody: { ...state.body },
      liveWheels: structuredClone(state.wheels), steer: state.steering.frontWheelAngle,
      unchanged: snapshot() === before && beforePose === JSON.stringify(pose),
      transformRestored: JSON.stringify(initialTransform) === JSON.stringify(Array.from(ctx.getTransform().toFloat64Array())) };
  });
  expect(result.unchanged && result.transformRestored).toBe(true);
  expect(result.spriteCalls.map(call => call.src)).toEqual([
    'DeLorean_Wheel.png', 'DeLorean_Wheel.png', 'DeLorean_Wheel.png', 'DeLorean_Wheel.png', 'DeLorean.png',
  ]);
  // Chromium Canvas transforms round to float precision, including world coordinates.
  const synthetic = [[-.4, .2, .95], [2, .8, .95], [-1, 3, .7], [1.5, 3.7, .7], [1, 2, .7]];
  const offsets = [[.1, .6], [-.1, .6], [.1, -.54], [-.1, -.54], [0, 0]];
  for (let i = 0; i < 5; i++) {
    const [x, y, angle] = synthetic[i];
    const [dx, dy] = offsets[i];
    const call = result.spriteCalls[i];
    expect(call.e).toBeCloseTo(200 + (x + dx * Math.cos(.7) - dy * Math.sin(.7)) * 30, 4);
    expect(call.f).toBeCloseTo(200 + (y + dx * Math.sin(.7) + dy * Math.cos(.7)) * 30, 4);
    expect(call.a).toBeCloseTo(Math.cos(angle) * 30, 4);
    expect(call.b).toBeCloseTo(Math.sin(angle) * 30, 4);
  }
  expect(result.liveCalls).toHaveLength(5);
  for (const [i, name] of ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'].entries()) {
    const call = result.liveCalls[i];
    const [dx, dy] = offsets[i];
    const cos = Math.cos(result.liveBody.heading), sin = Math.sin(result.liveBody.heading);
    expect(call.e).toBeCloseTo(200 + (result.liveWheels[name].x + dx * cos - dy * sin) * 30, 3);
    expect(call.f).toBeCloseTo(200 + (result.liveWheels[name].y + dx * sin + dy * cos) * 30, 3);
    const angle = result.liveBody.heading + (i < 2 ? result.steer : 0);
    expect(call.a).toBeCloseTo(Math.cos(angle) * 30, 4);
    expect(call.b).toBeCloseTo(Math.sin(angle) * 30, 4);
  }
});

test('motion ghosts share the artwork and disabling sprites restores the old renderer', async ({ page }) => {
  await start(page);
  await waitForSprites(page);
  const result = await page.evaluate(async () => {
    const { drawCar, drawCarGhosts } = await import('/js/renderer/world.js');
    const { vehicleSpriteSettings } = await import('/js/renderer/vehicle-sprites.js');
    const ctx = document.createElement('canvas').getContext('2d');
    const calls = [];
    ctx.drawImage = image => calls.push({ src: image.src, alpha: ctx.globalAlpha });
    const history = state.carPoseHistory;
    const blur = state.blurAccumulator;
    const intensity = state.params.motionBlurIntensity;
    try {
      const pose = { cx: 0, cy: 0, heading: .4, steerAngle: .2, wheels: state.wheels };
      state.carPoseHistory = [pose, pose];
      state.blurAccumulator = 1;
      state.params.motionBlurIntensity = 1;
      drawCarGhosts(ctx);
      const ghosts = calls.splice(0);
      vehicleSpriteSettings.enabled = false;
      drawCar(ctx);
      drawCarGhosts(ctx);
      return { ghosts, fallbackImageCalls: calls.length, alpha: ctx.globalAlpha };
    } finally {
      vehicleSpriteSettings.enabled = true;
      state.carPoseHistory = history;
      state.blurAccumulator = blur;
      state.params.motionBlurIntensity = intensity;
    }
  });
  expect(result.ghosts).toHaveLength(5);
  expect(result.ghosts.every(call => call.alpha > 0 && call.alpha < 1)).toBe(true);
  expect(result.fallbackImageCalls).toBe(0);
  expect(result.alpha).toBe(1);
});

for (const asset of ['DeLorean.png', 'DeLorean_Wheel.png']) {
  test(`a failed ${asset} keeps the simulator and original renderer working`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(`**/assets/vehicles/delorean/${asset}`, route => route.abort());
    await start(page);
    const result = await page.evaluate(async () => {
      const { drawCar } = await import('/js/renderer/world.js');
      const ctx = document.createElement('canvas').getContext('2d');
      let images = 0, fills = 0;
      ctx.drawImage = () => images++;
      ctx.fill = () => fills++;
      drawCar(ctx);
      return { images, fills, timestamp: state.loop.previousTimestamp };
    });
    expect(result.images).toBe(0);
    expect(result.fills).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => state.loop.previousTimestamp)).toBeGreaterThan(result.timestamp);
    expect(errors).toEqual([]);
  });
}
