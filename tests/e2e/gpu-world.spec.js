import { test, expect } from "@playwright/test";

// Run with an actual adapter; software WebGPU is valid for shader correctness,
// never hardware performance. Ordinary no-adapter regression runs report skips.
async function adapterPage(page) {
  await page.goto("/gauge-guide.html?renderer=gpu");
  const available = await page.evaluate(
    async () => !!(await navigator.gpu?.requestAdapter()),
  );
  test.skip(
    !available,
    "No WebGPU adapter; run with the documented GPU test configuration.",
  );
}

test("real WGSL renders resident skids, paint, smoke and ground without validation errors", async ({
  page,
}) => {
  await adapterPage(page);
  await page.goto("/gauge-guide.html?renderer=gpu&gpuPower=low-power&gpuAlpha=opaque&gpuProfile=1");
  const result = await page.evaluate(async () => {
    const errors = [];
    const original = navigator.gpu.requestAdapter.bind(navigator.gpu);
    let device, particleBuffer, requestedPower, configuredAlpha;
    navigator.gpu.requestAdapter = async (opts) => {
      requestedPower = opts.powerPreference;
      const adapter = await original(opts);
      const request = adapter.requestDevice.bind(adapter);
      adapter.requestDevice = async (desc) => {
        device = await request(desc);
        const makeBuffer = device.createBuffer.bind(device);
        device.createBuffer = (desc) => {
          if (desc.label === "smokeParticles") {
            particleBuffer = makeBuffer({
              ...desc,
              usage: desc.usage | GPUBufferUsage.COPY_SRC,
            });
            return particleBuffer;
          }
          return makeBuffer(desc);
        };
        device.addEventListener("uncapturederror", (e) =>
          errors.push(e.error.message),
        );
        return device;
      };
      return adapter;
    };
    const { default: s } = await import("/js/state.js"),
      gpu = await import("/js/gpu-renderer.js");
    // Real offscreen GPU target; avoid unsupported headless swap-chain presentation.
    navigator.gpu.getPreferredCanvasFormat = () => "rgba8unorm";
    let targetTexture;
    const canvas = {
      width: 512,
      height: 512,
      style: {},
      getContext: () => ({
        configure({ device, format, alphaMode }) {
          configuredAlpha = alphaMode;
          targetTexture = device.createTexture({
            size: [512, 512],
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
          });
        },
        getCurrentTexture() {
          return targetTexture;
        },
        unconfigure() {
          targetTexture?.destroy();
        },
      }),
    };
    const ok = await gpu.initGPU(canvas);
    Object.assign(s.camera, { x: 192, y: 144, zoom: 1 });
    s.params.pixelsPerMeter = 50;
    s.params.motionBlurIntensity = 0;
    const seg = Object.freeze({
      x1: 190,
      y1: 144,
      x2: 194,
      y2: 144,
      width: 0.195,
      alpha: 0.8,
      hue: -1,
    });
    s.skidMarks = [seg];
    s.splatDecals = [
      Object.freeze({ x: 192, y: 145, radius: 0.8, hue: 210, alpha: 0.7 }),
      Object.freeze({ x: -1000, y: -1000, radius: 1, hue: 50, alpha: .7 }),
    ];
    s.balloons = [
      Object.freeze({ x: 190, y: 142, radius: 0.5, hue: 35, isPopped: false }),
      Object.freeze({ x: -1000, y: -1000, radius: 1, hue: 20, isPopped: false }),
    ];
    const smoke = await import("/js/renderer/smoke-system.js");
    // Fill through the real emitter, then leave one sparse high slot alive.
    s.params.smokeEnabled = true;
    s.params.smokeSpawnRate = 10000;
    s.body.speed = 20;
    for (const name of ["frontLeft", "frontRight", "rearLeft", "rearRight"])
      s.wheelSlipRatio[name] = 2;
    smoke.updateSmoke(0.1);
    smoke.updateSmoke(0.1);
    smoke.reclaimSmokeParticles(Array.from({ length: 7999 }, (_, i) => i));
    const pool = smoke.getSmokePool();
    Object.assign(pool[7999], {
      pos: { x: 193, y: 142 },
      vel: { x: 0, y: 0 },
      life: 1,
      maxLife: 1,
      size: 0.7,
      sizeBase: 0.7,
      r: 0.8,
      g: 0.8,
      b: 0.82,
      alpha: 0.7,
    });
    for (let i = 0; i < 3; i++) {
      s.loop.simulationTime += 0.02;
      gpu.renderFrameGPU(512, 512);
    }
    const computePeak = gpu.getGPURenderStats().computeWorkgroups;
    const resourcesBefore = gpu.getGPURenderStats().resourceCount;
    for (let i = 0; i < 60; i++) gpu.renderFrameGPU(512, 512);
    const resourcesAfter = gpu.getGPURenderStats().resourceCount;
    await device.queue.onSubmittedWorkDone();
    const readback = device.createBuffer({
      size: 48,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(particleBuffer, 7999 * 48, readback, 0, 48);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const particle = Array.from(new Float32Array(readback.getMappedRange()));
    readback.unmap();
    readback.destroy();
    const imageBuffer = device.createBuffer({
      size: 512 * 512 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const imageEncoder = device.createCommandEncoder();
    imageEncoder.copyTextureToBuffer(
      { texture: targetTexture },
      { buffer: imageBuffer, bytesPerRow: 2048 },
      [512, 512],
    );
    device.queue.submit([imageEncoder.finish()]);
    await imageBuffer.mapAsync(GPUMapMode.READ);
    const image = new Uint8Array(imageBuffer.getMappedRange()).slice();
    imageBuffer.unmap();
    const sample = (x, y) =>
      Array.from(image.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 4));
    // A straight path split into many physical events must not grow darker
    // solely because rounded segment caps overlap at a higher event frequency.
    s.skidMarks = Array.from({ length: 200 }, (_, i) =>
      Object.freeze({ ...seg, x1: 190 + i * 0.02, x2: 190 + (i + 1) * 0.02 }),
    );
    gpu.renderFrameGPU(512, 512);
    const joinEncoder = device.createCommandEncoder();
    joinEncoder.copyTextureToBuffer(
      { texture: targetTexture },
      { buffer: imageBuffer, bytesPerRow: 2048 },
      [512, 512],
    );
    device.queue.submit([joinEncoder.finish()]);
    await imageBuffer.mapAsync(GPUMapMode.READ);
    const jointPixel = Array.from(
      new Uint8Array(imageBuffer.getMappedRange()).slice(
        (256 * 512 + 256) * 4,
        (256 * 512 + 256) * 4 + 4,
      ),
    );
    imageBuffer.unmap();
    imageBuffer.destroy();
    return {
      requestedPower, configuredAlpha,
      jointPixel,
      resourcesBefore,
      resourcesAfter,
      computePeak,
      ok,
      particle,
      stats: gpu.getGPURenderStats(),
      errors,
      mark: sample(256, 256),
      ground: sample(256, 280),
      decal: sample(256, 306),
      unchanged: seg.alpha === 0.8 && s.splatDecals[0].alpha === 0.7,
    };
  });
  expect(result.ok, result.stats.error).toBe(true);
  expect(result.requestedPower).toBe("low-power");
  expect(result.configuredAlpha).toBe("opaque");
  expect(result.particle[4]).toBeCloseTo(0.94, 5);
  expect(result.particle[11]).toBeCloseTo(0.7, 5);
  expect(result.computePeak).toBe(32);
  expect(result.resourcesAfter).toBe(result.resourcesBefore);
  // Last frames have no physics tick: compute must not advance smoke.
  expect(result.stats.computeWorkgroups).toBe(0);
  expect(result.errors).toEqual([]);
  expect(result.stats.ready).toBe(true);
  if (result.stats.gpuTimingEnabled) {
    expect(result.stats.gpuTimestampSamples).toBeGreaterThan(0);
    expect(result.stats.gpuRenderMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.gpuComputeMs).toBeGreaterThanOrEqual(0);
  }
  expect(result.stats.skidTextureBytes).toBe(0);
  expect(result.stats.omittedSkids).toBe(0);
  expect(result.stats.culledInstances).toBeGreaterThanOrEqual(3);
  expect(result.stats.instances.decals).toBe(1);
  expect(result.stats.instances.balloons).toBe(1);
  expect(result.mark[3]).toBe(255);
  result.jointPixel.forEach((value, i) =>
    expect(Math.abs(value - result.mark[i])).toBeLessThanOrEqual(4),
  );
  expect(result.mark.slice(0, 3)).not.toEqual(result.ground.slice(0, 3));
  expect(result.decal[2]).toBeGreaterThan(result.decal[0]);
  expect(result.unchanged).toBe(true);
});

test("device loss releases GPU resources without changing authoritative wheel geometry", async ({
  page,
}) => {
  await adapterPage(page);
  const result = await page.evaluate(async () => {
    const gpu = await import("/js/gpu-renderer.js"),
      { default: s } = await import("/js/state.js");
    let device, texture;
    const original = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async (opts) => {
      const a = await original(opts);
      const request = a.requestDevice.bind(a);
      a.requestDevice = async (desc) => (device = await request(desc));
      return a;
    };
    const target = {
      width: 64,
      height: 64,
      style: {},
      getContext: () => ({
        configure({ device, format }) {
          texture = device.createTexture({
            size: [64, 64],
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          });
        },
        getCurrentTexture: () => texture,
        unconfigure() {
          texture?.destroy();
        },
      }),
    };
    const before = JSON.stringify({ wheels: s.wheels, params: s.params });
    const initialized = await gpu.initGPU(target);
    gpu.renderFrameGPU(64, 64);
    await device.queue.onSubmittedWorkDone();
    device.destroy();
    await device.lost;
    await new Promise((resolve) => setTimeout(resolve, 0));
    return {
      initialized,
      ready: gpu.isGPUReady(),
      visibility: target.style.visibility,
      unchanged:
        before === JSON.stringify({ wheels: s.wheels, params: s.params }),
    };
  });
  expect(result).toEqual({
    initialized: true,
    ready: false,
    visibility: "hidden",
    unchanged: true,
  });
});

test("explicit Canvas fallback remains drivable and produces no renderer errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?renderer=canvas&debugMode=quiet");
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0.05);
  expect(
    await page.evaluate(async () =>
      (await import("/js/gpu-renderer.js")).isGPUReady(),
    ),
  ).toBe(false);
  await page.evaluate(() =>
    state.skidMarksNewThisFrame.push({ renderQueueProbe: true }),
  );
  await expect
    .poll(() => page.evaluate(() => state.skidMarksNewThisFrame.length))
    .toBe(0);
  await page.keyboard.down("KeyA");
  await page.keyboard.press("Numpad7");
  await page.keyboard.down("KeyD");
  await expect
    .poll(() => page.evaluate(() => state.engine.rpm))
    .toBeGreaterThan(1500);
  await page.keyboard.up("KeyA");
  await expect
    .poll(() => page.evaluate(() => state.body.speed), { timeout: 8000 })
    .toBeGreaterThan(2);
  await page.keyboard.up("KeyD");
  expect(await page.evaluate(() => Number.isFinite(state.body.speed))).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

for (const [quality, surface, factor] of [
  ["performance", "checker", 0.75],
  ["balanced", "asphalt", 1],
  ["high", "studio", 1],
  ["ultra", "diagnostic", 1.25],
]) {
  test(`GPU ${quality}/${surface} respects logical units and reuses resized targets`, async ({
    page,
  }) => {
    await page.goto(
      `/gauge-guide.html?renderer=gpu&quality=${quality}&surface=${surface}`,
    );
    const available = await page.evaluate(
      async () => !!(await navigator.gpu?.requestAdapter()),
    );
    test.skip(!available, "No WebGPU adapter.");
    const result = await page.evaluate(async () => {
      const gpu = await import("/js/gpu-renderer.js"),
        { default: s } = await import("/js/state.js");
      let device,
        texture,
        allocations = 0;
      const target = {
        width: 64,
        height: 64,
        style: {},
        getContext: () => ({
          configure(opts) {
            device = opts.device;
          },
          getCurrentTexture() {
            if (
              !texture ||
              texture.width !== target.width ||
              texture.height !== target.height
            ) {
              texture?.destroy();
              texture = device.createTexture({
                size: [target.width, target.height],
                format: navigator.gpu.getPreferredCanvasFormat(),
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
              });
              allocations++;
            }
            return texture;
          },
          unconfigure() {
            texture?.destroy();
          },
        }),
      };
      const saved = JSON.stringify(s.params);
      const ok = await gpu.initGPU(target);
      for (const size of [64, 128, 64]) {
        gpu.resizeGPU(size, size);
        gpu.renderFrameGPU(size, size);
      }
      const before = allocations;
      for (let i = 0; i < 20; i++) gpu.renderFrameGPU(64, 64);
      await device.queue.onSubmittedWorkDone();
      return {
        ok,
        width: target.width,
        allocations,
        before,
        stats: gpu.getGPURenderStats(),
        paramsUnchanged: saved === JSON.stringify(s.params),
      };
    });
    expect(result.ok, result.stats.error).toBe(true);
    expect(result.width).toBe(Math.round(64 * factor));
    expect(result.allocations).toBe(result.before);
    expect(result.stats.ready).toBe(true);
    expect(result.paramsUnchanged).toBe(true);
    expect(result.stats.quality).toBe(quality);
    expect(result.stats.surface).toBe(surface);
  });
}

test("initialization failure leaves the simulator running in Canvas", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({
          requestDevice: async () => {
            throw Error("Injected resource exhaustion");
          },
        }),
      },
    });
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?debugMode=quiet");
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0.1);
  const stats = await page.evaluate(async () =>
    (await import("/js/gpu-renderer.js")).getGPURenderStats(),
  );
  expect(stats.ready).toBe(false);
  expect(stats.error).toContain("Injected resource exhaustion");
  expect(stats.resourceCount).toBe(0);
  expect(errors).toEqual([]);
});

