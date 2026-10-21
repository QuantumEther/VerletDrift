import { test, expect } from '@playwright/test';

for (const dpr of [1, 2]) {
  test(`world scale stays constant across canvas resolutions at DPR ${dpr}`, async ({ browser }) => {
    const context = await browser.newContext({ deviceScaleFactor: dpr, viewport: { width: 1100, height: 1000 } });
    await context.addInitScript(() => {
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (this.canvas.id === 'simCanvas' && (image.src?.endsWith('/DeLorean.png')||image.vehicleBodySprite)) {
          const m = this.getTransform();
          const ratioX = this.canvas.width / this.canvas.clientWidth;
          const ratioY = this.canvas.height / this.canvas.clientHeight;
          window.carFrame = {
            width: args[6] * Math.hypot(m.a / ratioX, m.b / ratioY),
            length: args[7] * Math.hypot(m.c / ratioX, m.d / ratioY),
            ppm: state.params.pixelsPerMeter, zoom: state.camera.zoom,
            backingWidth: this.canvas.width, cssWidth: this.canvas.clientWidth,
          };
        }
        return draw.call(this, image, ...args);
      };
    });
    const page = await context.newPage();
    await page.goto('http://localhost:8000/?debugMode=quiet');
    await page.waitForFunction(() => window.carFrame);
    for (const width of [390, 1100]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const resolution of [.5, 1, 2]) {
        await page.evaluate(value => {
          const input = document.getElementById('canvasResolutionSlider');
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, resolution);
        await expect.poll(() => page.evaluate(({ dpr, resolution }) =>
          carFrame.backingWidth === Math.round(carFrame.cssWidth * dpr * resolution), { dpr, resolution })).toBe(true);
        const dimensions = await page.evaluate(async () => {
          const { BODY_RECT } = await import('/js/renderer/vehicle-geometry.js');
          return { ...carFrame, body: BODY_RECT };
        });
        expect(dimensions.width).toBeCloseTo(dimensions.body.width * dimensions.ppm * dimensions.zoom, 3);
        expect(dimensions.length).toBeCloseTo(dimensions.body.length * dimensions.ppm * dimensions.zoom, 3);
      }
    }
    await context.close();
  });
}

test('drifting marks originate at physical wheel centres and stay within tire width', async ({ page }) => {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  await page.evaluate(() => {
    window.markAudit = { count: 0, badPositions: 0, widths: [], headings: [] };
    const push = state.skidMarks.push;
    state.skidMarks.push = function (...segments) {
      for (const s of segments) {
        markAudit.count++;
        const match = Object.values(state.wheels).some(w => Math.hypot(w.x - s.x2, w.y - s.y2) < 1e-10);
        if (!match) markAudit.badPositions++;
        markAudit.widths.push(s.width);
        markAudit.headings.push(state.body.heading);
      }
      return push.apply(this, segments);
    };
    // Same initial rolling turn as the handling regression, with rear-wheel lock.
    const dt = 1 / state.params.simulationFps;
    state.engine.currentGear = 'N';
    state.engine.clutchEngagement = 0;
    state.engine.clutchPedalPosition = 0;
    for (const wheel of Object.values(state.wheels)) {
      wheel.prevX = wheel.x;
      wheel.prevY = wheel.y + 18 * dt;
    }
    for (const name of Object.keys(state.wheelOmega)) state.wheelOmega[name] = 18 / state.params.wheelRadius;
    for (const force of Object.values(state.prevTireForce)) { force.lon = 0; force.lat = 0; }
    state.steering.isDragging = true;
    state.steering.wheelAngle = .22 / state.params.maxFrontWheelAngle * Math.PI * 2.5;
    state.input.handbrakeKeyHeld = true;
  });
  await expect.poll(() => page.evaluate(() => markAudit.count)).toBeGreaterThan(20);
  await expect.poll(() => page.evaluate(() =>
    Math.max(...markAudit.headings) - Math.min(...markAudit.headings))).toBeGreaterThan(.01);
  const audit = await page.evaluate(async () => {
    const { getTireDimensions } = await import('/js/renderer/vehicle-geometry.js');
    return { count: markAudit.count, bad: markAudit.badPositions, width: Math.max(...markAudit.widths),
      tire: getTireDimensions(state.params.wheelRadius).width,
      turn: Math.max(...markAudit.headings) - Math.min(...markAudit.headings), frozen: state.debug.faults.isFrozen };
  });
  expect(audit.bad).toBe(0);
  expect(audit.width).toBeLessThanOrEqual(audit.tire);
  expect(audit.turn).toBeGreaterThan(.01);
  expect(audit.frozen).toBe(false);
});

