// Controlled offscreen WebGPU benchmark and captures. npm install first.
// node scripts/benchmark-renderer.mjs --url http://localhost:8000 --output /tmp/render-benchmark
// Optional: CHROMIUM_EXECUTABLE=/usr/bin/chromium for system Chromium.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const url = option("--url", "http://localhost:8000");
const output = resolve(option("--output", "/tmp/verlet-render-benchmark"));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const results = [];
try {
  for (const scene of ["empty", "drift", "paint", "combined", "zoom"]) {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    });
    await page.goto(`${url}/gauge-guide.html?gpuProfile=1`);
    const result = await page.evaluate(async (scene) => {
      const { default: s } = await import("/js/state.js");
      const gpu = await import("/js/gpu-renderer.js");
      const { initializeCarBody, computeBodyDerivedState } = await import(
        "/js/physics/kinematics.js"
      );
      initializeCarBody(192, 144);
      computeBodyDerivedState(0.01);
      const { drawVehicleSprites } = await import(
        "/js/renderer/vehicle-sprites.js"
      );
      const {
        applyCameraTransform,
        removeCameraTransform,
        drawSplatDecals,
        drawBalloons,
      } = await import("/js/renderer/world.js");
      let device, texture;
      const original = navigator.gpu.requestAdapter.bind(navigator.gpu);
      const validation = [];
      navigator.gpu.requestAdapter = async (opts) => {
        const a = await original(opts);
        if (!a) return null;
        const request = a.requestDevice.bind(a);
        a.requestDevice = async (desc) => {
          device = await request(desc);
          device.addEventListener("uncapturederror", (e) =>
            validation.push(e.error.message),
          );
          return device;
        };
        return a;
      };
      navigator.gpu.getPreferredCanvasFormat = () => "rgba8unorm";
      const target = {
        width: 1024,
        height: 768,
        style: {},
        getContext: () => ({
          configure({ device, format }) {
            texture = device.createTexture({
              size: [1024, 768],
              format,
              usage:
                GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
            });
          },
          getCurrentTexture: () => texture,
          unconfigure() {
            texture?.destroy();
          },
        }),
      };
      if (!(await gpu.initGPU(target)))
        throw Error(gpu.getGPURenderStats?.().error || "No WebGPU adapter");
      Object.assign(s.camera, {
        x: 192,
        y: 144,
        zoom: scene === "zoom" ? 3 : 1,
      });
      s.params.pixelsPerMeter = 35;
      s.params.motionBlurIntensity = 0;
      const marks = scene === "empty" || scene === "paint" ? 0 : 4000;
      s.skidMarks = Array.from({ length: marks }, (_, i) => {
        const t = i * 0.004,
          r = 6 + (i % 2) * 1.589;
        return {
          x1: 192 + Math.cos(t) * r,
          y1: 144 + Math.sin(t) * r,
          x2: 192 + Math.cos(t + 0.004) * r,
          y2: 144 + Math.sin(t + 0.004) * r,
          width: 0.195,
          alpha: 0.2,
          hue: i > 3000 ? 210 : -1,
        };
      });
      s.skidMarksNewThisFrame = [...s.skidMarks];
      s.splatDecals =
        scene === "paint" || scene === "combined" || scene === "zoom"
          ? Array.from({ length: scene === "paint" ? 1000 : 60 }, (_, i) => ({
              x: 185 + (i % 15),
              y: 140 + Math.floor(i / 15) * 0.5,
              radius: 0.25 + (i % 4) * 0.1,
              hue: (i * 17) % 360,
              alpha: 0.6,
            }))
          : [];
      s.balloons =
        scene === "empty"
          ? []
          : [
              { x: 196, y: 142, radius: 0.7, hue: 35, isPopped: false },
              { x: 189, y: 139, radius: 0.5, hue: 200, isPopped: false },
            ];
      const frames = [],
        encode = [];
      let previous;
      for (let i = 0; i < 90; i++) {
        const now = await new Promise(requestAnimationFrame);
        if (previous !== undefined && i > 10) frames.push(now - previous);
        previous = now;
        s.loop.simulationTime += 1 / 60;
        if (scene === "combined") {
          s.camera.x = 192 + Math.sin(i * 0.02) * 0.5;
        }
        const start = performance.now();
        gpu.renderFrameGPU(1024, 768);
        encode.push(performance.now() - start);
      }
      await device.queue.onSubmittedWorkDone();
      const b = device.createBuffer({
        size: 1024 * 768 * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture },
        { buffer: b, bytesPerRow: 4096 },
        [1024, 768],
      );
      device.queue.submit([encoder.finish()]);
      await b.mapAsync(GPUMapMode.READ);
      const pixels = new Uint8ClampedArray(b.getMappedRange()).slice();
      b.unmap();
      b.destroy();
      const image = document.createElement("canvas");
      image.width = 1024;
      image.height = 768;
      document.body.replaceChildren(image);
      document.body.style.margin = 0;
      const ctx = image.getContext("2d");
      ctx.putImageData(new ImageData(pixels, 1024, 768), 0, 0);
      // Composite the unchanged Canvas layer to make the baseline/new comparison
      // faithful to the application's layering. GPU pixels above are real WGSL.
      applyCameraTransform(ctx, 1024, 768);
      if (!gpu.getGPURenderStats) {
        drawSplatDecals(ctx);
        drawBalloons(ctx);
      }
      const pose = {
        cx: s.body.centerX,
        cy: s.body.centerY,
        heading: s.body.heading,
        steerAngle: 0.2,
        wheels: s.wheels,
        wheelRadius: s.params.wheelRadius,
      };
      let loaded = false;
      for (let i = 0; i < 100; i++) {
        if (drawVehicleSprites(ctx, pose)) {
          loaded = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      removeCameraTransform(ctx);
      const stats = (values) => {
        const sorted = [...values].sort((a, b) => a - b),
          mean = values.reduce((a, b) => a + b, 0) / values.length;
        return {
          mean,
          median: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          p99: sorted[Math.floor(sorted.length * 0.99)],
          variance:
            values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length,
        };
      };
      return {
        scene,
        encodeMs: stats(encode.slice(10)),
        frameMs: stats(frames),
        renderer: gpu.getGPURenderStats?.(),
        validation,
        spriteLoaded: loaded,
      };
    }, scene);
    await page
      .locator("canvas")
      .screenshot({ path: resolve(output, `${scene}.png`) });
    results.push(result);
    await page.close();
  }
  writeFileSync(
    resolve(output, "measurements.json"),
    JSON.stringify(
      {
        backend: "SwiftShader software WebGPU, offscreen; no hardware claims",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify(
      results.map((r) => ({
        scene: r.scene,
        encodeMedian: r.encodeMs.median,
        frameP99: r.frameMs.p99,
        renderer: r.renderer,
      })),
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
