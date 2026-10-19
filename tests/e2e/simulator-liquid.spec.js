import { test, expect } from "@playwright/test";
import {
  bootSimulatorLiquid,
  renderSimulatorLiquid,
  impactSimulatorLiquid,
} from "./helpers/simulator-liquid.js";
async function boot(page, query = "") {
  const ok = await bootSimulatorLiquid(page, query);
  test.skip(
    !(await page.evaluate(
      async () => !!(await navigator.gpu?.requestAdapter()),
    )),
    "WebGPU adapter required",
  );
  expect(
    ok,
    await page.evaluate(() => window.__liquidHarness?.gpu.getGPURenderStats()),
  ).toBe(true);
}
test("live world liquid evolves, deposits, dries and reconstructs without modifying vehicle state", async ({
  page,
}) => {
  await boot(page);
  const dry = await renderSimulatorLiquid(page, 0);
  expect(dry.stats.liquid).not.toBeNull();
  await impactSimulatorLiquid(page);
  const before = await page.evaluate(() =>
    JSON.stringify({
      body: window.__liquidHarness.s.body,
      wheels: window.__liquidHarness.s.wheels,
      score: window.__liquidHarness.s.score,
      tirePaint: window.__liquidHarness.s.tirePaint,
    }),
  );
  const peak = await renderSimulatorLiquid(page, 0.7),
    wet = await renderSimulatorLiquid(page, 5),
    late = await renderSimulatorLiquid(page, 72);
  expect(peak.errors).toEqual([]);
  expect(wet.errors).toEqual([]);
  expect(late.errors).toEqual([]);
  expect(peak.stats.liquidError).toBeUndefined();
  expect(peak.stats.liquid.hasArt).toBe(true);
  expect(peak.stats.liquid.airborne).toBe(1);
  expect(wet.stats.liquid.airborne).toBe(0);
  expect(new Set([dry.hash, peak.hash, wet.hash, late.hash]).size).toBe(4);
  expect((await renderSimulatorLiquid(page, 0.7)).hash).toBe(peak.hash);
  expect((await renderSimulatorLiquid(page, 5)).hash).toBe(wet.hash);
  const rebuilt = await renderSimulatorLiquid(page, 5);
  expect(rebuilt.stats.liquid.depositionRebuilds).toBe(
    wet.stats.liquid.depositionRebuilds + 2,
  );
  expect(rebuilt.stats.liquidResourceCount).toBe(wet.stats.liquidResourceCount);
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        body: window.__liquidHarness.s.body,
        wheels: window.__liquidHarness.s.wheels,
        score: window.__liquidHarness.s.score,
        tirePaint: window.__liquidHarness.s.tirePaint,
      }),
    ),
  ).toBe(before);
});
test("multiple coloured impacts persist through camera changes, resets and sprite fallback", async ({
  page,
}) => {
  await boot(page);
  const lighting = await page.evaluate(async () => {
    const d = window.__liquidDevice;
    const sources = await Promise.all(
      ["common", "material"].map((name) =>
        fetch(`/js/shaders/liquid/${name}.wgsl`).then((r) => r.text()),
      ),
    );
    const module = d.createShaderModule({
      code:
        sources.join("\n") +
        `
      @group(0) @binding(1) var<storage,read_write> result:array<vec4<f32>>;
      @compute @workgroup_size(1) fn probe(){
        let ray=normalize(vec3(-1.8,-6.4,8.));
        result[0]=vec4(reflectedEnvironment(vec2(0.),ray,.05),1.);
        result[1]=vec4(reflectedEnvironment(vec2(200.,140.),ray,.05),1.);
      }`,
    });
    const pipeline = await d.createComputePipelineAsync({
      layout: "auto",
      compute: { module, entryPoint: "probe" },
    });
    const uniform = d.createBuffer({
      size: 224,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const result = d.createBuffer({
      size: 32,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const read = d.createBuffer({
      size: 32,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const group = d.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer: result } },
      ],
    });
    try {
      const output = [];
      for (const distant of [1, 0]) {
        const data = new Float32Array(56);
        data[50] = distant;
        d.queue.writeBuffer(uniform, 0, data);
        const e = d.createCommandEncoder(),
          pass = e.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(1);
        pass.end();
        e.copyBufferToBuffer(result, 0, read, 0, 32);
        d.queue.submit([e.finish()]);
        await read.mapAsync(GPUMapMode.READ);
        output.push(Array.from(new Float32Array(read.getMappedRange())));
        read.unmap();
      }
      return output;
    } finally {
      uniform.destroy();
      result.destroy();
      read.destroy();
    }
  });
  expect(lighting[0].slice(0, 4)).toEqual(lighting[0].slice(4, 8));
  expect(lighting[0][0]).toBeGreaterThan(0.1);
  expect(lighting[1].slice(0, 4)).not.toEqual(lighting[1].slice(4, 8));
  await impactSimulatorLiquid(page, { x: -2, hue: 0 });
  await impactSimulatorLiquid(page, { x: 2, hue: 220, time: 0.1 });
  const wet = await renderSimulatorLiquid(page, 5);
  expect(wet.stats.liquid.events).toBe(2);
  expect(wet.errors).toEqual([]);
  await page.evaluate(() => {
    const { s } = window.__liquidHarness;
    s.camera.zoom = 1.5;
    s.camera.x = 2;
    s.body.heading = 0.8;
  });
  const moved = await renderSimulatorLiquid(page, 5);
  expect(moved.hash).not.toBe(wet.hash);
  expect(moved.stats.liquidResourceCount).toBe(wet.stats.liquidResourceCount);
  await page.evaluate(() => {
    const { s } = window.__liquidHarness;
    s.camera.zoom = 1;
    s.camera.x = 0;
    s.body.heading = 0;
  });
  expect((await renderSimulatorLiquid(page, 5)).hash).toBe(wet.hash);
  await page.evaluate(async () => {
    const { vehicleSpriteSettings } =
      await import("/js/renderer/vehicle-sprites.js");
    vehicleSpriteSettings.calibration = true;
  });
  await renderSimulatorLiquid(page, 5);
  expect(
    await page.evaluate(() => window.__liquidHarness.gpu.isGPUVehicleReady()),
  ).toBe(false);
  await page.evaluate(() => window.__liquidHarness.events.resetLiquidImpacts());
  const reset = await renderSimulatorLiquid(page, 5);
  expect(reset.errors).toEqual([]);
  expect(
    await page.evaluate(() => window.__liquidHarness.gpu.isGPUVehicleReady()),
  ).toBe(false);
});
test("liquid opt-out preserves the existing GPU world and Canvas vehicle ownership", async ({
  page,
}) => {
  await boot(page, "liquid=0");
  await impactSimulatorLiquid(page);
  const frame = await renderSimulatorLiquid(page, 1);
  expect(frame.stats.liquid).toBeNull();
  expect(frame.errors).toEqual([]);
  expect(
    await page.evaluate(() => window.__liquidHarness.gpu.isGPUVehicleReady()),
  ).toBe(false);
});
test("real balloon collision emits one liquid event and device loss retains Canvas fallback", async ({
  page,
}) => {
  await boot(page);
  const hit = await page.evaluate(async () => {
    const { s, events } = window.__liquidHarness;
    events.resetLiquidImpacts();
    const wheel = s.wheels.frontLeft;
    s.balloons = [
      {
        x: wheel.x,
        y: wheel.y,
        radius: 0.6,
        hue: 330,
        isPopped: false,
        deformTime: 0,
        deformScale: 1,
        deformDir: { x: 0, y: 0 },
      },
    ];
    for (const w of Object.values(s.wheels)) w.prevY = w.y + 0.2;
    const { checkBalloonCollisions } = await import("/js/balloon.js");
    checkBalloonCollisions(0.01, 2);
    checkBalloonCollisions(0.01, 2);
    return {
      count: events.getLiquidImpacts().events.length,
      event: events.getLiquidImpacts().events[0],
      score: s.score.totalScore,
      popped: s.balloons[0].isPopped,
      hue: s.tractionState.lastBalloonHue,
    };
  });
  expect(hit.count).toBe(1);
  expect(hit.popped).toBe(true);
  expect(hit.score).toBeGreaterThan(0);
  expect(hit.hue).toBe(330);
  expect(hit.event.time).toBe(2);
  expect((await renderSimulatorLiquid(page, 2.7)).errors).toEqual([]);
  const geometry = await page.evaluate(() =>
    JSON.stringify(window.__liquidHarness.s.wheels),
  );
  await page.evaluate(() => window.__liquidDevice.destroy());
  await page.waitForFunction(() => !window.__liquidHarness.gpu.isGPUReady());
  expect(
    await page.evaluate(() => window.__liquidHarness.gpu.isGPUVehicleReady()),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => window.__liquidHarness.gpu.getGPURenderStats().liquidResourceCount,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(() => JSON.stringify(window.__liquidHarness.s.wheels)),
  ).toBe(geometry);
});
test("vehicle ghosts stay in the liquid pass and reuse the existing pose history", async ({
  page,
}) => {
  await boot(page);
  await impactSimulatorLiquid(page);
  const plain = await renderSimulatorLiquid(page, 5);
  await page.evaluate(() => {
    const { s } = window.__liquidHarness;
    s.params.motionBlurIntensity = 0.8;
    s.blurAccumulator = 0.8;
    const pose = (dx) => ({
      cx: s.body.centerX + dx,
      cy: s.body.centerY,
      heading: s.body.heading,
      steerAngle: s.steering.frontWheelAngle,
      wheels: Object.fromEntries(
        Object.entries(s.wheels).map(([name, w]) => [
          name,
          { x: w.x + dx, y: w.y },
        ]),
      ),
    });
    s.carPoseHistory = [pose(-2), pose(0)];
  });
  const ghosts = await renderSimulatorLiquid(page, 5);
  expect(ghosts.stats.liquid.ghostSprites).toBe(5);
  expect(ghosts.hash).not.toBe(plain.hash);
  expect(ghosts.errors).toEqual([]);
  expect(
    await page.evaluate(() => window.__liquidHarness.s.carPoseHistory[0].cx),
  ).toBe(-2);
});
for (const [quality, atlas] of [
  ["performance", 384],
  ["high", 768],
])
  test(`liquid ${quality} has bounded persistent storage across repeated impacts and resize`, async ({
    page,
  }) => {
    await boot(page, `quality=${quality}`);
    await page.evaluate(() => {
      const { events, s, target } = window.__liquidHarness;
      target.width = 256;
      target.height = 256;
      for (let i = 0; i < 26; i++)
        events.recordLiquidImpact(
          { x: 100 + i, y: 100, radius: 0.6, hue: i * 17 },
          22,
          s.body,
          0,
        );
    });
    const first = await renderSimulatorLiquid(page, 5),
      again = await renderSimulatorLiquid(page, 7);
    expect(first.errors).toEqual([]);
    expect(first.stats.liquid.events).toBe(24);
    expect(first.stats.liquid.evictions).toBe(2);
    expect(first.stats.liquid.atlasBytes).toBe(atlas * atlas * 24 * 4);
    expect(again.stats.resourceCount).toBe(first.stats.resourceCount);
    expect(again.stats.residentBytes).toBe(first.stats.residentBytes);
    expect(again.stats.liquid.depositionRebuilds).toBe(
      first.stats.liquid.depositionRebuilds,
    );
    await page.evaluate(() => {
      window.__liquidHarness.target.width = 320;
    });
    const resized = await renderSimulatorLiquid(page, 7);
    expect(resized.errors).toEqual([]);
    expect(resized.stats.resourceCount).toBe(first.stats.resourceCount);
  });
test("a missing liquid shader preserves the existing GPU world", async ({
  page,
}) => {
  await page.route("**/js/shaders/liquid/material.wgsl", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );
  await boot(page);
  await impactSimulatorLiquid(page);
  const frame = await renderSimulatorLiquid(page, 1);
  expect(frame.stats.ready).toBe(true);
  expect(frame.stats.liquid).toBeNull();
  expect(frame.stats.liquidError).toContain("HTTP 404");
  expect(frame.errors).toEqual([]);
});
test("failed liquid target allocation releases the added resources and leaves vehicle state intact", async ({
  page,
}) => {
  await boot(page);
  await impactSimulatorLiquid(page);
  const result = await page.evaluate(() => {
    const { gpu, s } = window.__liquidHarness,
      before = JSON.stringify(s.wheels),
      d = window.__liquidDevice,
      create = d.createTexture.bind(d);
    d.createTexture = (desc) => {
      if (desc.label === "liquid-world-refraction")
        throw Error("test-liquid-allocation");
      return create(desc);
    };
    s.loop.simulationTime = 1;
    gpu.renderFrameGPU(512, 512);
    return {
      before,
      after: JSON.stringify(s.wheels),
      stats: gpu.getGPURenderStats(),
    };
  });
  expect(result.after).toBe(result.before);
  expect(result.stats.ready).toBe(false);
  expect(result.stats.liquidResourceCount).toBe(0);
  expect(result.stats.fallbackReason).toContain("test-liquid-allocation");
});
test("body liquid follows the vehicle after it leaves the world puddle", async ({
  page,
}) => {
  await boot(page);
  await impactSimulatorLiquid(page);
  await page.evaluate(() => {
    const { s } = window.__liquidHarness;
    s.body.centerX += 12;
    s.camera.x += 12;
    for (const w of Object.values(s.wheels)) {
      w.x += 12;
      w.prevX += 12;
    }
  });
  const carried = await renderSimulatorLiquid(page, 5);
  // Same impact seed/location/time, but no body contact: only body film differs.
  await page.evaluate(() => {
    const { events, s } = window.__liquidHarness;
    events.resetLiquidImpacts();
    events.recordLiquidImpact(
      { x: 0, y: -1, radius: 0.6, hue: 0 },
      22,
      s.body,
      0,
    );
  });
  const dryCar = await renderSimulatorLiquid(page, 5);
  expect(carried.errors).toEqual([]);
  expect(dryCar.errors).toEqual([]);
  expect(carried.hash).not.toBe(dryCar.hash);
  expect(carried.stats.liquidResourceCount).toBe(
    dryCar.stats.liquidResourceCount,
  );
});
test("standing liquid stays below opaque balloons rather than dyeing them", async ({
  page,
}) => {
  await boot(page);
  await impactSimulatorLiquid(page);
  await page.evaluate(() => {
    window.__liquidHarness.s.balloons = [
      {
        x: 2,
        y: -2,
        radius: 0.8,
        hue: 160,
        isPopped: false,
        deformScale: 1,
        deformDir: { x: 0, y: 0 },
      },
    ];
  });
  const wet = await renderSimulatorLiquid(page, 5);
  const wetPixel = await page.evaluate(() =>
    Array.from(
      window.__liquidPixels.slice(
        ((256 - 60) * 512 + 256 + 60) * 4,
        ((256 - 60) * 512 + 256 + 60) * 4 + 4,
      ),
    ),
  );
  await page.evaluate(() => window.__liquidHarness.events.resetLiquidImpacts());
  const dry = await renderSimulatorLiquid(page, 5);
  const dryPixel = await page.evaluate(() =>
    Array.from(
      window.__liquidPixels.slice(
        ((256 - 60) * 512 + 256 + 60) * 4,
        ((256 - 60) * 512 + 256 + 60) * 4 + 4,
      ),
    ),
  );
  expect(wet.errors).toEqual([]);
  expect(dry.errors).toEqual([]);
  expect(wet.hash).not.toBe(dry.hash);
  expect(wetPixel).toEqual(dryPixel);
  expect(wetPixel[1]).toBeGreaterThan(wetPixel[0]);
});