test('tire and mark centres agree through turns, zoom, view scale and shake', async ({ page }) => {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0);
  await expect.poll(() => page.evaluate(async () => {
    const { drawVehicleSprites } = await import('/js/renderer/vehicle-sprites.js');
    return drawVehicleSprites(document.createElement('canvas').getContext('2d'), {
      cx: 0, cy: 0, heading: 0, steerAngle: 0, wheels: state.wheels,
    });
  })).toBe(true);
  const audit = await page.evaluate(async () => {
    const { drawVehicleSprites } = await import('/js/renderer/vehicle-sprites.js');
    const { applyCameraTransform, removeCameraTransform, drawSkidMarks } = await import('/js/renderer/world.js');
    const { CAR_HALF_WIDTH: W, CAR_HALF_LENGTH: L } = await import('/js/constants.js');
    const saved = { camera: { ...state.camera }, shake: { ...state.screenShake },
      ppm: state.params.pixelsPerMeter, exaggeration: state.params.gpuSkidResolution, marks: state.skidMarks };
    let maxError = 0, cases = 0;
    try {
      state.params.gpuSkidResolution = 1;
      Object.assign(state.screenShake, { magnitude: 1, shakeX: .15, shakeY: -.12 });
      Object.assign(state.camera, { x: 10, y: 20 });
      for (const heading of [0, .9, -1.7]) for (const zoom of [.3, 1, 2]) for (const ppm of [10, 20, 60]) {
        state.camera.zoom = zoom;
        state.params.pixelsPerMeter = ppm;
        const wheels = {};
        for (const [name, x, y] of [['frontLeft', -W, -L], ['frontRight', W, -L],
          ['rearLeft', -W, L], ['rearRight', W, L]]) {
          wheels[name] = { x: 10 + x * Math.cos(heading) - y * Math.sin(heading),
            y: 20 + x * Math.sin(heading) + y * Math.cos(heading) };
        }
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.scale(2, 2); // Also exercise a higher-density backing transform.
        applyCameraTransform(ctx, 800, 600);
        const tireCentres = [], markCentres = [];
        ctx.drawImage = image => { if (image.src?.endsWith('DeLorean_Wheel.png')) {
          const m = ctx.getTransform(); tireCentres.push({ x: m.e, y: m.f });
        } };
        ctx.lineTo = (x, y) => markCentres.push(ctx.getTransform().transformPoint({ x, y }));
        drawVehicleSprites(ctx, { cx: 10, cy: 20, heading, steerAngle: .3, wheels });
        state.skidMarks = Object.values(wheels).map(w => ({ x1: w.x - .1, y1: w.y + .1,
          x2: w.x, y2: w.y, width: .26, alpha: .5, hue: 140, paintSaturation: 1 }));
        drawSkidMarks(ctx);
        for (let i = 0; i < 4; i++) maxError = Math.max(maxError,
          Math.hypot(tireCentres[i].x - markCentres[i].x, tireCentres[i].y - markCentres[i].y));
        removeCameraTransform(ctx);
        cases++;
      }
      return { maxError, cases };
    } finally {
      Object.assign(state.camera, saved.camera);
      Object.assign(state.screenShake, saved.shake);
      state.params.pixelsPerMeter = saved.ppm;
      state.params.gpuSkidResolution = saved.exaggeration;
      state.skidMarks = saved.marks;
    }
  });
  expect(audit.cases).toBe(27);
  expect(audit.maxError).toBeLessThan(.001); // Canvas float rounding, well below a pixel.
});

