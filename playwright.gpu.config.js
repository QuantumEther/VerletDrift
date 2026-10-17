// Executable WGSL tests using software WebGPU. This validates correctness,
// not hardware performance. Optional CHROMIUM_EXECUTABLE selects system Chrome.
import base from "./playwright.config.js";
export default {
  ...base,
  testMatch:
    process.env.GPU_FULL_SUITE === "1"
      ? "**/*.spec.js"
      : "**/gpu-world.spec.js",
  timeout: 60000,
  use: {
    ...base.use,
    video: "off",
    launchOptions: {
      ...(process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
      args: [
        "--no-sandbox",
        "--enable-unsafe-webgpu",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
};
