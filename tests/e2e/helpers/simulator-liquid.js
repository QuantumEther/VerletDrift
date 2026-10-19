export async function bootSimulatorLiquid(page, query = "") {
  await page.goto(`/gauge-guide.html?renderer=gpu&${query}`);
  const available = await page.evaluate(
    async () => !!(await navigator.gpu?.requestAdapter()),
  );
  if (!available) return false;
  return page.evaluate(async () => {
    const original = navigator.gpu.requestAdapter.bind(navigator.gpu);
    window.__liquidErrors = [];
    navigator.gpu.requestAdapter = async (opts) => {
      const a = await original(opts);
      const request = a.requestDevice.bind(a);
      a.requestDevice = async (opts) => {
        const d = await request(opts);
        window.__liquidDevice = d;
        d.addEventListener("uncapturederror", (e) =>
          window.__liquidErrors.push(e.error.message),
        );
        return d;
      };
      return a;
    };
    const gpu = await import("/js/gpu-renderer.js"),
      { default: s } = await import("/js/state.js"),
      events = await import("/js/renderer/liquid-events.js"),
      { initializeCarBody } = await import("/js/physics/index.js");
    initializeCarBody(0, 1);
    Object.assign(s.body, {
      centerX: 0,
      centerY: 1,
      heading: 0,
      velocityX: 0,
      velocityY: -22,
      speed: 22,
    });
    Object.assign(s.camera, { x: 0, y: 0, zoom: 1 });
    s.params.pixelsPerMeter = 30;
    s.params.motionBlurIntensity = 0;
    s.params.smokeEnabled = false;
    s.params.showSparks = false;
    s.params.showSkidMarks = true;
    s.params.showTrailArrows = false;
    s.loop.simulationTime = 0;
    s.balloons = [];
    s.skidMarks = [];
    s.skidMarksNewThisFrame = [];
    s.splatParticles = [];
    s.splatDecals = [];
    s.carPoseHistory = [];
    s.screenShake.magnitude = 0;
    navigator.gpu.getPreferredCanvasFormat = () => "rgba8unorm";
    const target = {
      width: 512,
      height: 512,
      style: {},
      getContext: () => ({
        configure({ device, format }) {
          window.__liquidTargetDevice = device;
          window.__liquidTargetFormat = format;
        },
        getCurrentTexture() {
          if (
            !window.__liquidTarget ||
            window.__liquidTarget.width !== target.width ||
            window.__liquidTarget.height !== target.height
          ) {
            window.__liquidTarget?.destroy();
            window.__liquidTarget = window.__liquidTargetDevice.createTexture({
              size: [target.width, target.height],
              format: window.__liquidTargetFormat,
              usage:
                GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            });
          }
          return window.__liquidTarget;
        },
        unconfigure() {
          window.__liquidTarget?.destroy();
          window.__liquidTarget = null;
        },
      }),
    };
    window.__liquidHarness = { gpu, s, events, target };
    return gpu.initGPU(target);
  });
}
export async function renderSimulatorLiquid(page, time, paint = false) {
  return page.evaluate(
    async ({ time, paint }) => {
      const { gpu, s, target } = window.__liquidHarness;
      s.loop.simulationTime = time;
      gpu.renderFrameGPU(target.width, target.height);
      const d = window.__liquidDevice,
        t = window.__liquidTarget;
      if (!t) throw Error(JSON.stringify(gpu.getGPURenderStats()));
      const stride = Math.ceil((t.width * 4) / 256) * 256,
        read = d.createBuffer({
          size: stride * t.height,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
      const enc = d.createCommandEncoder();
      enc.copyTextureToBuffer(
        { texture: t },
        { buffer: read, bytesPerRow: stride },
        [t.width, t.height],
      );
      d.queue.submit([enc.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      const raw = new Uint8Array(read.getMappedRange()),
        pixels = new Uint8ClampedArray(t.width * t.height * 4);
      for (let y = 0; y < t.height; y++)
        pixels.set(
          raw.subarray(y * stride, y * stride + t.width * 4),
          y * t.width * 4,
        );
      read.unmap();
      read.destroy();
      let hash = 2166136261;
      for (const x of pixels) hash = Math.imul(hash ^ x, 16777619) >>> 0;
      if (paint) {
        let canvas = document.querySelector("#liquid-capture");
        if (!canvas) {
          canvas = document.createElement("canvas");
          canvas.id = "liquid-capture";
          document.body.replaceChildren(canvas);
        }
        canvas.width = t.width;
        canvas.height = t.height;
        canvas
          .getContext("2d")
          .putImageData(new ImageData(pixels, t.width, t.height), 0, 0);
      }
      window.__liquidPixels = pixels;
      return {
        hash,
        stats: gpu.getGPURenderStats(),
        errors: window.__liquidErrors,
      };
    },
    { time, paint },
  );
}
export async function impactSimulatorLiquid(page, extra = {}) {
  await page.evaluate((extra) => {
    const { events, s } = window.__liquidHarness;
    events.recordLiquidImpact(
      {
        x: extra.x ?? 0,
        y: extra.y ?? -1,
        radius: extra.radius ?? 0.6,
        hue: extra.hue ?? 0,
      },
      extra.speed ?? 22,
      s.body,
      extra.time ?? 0,
    );
  }, extra);
}