test('GPU upload contract keeps raster density separate from geometry and shares the view camera', async ({ page }) => {
  // Exercise production JS uploads with a recording device; this does not rasterize WGSL.
  await page.goto('/gauge-guide.html');
  const result = await page.evaluate(async () => {
    const writes = [];
    const pass = { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {}, end() {} };
    const pipeline = { getBindGroupLayout: () => ({}) };
    const device = {
      createShaderModule: () => ({}), createRenderPipelineAsync: async () => pipeline,
      createComputePipelineAsync: async () => pipeline, createBuffer: desc => ({ ...desc, destroy() {} }),
      pushErrorScope() {}, popErrorScope: async () => null,
      createTexture: () => ({ createView: () => ({}), destroy() {} }), createSampler: () => ({}),
      createBindGroup: () => ({}), createCommandEncoder: () => ({ beginRenderPass: () => pass, finish: () => ({}) }),
      queue: { writeBuffer: (buffer, _offset, data, start = 0, count = data.length) =>
        writes.push({ label: buffer.label, size: buffer.size, data: Array.from(data).slice(start, start + count) }), submit() {} },
    };
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: {
      requestAdapter: async () => ({ requestDevice: async () => device }), getPreferredCanvasFormat: () => 'bgra8unorm',
    } });
    // Chromium exposes these constants even when no adapter is available.
    globalThis.GPUBufferUsage ??= { UNIFORM: 1, COPY_DST: 2, VERTEX: 4, STORAGE: 8, COPY_SRC: 16, MAP_READ: 32 };
    globalThis.GPUTextureUsage ??= { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2 };
    const gpu = await import('/js/gpu-renderer.js');
    const { default: s } = await import('/js/state.js');
    const canvas = { width: 0, height: 0, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) };
    await gpu.initGPU(canvas);
    gpu.resizeGPU(1600, 1200);
    Object.assign(s.camera, { x: 192, y: 144, zoom: .5 });
    Object.assign(s.screenShake, { magnitude: 1, shakeX: .3, shakeY: -.2 });
    s.trail.arrows = [{ x: 193, y: 145, speed: 25, angle: 0, age: 0, lifespan: 2 }];
    const frames = [];
    for (const ppm of [10, 60]) {
      writes.length = 0;
      s.params.pixelsPerMeter = ppm;
      s.params.gpuSkidResolution = 1;
      s.skidMarks = [{ x1: 191, y1: 143, x2: 192, y2: 144, width: .26, alpha: .5, hue: -1 }];
      gpu.renderFrameGPU(800, 600);
      frames.push({ bg: writes.find(w => w.size === 80).data,
        camera: writes.find(w => w.size === 24).data,
        arrow: writes.find(w => w.label === 'arrows').data,
        skid: writes.find(w => w.label === 'skidGeometry').data });
    }
    return { width: canvas.width, height: canvas.height, frames };
  });
  expect([result.width, result.height]).toEqual([1600, 1200]);
  for (const [i, frame] of result.frames.entries()) {
    expect(frame.camera.slice(0, 4)).toEqual([.5, i ? 60 : 10, 800, 600]);
    expect(frame.camera[4]).toBeCloseTo(191.7, 4);
    expect(frame.camera[5]).toBeCloseTo(144.2, 4);
    expect(frame.bg[0]).toBeCloseTo(frame.camera[4], 6);
    expect(frame.bg[1]).toBeCloseTo(frame.camera[5], 6);
    expect(frame.bg[6]).toBe(4); // metre-valued checker tile at either view scale
    expect(frame.bg[15]).toBeCloseTo(.1, 6);
    expect(frame.bg[16]).toBeCloseTo(.8, 6);
    expect(frame.bg[17]).toBe(2);
    expect(frame.arrow[0]).toBeCloseTo(1.3, 5);
    expect(frame.arrow[1]).toBeCloseTo(.8, 5);
    expect(frame.arrow[3]).toBeCloseTo(1.1, 6);
    expect(frame.skid.slice(0, 4)).toEqual([191, 143, 192, 144]); // resident world coordinates
    expect(frame.skid[4]).toBeCloseTo(.26, 6);
  }
});
