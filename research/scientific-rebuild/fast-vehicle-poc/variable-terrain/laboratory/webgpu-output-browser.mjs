import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.VERLETDRIFT_URL ?? 'http://127.0.0.1:8792';
const laboratory = '/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium',
  args: ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--use-vulkan=swiftshader', '--enable-features=Vulkan', '--disable-vulkan-surface'],
});
const results = {};
try {
  for (const mode of ['reference', 'optimized', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.outputPasses = { scene: 0, colorOnly: 0 };
      const begin = GPUCommandEncoder.prototype.beginRenderPass;
      GPUCommandEncoder.prototype.beginRenderPass = function (descriptor) {
        if (descriptor.label === 'VerletDrift resolved color output') {
          if (descriptor.depthStencilAttachment || descriptor.colorAttachments[0].resolveTarget) {
            throw Error('Unexpected depth or multisampling in the final output pass');
          }
          outputPasses.colorOnly++;
        } else if (descriptor.colorAttachments[0]?.resolveTarget) outputPasses.scene++;
        return begin.call(this, descriptor);
      };
    });
    await page.goto(origin + laboratory + '?backend=' + (mode === 'webgl' ? 'webgl' : 'webgpu') + '&gpu-pipeline=' + mode);
    await page.evaluate(async path => {
      window.app = await import(path + 'main.js');
      const pause = document.getElementById('pause');
      if (pause.textContent !== 'Resume') pause.click();
    }, laboratory);
    await page.waitForFunction(() => {
      let snapshot;
      try { snapshot = app.rendererSnapshot(); } catch { return false; }
      return snapshot.assetStatus === 'ready' && snapshot.graphics.status === 'ready' && snapshot.terrainUpdates > 0;
    }, null, { timeout: 120000 });
    const result = await page.evaluate(async path => {
      const canvas = document.getElementById('perspective');
      const { sampleCanvasTexture } = await import(path + 'gpu-isolation/output-check.js');
      const snapshot = app.rendererSnapshot();
      const pixels = snapshot.activeBackend === 'webgpu' ? await new Promise((resolve, reject) => {
        requestAnimationFrame(() => sampleCanvasTexture(canvas).then(resolve, reject));
      }) : null;
      return {
        backend: snapshot.activeBackend,
        pipeline: snapshot.gpuPipeline,
        shadowSize: snapshot.graphics.shadowSize,
        buffer: [canvas.width, canvas.height],
        balloonUploads: snapshot.balloons.instanceUploads,
        passes: { ...outputPasses },
        pixels,
        warning: document.getElementById('warning').textContent,
      };
    }, laboratory);
    assert.deepEqual(errors, []);
    assert.equal(result.warning, '');
    assert.equal(result.shadowSize, 2048);
    assert.equal(result.backend, mode === 'webgl' ? 'webgl' : 'webgpu');
    if (result.pixels) assert.ok(new Set(result.pixels.map(String)).size >= 2);
    results[mode] = result;
    await page.close();
  }
  assert.deepEqual(results.optimized.buffer, results.reference.buffer);
  assert.deepEqual(results.optimized.pixels, results.reference.pixels);
  assert.ok(results.optimized.passes.scene > 0);
  assert.ok(results.optimized.passes.colorOnly > 0);
  assert.equal(results.reference.passes.colorOnly, 0);
  assert.equal(results.optimized.balloonUploads, 1);
  assert.ok(results.reference.balloonUploads > 1);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