test("software adapters automatically select usable Canvas without allocating a device", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: {
        requestAdapter: async () => ({
          info: { isFallbackAdapter: true },
          requestDevice: async () => {
            throw Error("Software device must not be allocated automatically");
          },
        }),
      },
    });
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?debugMode=quiet");
  await page.waitForFunction(() => window.state?.loop.simulationTime > 0.1);
  const stats = await page.evaluate(async () =>
    (await import("/js/gpu-renderer.js")).getGPURenderStats(),
  );
  expect(stats.ready).toBe(false);
  expect(stats.backend).toBe("canvas");
  expect(stats.resourceCount).toBe(0);
  expect(stats.error).toBeNull();
  expect(stats.fallbackReason).toContain("Software");
  expect(errors).toEqual([]);
});

test("smoke billboards are neutral, translucent and irregular in both backends", async ({ page }) => {
  await adapterPage(page);
  const result = await page.evaluate(async () => {
    const device = await (await navigator.gpu.requestAdapter()).requestDevice();
    const module = device.createShaderModule({code: await (await fetch('/js/shaders/smoke.wgsl')).text()});
    const pipeline = await device.createRenderPipelineAsync({layout:'auto', vertex:{module,entryPoint:'vs_main'}, fragment:{module,entryPoint:'fs_main',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
    function buffer(data,usage) {const b=device.createBuffer({size:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,data);return b;}
    const cam=buffer(new Float32Array([1,80,256,256,0,0]),GPUBufferUsage.UNIFORM);
    const settings=buffer(new Float32Array([0,0,0,1,0,0,2,0]),GPUBufferUsage.UNIFORM);
    // Deliberately tinted input must still yield neutral tire smoke.
    const particle=buffer(new Float32Array([0,0,0,0,1,2,2,1,1,0,1,.8]),GPUBufferUsage.STORAGE);
    const flags=buffer(new Uint32Array([1]),GPUBufferUsage.STORAGE);
    const group=(n,bs)=>device.createBindGroup({layout:pipeline.getBindGroupLayout(n),entries:bs.map((b,binding)=>({binding,resource:{buffer:b}}))});
    const texture=device.createTexture({size:[256,256],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    const read=device.createBuffer({size:256*256*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const enc=device.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{view:texture.createView(),clearValue:[0,0,0,0],loadOp:'clear',storeOp:'store'}]});
    pass.setPipeline(pipeline);pass.setBindGroup(0,group(0,[cam,settings]));pass.setBindGroup(1,group(1,[particle,flags]));pass.draw(6);pass.end();
    enc.copyTextureToBuffer({texture},{buffer:read,bytesPerRow:1024},[256,256]);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
    const gpu=new Uint8Array(read.getMappedRange()).slice();read.unmap();device.destroy();
    const {default:s}=await import('/js/state.js');
    const smoke=await import('/js/renderer/smoke-system.js');
    s.params.smokeEnabled=true;s.loop.simulationTime=0;
    const p=smoke.getSmokePool()[0];Object.assign(p,{alive:true,life:1,maxLife:2,sizeBase:1,alpha:.8,r:1,g:0,b:1});p.pos.x=0;p.pos.y=0;p.vel.x=p.vel.y=0;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.translate(128,128);ctx.scale(80,80);
    const {drawFallbackSmoke}=await import('/js/renderer/smoke-fallback.js');drawFallbackSmoke(ctx);
    const preview=document.createElement('canvas');preview.width=preview.height=256;
    const pixels=new Uint8ClampedArray(gpu);
    for(let i=0;i<pixels.length;i+=4) if(pixels[i+3]) for(let c=0;c<3;c++) pixels[i+c]=Math.min(255,pixels[i+c]*255/pixels[i+3]);
    preview.getContext('2d').putImageData(new ImageData(pixels,256,256),0,0);
    document.body.replaceChildren();
    for(const [label,image] of [['WebGPU procedural smoke',preview],['Canvas fallback',canvas]]) {
      const panel=document.createElement('div');panel.style.cssText='display:inline-block;margin:12px;color:white;font:16px sans-serif';
      panel.append(label,document.createElement('br'),image);image.style.cssText='width:480px;height:480px;background:#242729';document.body.append(panel);
    }
    const cpu=ctx.getImageData(0,0,256,256).data;
    function inspect(data) {let tinted=0,visible=0,peak=0;for(let i=0;i<data.length;i+=4){const alpha=data[i+3];if(alpha>5){visible++;if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>2)tinted++;peak=Math.max(peak,alpha);}}return {visible,tinted,peak};}
    return {gpu:inspect(gpu),canvas:inspect(cpu)};
  });
  for(const backend of Object.values(result)){expect(backend.visible).toBeGreaterThan(1000);expect(backend.tinted).toBe(0);expect(backend.peak).toBeGreaterThan(20);expect(backend.peak).toBeLessThan(200);}
  await page.screenshot({path:'docs-smoke-neutral.png'});
});
