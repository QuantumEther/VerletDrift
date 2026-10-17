// Canvas-only visual preferences. Never write simulation params or saved presets.
const query = new URLSearchParams(globalThis.location?.search || "");
const presets = Object.freeze({
  performance: Object.freeze({
    resolution: 0.75,
    detail: 0,
    smokeDetail: 0,
    maxPixels: 4 * 1024 * 1024,
  }),
  balanced: Object.freeze({
    resolution: 1,
    detail: 1,
    smokeDetail: 1,
    maxPixels: 8 * 1024 * 1024,
  }),
  high: Object.freeze({
    resolution: 1,
    detail: 2,
    smokeDetail: 2,
    maxPixels: 12 * 1024 * 1024,
  }),
  ultra: Object.freeze({
    resolution: 1.25,
    detail: 3,
    smokeDetail: 3,
    maxPixels: 16 * 1024 * 1024,
  }),
});
const surfaces = ["checker", "asphalt", "studio", "diagnostic"];
export const renderingOptions = Object.freeze({
  quality: Object.hasOwn(presets, query.get("quality"))
    ? query.get("quality")
    : "balanced",
  surface: surfaces.includes(query.get("surface"))
    ? query.get("surface")
    : "asphalt",
  forceCanvas: query.get("renderer") === "canvas",
  forceGPU: query.get("renderer") === "gpu",
});
export const renderQuality = presets[renderingOptions.quality];
export const surfaceIndex = surfaces.indexOf(renderingOptions.surface);
