// Real simulator renderFrameGPU and WGSL, into an offscreen readable target.
// This captures material/layering correctness; it does not measure native FPS.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bootSimulatorLiquid,
  renderSimulatorLiquid,
  impactSimulatorLiquid,
} from "../tests/e2e/helpers/simulator-liquid.js";
const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const root = resolve(option("--output", "/tmp/simulator-liquid-capture"));
mkdirSync(root, { recursive: true });
const software = option("--backend", "software") === "software";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: software
    ? [
        "--no-sandbox",
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ]
    : JSON.parse(option("--browser-args", "[]")),
});
try {
  const page = await browser.newPage({
    baseURL: option("--url", "http://localhost:8000"),
    viewport: { width: 720, height: 720 },
  });
  if (
    !(await bootSimulatorLiquid(
      page,
      `quality=${option("--quality", "balanced")}`,
    ))
  )
    throw Error("GPU world initialization failed");
  await page.evaluate(() => {
    const { target, s } = window.__liquidHarness;
    target.width = 720;
    target.height = 720;
    s.params.pixelsPerMeter = 36;
  });
  await impactSimulatorLiquid(page);
  const captures = [];
  for (const time of [0.1, 0.7, 1.3, 5, 18, 72]) {
    const data = await renderSimulatorLiquid(page, time, true);
    await page
      .locator("#liquid-capture")
      .screenshot({ path: resolve(root, `red-${time}.png`) });
    captures.push({ time, ...data });
  }
  await impactSimulatorLiquid(page, { hue: 215, x: 3, y: 0, time: 2 });
  await page.evaluate(() => {
    const { s } = window.__liquidHarness,
      angle = 0.7,
      c = Math.cos(angle),
      sn = Math.sin(angle);
    s.body.heading = angle;
    for (const w of Object.values(s.wheels)) {
      const x = w.x,
        y = w.y - 1;
      w.x = x * c - y * sn;
      w.y = 1 + x * sn + y * c;
    }
    s.camera.zoom = 1.35;
    s.camera.x = 0.5;
  });
  for (const time of [2.7, 7]) {
    const data = await renderSimulatorLiquid(page, time, true);
    await page
      .locator("#liquid-capture")
      .screenshot({ path: resolve(root, `mixed-${time}.png`) });
    captures.push({ time, ...data });
  }
  writeFileSync(
    resolve(root, "measurements.json"),
    JSON.stringify(
      {
        scope:
          "Offscreen simulator world; paused deterministic captures, not native presentation or performance.",
        captures,
      },
      null,
      2,
    ),
  );
  if (captures.some((x) => x.errors.length || x.stats.error))
    throw Error("Rendering errors; inspect measurements.json");
  console.log(`Saved ${captures.length} simulator captures to ${root}`);
} finally {
  await browser.close();
}
