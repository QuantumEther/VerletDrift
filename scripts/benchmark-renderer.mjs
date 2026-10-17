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
const backend = option("--backend", "software");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args:
    backend === "native"
      ? ["--no-sandbox"]
      : [
          "--no-sandbox",
          "--enable-unsafe-webgpu",
          "--use-angle=swiftshader",
          "--enable-unsafe-swiftshader",
        ],
});
const results = [];
try {
  for (const scene of option(
    "--scenes",
    "empty,drift,paint,combined,zoom",
  ).split(",")) {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    });
    await page.goto(
      `${url}/gauge-guide.html?renderer=gpu&gpuProfile=0&vehicleCalibration=${process.argv.includes("--calibration") ? "1" : "0"}`,
    );
    const result = await page.evaluate(
      async ({ scene, frameCount, fenced }) => {
        const { default: s } = await import("/js/state.js");
        const gpu = await import("/js/gpu-renderer.js");
        const { initializeCarBody, computeBodyDerivedState } = await import(
          "/js/physics/kinematics.js"
        );
        initializeCarBody(scene === "zoom" ? 198 : 192, 144);
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
        let device, texture, adapterInfo;
        const gpuSamples = [];
        const original = navigator.gpu.requestAdapter.bind(navigator.gpu);
        const validation = [];
        navigator.gpu.requestAdapter = async (opts) => {
          const a = await original(opts);
          if (!a) return null;
          adapterInfo = {
            vendor: a.info?.vendor,
            architecture: a.info?.architecture,
            description: a.info?.description,
            isFallbackAdapter:
              a.info?.isFallbackAdapter ?? a.isFallbackAdapter ?? null,
          };
          const request = a.requestDevice.bind(a);
          a.requestDevice = async (desc) => {
            const timestamps = a.features.has("timestamp-query");
            device = await request(
              timestamps
                ? {
                    ...desc,
                    requiredFeatures: [
                      ...new Set([
                        ...(desc?.requiredFeatures || []),
                        "timestamp-query",
                      ]),
                    ],
                  }
                : desc,
            );
            if (timestamps) {
              // Identical external instrumentation for old and new renderers.
              const queries = device.createQuerySet({
                type: "timestamp",
                count: 2,
              });
              const resolve = device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
              });
              const read = device.createBuffer({
                size: 16,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
              });
              let pending = false,
                encoded = false,
                frame = 0;
              const create = device.createCommandEncoder.bind(device);
              device.createCommandEncoder = (descriptor) => {
                const encoder = create(descriptor),
                  begin = encoder.beginRenderPass.bind(encoder),
                  finish = encoder.finish.bind(encoder);
                let sampled = false;
                encoder.beginRenderPass = (descriptor) => {
                  if (
                    ["main", "worldLayers"].includes(descriptor.label) &&
                    !pending &&
                    ++frame % 15 === 0
                  ) {
                    sampled = true;
                    descriptor = {
                      ...descriptor,
                      timestampWrites: {
                        querySet: queries,
                        beginningOfPassWriteIndex: 0,
                        endOfPassWriteIndex: 1,
                      },
                    };
                  }
                  return begin(descriptor);
                };
                encoder.finish = () => {
                  if (sampled) {
                    encoder.resolveQuerySet(queries, 0, 2, resolve, 0);
                    encoder.copyBufferToBuffer(resolve, 0, read, 0, 16);
                    pending = true;
                    encoded = true;
                  }
                  return finish();
                };
                return encoder;
              };
              const submit = device.queue.submit.bind(device.queue);
              device.queue.submit = (commands) => {
                submit(commands);
                if (encoded) {
                  encoded = false;
                  read
                    .mapAsync(GPUMapMode.READ)
                    .then(() => {
                      const times = new BigUint64Array(read.getMappedRange());
                      gpuSamples.push(Number(times[1] - times[0]) / 1e6);
                      read.unmap();
                    })
                    .catch(() => {})
                    .finally(() => {
                      pending = false;
                    });
                }
              };
            }
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
          x: scene === "zoom" ? 198 : 192,
          y: 144,
          zoom: scene === "zoom" ? 3 : 1,
        });
        s.params.pixelsPerMeter = 35;
        s.params.motionBlurIntensity = 0;
        if (scene === "blur") {
          s.params.motionBlurSamples = 12;
          s.params.motionBlurIntensity = .8;
          s.body.speed = 30;
          s.body.velocityX = 30;
          s.body.angularVelocity = .8;
          s.blurAccumulator = .8;
        }
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
        const smokeScene = scene === "smoke";
        const smoke = smokeScene
          ? await import("/js/renderer/smoke-system.js")
          : null;
        if (smokeScene) {
          s.params.determinismMode = true;
          s.params.determinismSeed = 123;
          s.params.smokeEnabled = true;
          s.body.speed = 20;
          s.body.velocityY = -20;
          for (const name of [
            "frontLeft",
            "frontRight",
            "rearLeft",
            "rearRight",
          ])
            s.wheelSlipRatio[name] = 2;
        }
        const frames = [],
          encode = [];
        let previous;
        for (let i = 0; i < frameCount; i++) {
          const now = await new Promise(requestAnimationFrame);
          if (previous !== undefined && i > 10) frames.push(now - previous);
          previous = now;
          s.loop.simulationTime += 1 / 60;
          if (smokeScene) smoke.updateSmoke(1 / 60);
          if (scene === "combined") {
            s.camera.x = 192 + Math.sin(i * 0.02) * 0.5;
          }
          const start = performance.now();
          gpu.renderFrameGPU(1024, 768);
          encode.push(performance.now() - start);
          if (fenced) await device.queue.onSubmittedWorkDone(); // Benchmark only, never the live render path.
        }
        await device.queue.onSubmittedWorkDone();
        await new Promise((resolve) => setTimeout(resolve, 0));
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
          viewScale: s.params.pixelsPerMeter * s.camera.zoom,
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
              values.reduce((sum, x) => sum + (x - mean) ** 2, 0) /
              values.length,
          };
        };
        return {
          scene,
          adapterInfo,
          completionFenced: fenced,
          encodeMs: stats(encode.slice(10)),
          frameMs: stats(frames),
          renderer: gpu.getGPURenderStats?.(),
          gpuMainPassSamplesMs: gpuSamples,
          validation,
          spriteLoaded: loaded,
        };
      },
      {
        scene,
        frameCount: Number(option("--frames", "90")),
        fenced: process.argv.includes("--fenced"),
      },
    );
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
        requestedBackend: backend,
        measurementScope:
          "Offscreen; timestamps cover main render pass only; no automatic hardware claims",
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
