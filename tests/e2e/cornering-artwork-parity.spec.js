import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

for (const canvasBackend of ['offscreen', 'html']) test(`lighting cache preserves original sprite pixels (${canvasBackend})`, async ({ page }) => {
  if (canvasBackend === 'html') await page.addInitScript(() => { window.OffscreenCanvas = undefined; });
  await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
  const original = execFileSync('git', ['show', 'e3cb371:js/renderer/vehicle-sprites.js'], { encoding: 'utf8' });
  await page.route('**/js/renderer/vehicle-sprites.js?cornerReference', route => route.fulfill({ contentType: 'text/javascript', body: original }));
  await page.goto('/?renderer=canvas&debugMode=quiet');
  await page.waitForFunction(() => Boolean(window.state), {}, { polling: 50 });
  await page.evaluate(async () => {
    const current = await import('/js/renderer/vehicle-sprites.js');
    const reference = await import('/js/renderer/vehicle-sprites.js?cornerReference');
    const { initializeCarBody } = await import('/js/physics/index.js');
    initializeCarBody(0, 0);
    window.__artwork = { current, reference };
    const ctx = document.createElement('canvas').getContext('2d');
    window.__artwork.ready = () => [current, reference].every(m => m.drawVehicleSprites(ctx, {
      cx: 0, cy: 0, heading: 0, steerAngle: 0, wheelRadius: .35, wheels: state.wheels,
    }));
  });
  await page.waitForFunction(() => __artwork.ready(), {}, { polling: 50 });
  const result = await page.evaluate(() => {
    const s = state, originalState = JSON.stringify([s.body, s.wheels, s.params]);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const comparisons = [];
    const poses = [0, .01, .04, .08, .2, .4, 1, 1.2, 2, 3, -.2, -3, .2, 0];
    const lighting = [
      {}, { sceneLightAzimuth: 75, sceneLightIntensity: 1.7, sceneLightTemperature: 3500 },
      { sceneLightElevation: 20, sceneAmbient: .2, sceneLightTemperature: 9000 },
      { sceneLightingEnabled: false }, { sceneLightingEnabled: true, sceneAmbient: 1.3 },
    ];
    for (const settings of lighting) {
      Object.assign(s.params, settings);
      for (const heading of poses) for (const ghost of [false, true]) {
        const c = Math.cos(heading), sn = Math.sin(heading), wheels = {};
        for (const [n, w] of Object.entries(s.wheels)) wheels[n] = { x: c*w.x-sn*w.y, y: sn*w.x+c*w.y };
        const pose = { cx: 0, cy: 0, heading, steerAngle: .13, wheelRadius: .35, wheels, isGhost: ghost, groundShadow: true };
        const images = [];
        for (const module of [__artwork.reference, __artwork.current]) {
          ctx.resetTransform(); ctx.globalAlpha = 1; ctx.clearRect(0, 0, 512, 512);
          ctx.fillStyle = '#314156'; ctx.fillRect(0, 0, 512, 512);
          ctx.translate(256, 256); ctx.scale(75, 75); ctx.globalAlpha = ghost ? .4 : 1;
          module.drawVehicleSprites(ctx, pose);
          images.push(ctx.getImageData(0, 0, 512, 512).data);
        }
        let max = 0, changed = 0;
        for (let i = 0; i < images[0].length; i++) {
          const error = Math.abs(images[0][i] - images[1][i]);
          max = Math.max(max, error); if (error) changed++;
        }
        comparisons.push({ settings, heading, ghost, max, changed });
      }
    }
    // Renderers may read the physical state; they must not mutate it.
    Object.assign(s.params, JSON.parse(originalState)[2]);
    return { comparisons, physicalStateUnchanged: JSON.stringify([s.body, s.wheels, s.params]) === originalState };
  });
  expect(result.physicalStateUnchanged).toBe(true);
  expect(result.comparisons.filter(c => c.changed !== 0)).toEqual([]);
  console.log('Exact sprite pixel parity:', result.comparisons.length, 'cases');
});
