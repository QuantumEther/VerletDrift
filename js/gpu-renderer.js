import {SmokeVolume} from './renderer/smoke-volume.js';
import {VehicleAirflow} from './renderer/vehicle-airflow.js';
import {recordWetTireTransfer} from './renderer/wet-trail-events.js';
import {AtmosphericDust} from './renderer/atmospheric-dust.js';
import { lighting, balloonHue } from './renderer/environment.js';
// GPU world layers and optional procedural liquid. Vehicle/gameplay state is
// read-only. Canvas retains HUD, diagnostics and the fallback vehicle path.
import { renderState as state } from "./state.js";
import { PIXELS_PER_METER, TRAIL_REFERENCE_SPEED } from "./constants.js";
import { getSparkPool } from "./renderer/sparks.js";
import {
  getSmokePool,
  consumeSpawnedSmokeIndices,
  reclaimSmokeParticles,
  getMaxSpawnedSmokeIndex,
  MAX_SMOKE,
} from "./renderer/smoke-system.js";
import { getTrailArrowGeometry } from "./trail.js";
import {
  getViewCamera,
  getCheckerTileMetres,
  isInView,
} from "./renderer/view.js";
import { WorldLiquid } from "./renderer/liquid-world.js";
import { vehicleSpriteSettings } from "./renderer/vehicle-sprites.js";
import { BODY_RECT } from "./renderer/vehicle-geometry.js";
import { GPUSkidCache } from "./renderer/gpu-skid-cache.js";
import { GPUTiming } from "./renderer/gpu-timing.js";
import {
  renderingOptions,
  renderQuality,
  surfaceIndex,
} from "./renderer/render-quality.js";
import { logger } from "./debug/logger.js";

const PREMUL = {
  color: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
  alpha: {
    srcFactor: "one",
    dstFactor: "one-minus-src-alpha",
    operation: "add",
  },
};
const MAX_ARROWS = 20000,
  MAX_PARTICLES = 8000,
  MAX_SURFACE = 16384;
const RGB_PHASE = [0, 8, 4],
  EMPTY_EVENTS = Object.freeze([]);
const SPARK_PALETTE = [
  [1, 0.973, 0.627],
  [1, 0.851, 0.4],
  [1, 0.6, 0.2],
  [1, 1, 0.867],
  [1, 0.702, 0.102],
];
let device,
  adapterRef,
  canvas,
  context,
  format,
  ready = false,
  initializing = false,
  lastSimTime = 0;
let pipelines = {},
  buffers = {},
  groups = {},
  skidCache,
  timing;
let liquidWorld;
let atmosphericDust;
let vehicleAirflow;
let smokeVolume;
let environmentSource="";
let environmentGroups=new Map();
const environmentData=new Float32Array(8);
let rendererGeneration = 0;
const resources = [];
const camera = new Float32Array(6),
  background = new Float32Array(20),
  smokeUniform = new Float32Array(8);
const smokeUniformU32 = new Uint32Array(smokeUniform.buffer);
const arrows = new Float32Array(MAX_ARROWS * 9),
  sparks = new Float32Array(300 * 7),
  splats = new Float32Array(MAX_PARTICLES * 7);
const decals = new Float32Array(MAX_SURFACE * 9),
  balloons = new Float32Array(MAX_SURFACE * 9),
  shadows = new Float32Array(MAX_SURFACE * 9);
const smokeData = new Float32Array(MAX_SMOKE * 12),
  smokeFlags = new Uint32Array(MAX_SMOKE);
const reclaim = [];
let readbackPending = false,
  readbackFrames = 0,
  uploadExistingSmoke = true;
let lastSkidTime = NaN,
  lastSkidEvents,
  lastSkidWidth,
  lastSkidWet,
  cachedSkid;
const smokeDirty = new Uint8Array(MAX_SMOKE);
let renderStats = {
  ready: false,
  backend: "canvas",
  resourceCount: 0,
  fallbackReason: null,
  cpuEncodeMs: 0,
  uploadBytes: 0,
  drawCalls: 0,
  computeWorkgroups: 0,
  smokeComputeWorkgroups: 0,
  gpuRenderMs: null,
  gpuTimingScope:
    "base world pass; separate smoke compute; excludes liquid/upper-world passes, Canvas and presentation",
  residentBytes: 0,
  skidTextureBytes: 0,
  omittedSkids: 0,
  error: null,
  quality: renderingOptions.quality,
  surface: renderingOptions.surface,
  powerPreference: renderingOptions.gpuPower,
  alphaMode: renderingOptions.gpuAlpha,
};
export function getGPURenderStats() {
  return {
    ...renderStats,
    smokeMaterial:smokeVolume?{...smokeVolume.stats,bytes:smokeVolume.bytes}:null,
    smokeAirflow:vehicleAirflow?{...vehicleAirflow.stats,bytes:vehicleAirflow.bytes}:null,
    dust:atmosphericDust?{...atmosphericDust.stats,bytes:atmosphericDust.bytes}:null,
    liquid: liquidWorld
      ? liquidWorld.getStats(state.loop.simulationTime,state.params)
      : null,
    residentBytes: renderStats.residentBytes + (liquidWorld?.ownedBytes ?? 0) + (atmosphericDust?.bytes??0) + (vehicleAirflow?.bytes??0) + (smokeVolume?.bytes??0),
    resourceCount:
      renderStats.resourceCount +
      (liquidWorld
        ? liquidWorld.resourceCount
        : 0) + (atmosphericDust?.resourceCount??0) + (vehicleAirflow?.resourceCount??0) + (smokeVolume?.resourceCount??0),
    liquidResidentBytes: liquidWorld?.ownedBytes ?? 0,
    liquidResourceCount: liquidWorld
      ? liquidWorld.resourceCount
      : 0,
    gpuRenderMs: timing?.milliseconds ?? renderStats.gpuRenderMs,
    gpuComputeMs: timing?.computeMilliseconds ?? null,
    gpuTimestampSamples: timing?.sampleCount ?? 0,
    gpuTimingEnabled: !!timing,
    backingWidth: canvas?.width ?? 0,
    backingHeight: canvas?.height ?? 0,
  };
}
function track(resource) {
  resources.push(resource);
  return resource;
}
function buffer(label, size, usage) {
  return track(device.createBuffer({ label, size, usage }));
}
function uniform(label, size) {
  return buffer(label, size, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
}
function instances(label, size) {
  return buffer(label, size, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
}
function layout(n) {
  return [
    {
      arrayStride: n * 4,
      stepMode: "instance",
      attributes: Array.from({ length: n }, (_, i) => ({
        shaderLocation: i + 1,
        offset: i * 4,
        format: "float32",
      })),
    },
  ];
}
function group(pipeline, entries, index = 0) {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(index),
    entries,
  });
}
const binding = (binding, buffer) => ({ binding, resource: { buffer } });
function release(reason) {
  rendererGeneration++;
  ready = false;
  renderStats.ready = false;
  renderStats.backend = "canvas";
  renderStats.fallbackReason = reason || "GPU resources released";
  if (!renderStats.error) renderStats.error = reason;
  if (canvas) canvas.style && (canvas.style.visibility = "hidden");
  try {
    context?.unconfigure?.();
  } catch {}
  for (const resource of resources) resource.destroy?.();
  resources.length = 0;
  environmentGroups.clear();
  atmosphericDust?.destroy();atmosphericDust=null;
  vehicleAirflow?.destroy();vehicleAirflow=null;
  smokeVolume?.destroy();smokeVolume=null;
  liquidWorld?.destroy();
  liquidWorld = null;
  skidCache?.destroy();
  skidCache = null;
  timing?.destroy();
  timing = null;
  renderStats.residentBytes = 0;
  renderStats.resourceCount = 0;
  device?.destroy?.();
  // GPU positions are not read back: retire existing visual smoke on loss rather
  // than resurrecting it at stale spawn positions. Gameplay state is untouched.
  if (reason) {
    reclaim.length = 0;
    const pool = getSmokePool();
    for (let i = 0; i < pool.length; i++) if (pool[i].alive) reclaim.push(i);
    reclaimSmokeParticles(reclaim);
  }
}
async function shader(name) {
  const r = await fetch(new URL(`./shaders/${name}.wgsl`, import.meta.url), {
    cache: "no-cache",
  });
  if (!r.ok) throw Error(`Shader ${name}: ${r.status}`);
  return device.createShaderModule({ label: name, code: (["background","skid-vector","surface-objects"].includes(name)?environmentSource:"")+await r.text() });
}
async function pipeline(name, stride = 0, strip = false) {
  const module = await shader(name);
  const info = await module.getCompilationInfo?.();
  const errors = info?.messages.filter((m) => m.type === "error");
  if (errors?.length)
    throw Error(`${name}: ${errors.map((m) => m.message).join("; ")}`);
  return device.createRenderPipelineAsync({
    label: name,
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vs_main",
      ...(stride ? { buffers: layout(stride) } : {}),
    },
    fragment: {
      module,
      entryPoint: "fs_main",
      targets: [
        { format, ...(name === "background" ? {} : { blend: PREMUL }) },
      ],
    },
    primitive: { topology: strip ? "triangle-strip" : "triangle-list" },
  });
}
export async function initGPU(target) {
  if (ready) return true;
  if (initializing || renderingOptions.forceCanvas) return false;
  initializing = true;
  canvas = target;
  try {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: renderingOptions.gpuPower,
    });
    if (!adapter) {
      renderStats.fallbackReason = "Browser returned no WebGPU adapter";
      return false;
    }
    adapterRef = adapter;
    const software =
      adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? false;
    renderStats.adapter = {
      vendor: adapter.info?.vendor,
      architecture: adapter.info?.architecture,
      device: adapter.info?.device,
      description: adapter.info?.description,
      isFallbackAdapter: software,
    };
    // Profiling demonstrated that this backend is unsuitable for these effects.
    // Keep CPU-only systems usable instead of equating WebGPU API availability
    // with useful hardware acceleration. Explicit GPU mode is diagnostic only.
    if (software && !renderingOptions.forceGPU) {
      renderStats.fallbackReason = "Software WebGPU adapter; Canvas selected";
      logger.info("gpu", renderStats.fallbackReason);
      return false;
    }
    const profiling =
      new URLSearchParams(globalThis.location?.search || "").get(
        "gpuProfile",
      ) === "1" && adapter.features?.has("timestamp-query");
    device = await adapter.requestDevice(
      profiling ? { requiredFeatures: ["timestamp-query"] } : {},
    );
    if (profiling) timing = new GPUTiming(device);
    context = canvas.getContext("webgpu");
    if (!context) throw Error("WebGPU canvas unavailable");
    format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: renderingOptions.gpuAlpha });
    const ownedDevice = device;
    device.addEventListener?.("uncapturederror", (event) => {
      if (device !== ownedDevice) return;
      logger.warn("gpu", `GPU validation failure: ${event.error.message}`);
      release(event.error.message);
    });
    device.lost?.then((info) => {
      if (device !== ownedDevice) return;
      release(`Device lost: ${info.message || info.reason}`);
      logger.warn("gpu", "Device lost; using Canvas fallback.");
    });
    const envResponse=await fetch(new URL('./shaders/environment.wgsl',import.meta.url));
    if(!envResponse.ok)throw Error('Environment shader unavailable');
    environmentSource=await envResponse.text();
    const [bg, arrow, part, skid, surface] = await Promise.all([
      pipeline("background", 0, true),
      pipeline("arrows", 9),
      pipeline("particles", 7),
      pipeline("skid-vector"),
      pipeline("surface-objects", 9),
    ]);
    delete renderStats.airflowError;
    vehicleAirflow=new VehicleAirflow(device);
    try{
      device.pushErrorScope('validation');
      try{await vehicleAirflow.init();}finally{const error=await device.popErrorScope();if(error)throw Error(error.message);}
    }catch(error){vehicleAirflow.pipeline=null;logger.warn('gpu','Smoke airflow unavailable; retaining original smoke motion.',{error:error.message});renderStats.airflowError=error.message;}
    const smokeComputeModule = await shader("smoke-compute");
    const smoke = await pipeline("smoke");
    const compute = await device.createComputePipelineAsync({
      label: "smoke-compute",
      layout: "auto",
      compute: { module: smokeComputeModule, entryPoint: "computeSmoke" },
    });
    pipelines = { bg, arrow, part, skid, surface, smoke, compute };
    buffers.camera = uniform("worldCamera", 24);
    buffers.bg = uniform("ground", 80);
    buffers.arrows = instances("arrows", arrows.byteLength);
    buffers.sparks = instances("sparks", sparks.byteLength);
    buffers.splats = instances("splats", splats.byteLength);
    buffers.decals = instances("paintDecals", decals.byteLength);
    buffers.balloons = instances("balloons", balloons.byteLength);
    buffers.shadows = instances("contactShadows", shadows.byteLength);
    buffers.smoke = buffer(
      "smokeParticles",
      smokeData.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    buffers.flags = buffer(
      "smokeFlags",
      smokeFlags.byteLength,
      GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
    );
    buffers.readback = buffer(
      "smokeReadback",
      smokeFlags.byteLength,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    );
    buffers.smokeUniform = uniform("smokeUniform", 32);
    groups.bg = group(bg, [binding(0, buffers.bg)]);
    groups.arrow = group(arrow, [binding(0, buffers.camera)]);
    groups.part = group(part, [binding(0, buffers.camera)]);
    groups.surface = group(surface, [binding(0, buffers.camera)]);
    groups.compute = group(compute, [
      binding(0, buffers.smokeUniform),
      binding(1, buffers.smoke),
      binding(2, buffers.flags),
    ]);
    groups.airflow=vehicleAirflow.smokeGroup(compute);
    groups.smokeCamera = group(smoke, [
      binding(0, buffers.camera),
      binding(1, buffers.smokeUniform),
    ]);
    groups.smokeParticles = group(
      smoke,
      [binding(0, buffers.smoke), binding(1, buffers.flags)],
      1,
    );
    delete renderStats.smokeMaterialError;
    smokeVolume=new SmokeVolume(device,format,buffers);
    try{
      device.pushErrorScope('validation');
      try{await smokeVolume.init();}finally{const error=await device.popErrorScope();if(error)throw Error(error.message);}
    }catch(error){smokeVolume.destroy();smokeVolume=null;renderStats.smokeMaterialError=error.message;logger.warn('gpu','Shared smoke unavailable; retaining original shading.',{error:error.message});}
    buffers.environment=device.createBuffer({label:'sceneEnvironment',size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    environmentGroups=new Map([bg,skid,surface].map(p=>[p,device.createBindGroup({layout:p.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:buffers.environment}}]})]));
    atmosphericDust=new AtmosphericDust(device,format,buffers.environment,environmentSource);
    delete renderStats.dustError;
    try{
      device.pushErrorScope('validation');
      try{await atmosphericDust.init();}finally{const error=await device.popErrorScope();if(error)throw Error(error.message);}
    }catch(error){atmosphericDust?.destroy();atmosphericDust=null;renderStats.dustError=error.message;logger.warn('gpu','Atmospheric dust unavailable; existing effects retained.',{error:error.message});}
    skidCache = new GPUSkidCache(device, buffers.camera, skid);
    if (
      new URLSearchParams(globalThis.location?.search || "").get("liquid") !==
      "0"
    ) {
      liquidWorld = new WorldLiquid(device, format, renderingOptions.quality);
      delete renderStats.liquidError;
      try {
        device.pushErrorScope("validation");
        try {
          await liquidWorld.init();
        } finally {
          const error = await device.popErrorScope();
          if (error) throw Error(error.message);
        }
      } catch (error) {
        liquidWorld?.destroy();
        liquidWorld = null;
        renderStats.liquidError = error.message;
        logger.warn(
          "gpu",
          "Liquid effects unavailable; retaining the existing world renderer.",
          { error: error.message },
        );
      }
    }
    smokeFlags.fill(0);
    device.queue.writeBuffer(buffers.flags, 0, smokeFlags);
    lastSkidTime = NaN;
    lastSkidEvents = null;
    cachedSkid = null;
    lastSimTime = state.loop.simulationTime;
    uploadExistingSmoke = true;
    readbackPending = false;
    readbackFrames = 0;
    renderStats.residentBytes =
      resources.reduce((sum, r) => sum + (r.size || 0), 0) +
      32768 * 40 +
      (timing ? 64 : 0);
    renderStats.resourceCount = resources.length + 3 + (timing ? 3 : 0);
    rendererGeneration++;
    renderStats.error = null;
    ready = true;
    renderStats.ready = true;
    renderStats.backend = "webgpu";
    renderStats.fallbackReason = null;
    canvas.style && (canvas.style.visibility = "visible");
    logger.info("gpu", "GPU world renderer initialized.");
    return true;
  } catch (error) {
    release(error.message);
    logger.warn("gpu", "GPU initialization failed; using Canvas fallback.", {
      error: error.message,
    });
    return false;
  } finally {
    initializing = false;
  }
}
export function isGPUVehicleReady() {
  return (
    ready &&
    !!liquidWorld?.hasArt &&
    liquidWorld.active(state.loop.simulationTime,state.params) &&
    vehicleSpriteSettings.enabled &&
    !vehicleSpriteSettings.calibration
  );
}
export function isGPUReady() {
  return ready;
}
export function resizeGPU(width, height) {
  if (!ready) return;
  const limit = device.limits?.maxTextureDimension2D || 8192;
  const scale = Math.min(
    renderQuality.resolution,
    Math.sqrt(renderQuality.maxPixels / Math.max(1, width * height)),
    limit / Math.max(1, width),
    limit / Math.max(1, height),
  );
  width = Math.max(1, Math.floor(width * scale));
  height = Math.max(1, Math.floor(height * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
function rgb(h, s, l, out, offset) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  for (let i = 0; i < 3; i++) {
    const k = (RGB_PHASE[i] + h / 30) % 12;
    out[offset + i] = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  }
}
function skidColor(seg, out, offset) {
  if (seg.hue >= 0 && !(liquidWorld?.trails && state.params.liquidEnabled!==false)) {
    const ps = seg.paintSaturation ?? 1;
    rgb(seg.hue, 30 + ps * 65, 20 + ps * 30, out, offset);
  } else {
    out[offset] = 20 / 255;
    out[offset + 1] = 15 / 255;
    out[offset + 2] = 10 / 255;
  }
}
function write(buf, data, count = data.length) {
  if (count) {
    device.queue.writeBuffer(buf, 0, data, 0, count);
    renderStats.uploadBytes += count * 4;
  }
}
function surface(out, index, x, y, r, seed, hue, alpha, kind) {
  const b = index * 9;
  out[b] = x;
  out[b + 1] = y;
  out[b + 2] = r;
  out[b + 3] = seed;
  if (kind >= 2) {
    out[b + 4] = 0.015;
    out[b + 5] = 0.02;
    out[b + 6] = 0.025;
  } else rgb(hue, kind === 1 ? 78 : 80, kind === 1 ? (state.params.sceneLightingEnabled===false?55:hue===350?38:48) : 40, out, b + 4);
  out[b + 7] = alpha;
  out[b + 8] = kind;
}
function draw(pass, pipeline, bind, vertices, count, instanceBuffer) {
  if (!count) return;
  pass.setPipeline(pipeline);
  if(environmentGroups.has(pipeline))pass.setBindGroup(1,environmentGroups.get(pipeline));
  pass.setBindGroup(0, bind);
  if (instanceBuffer) pass.setVertexBuffer(0, instanceBuffer);
  pass.draw(vertices, count);
  renderStats.drawCalls++;
}
export function renderFrameGPU(width, height) {
  if (!ready) return;
  const start = performance.now();
  renderStats.uploadBytes = 0;
  renderStats.drawCalls = 0;
  renderStats.computeWorkgroups = 0;
  renderStats.smokeComputeWorkgroups = 0;
  try {
    const p = state.params,
      body = state.body,
      cam = state.camera,
      view = getViewCamera(cam, state.screenShake),
      ppm = p.pixelsPerMeter || PIXELS_PER_METER;
    lighting(p,environmentData);write(buffers.environment,environmentData);
    const proceduralVisuals=!!liquidWorld && p.liquidEnabled!==false;
    const halfWidth = width / (2 * cam.zoom * ppm) + 2 / (cam.zoom * ppm);
    const halfHeight = height / (2 * cam.zoom * ppm) + 2 / (cam.zoom * ppm);
    const visible = (x, y, rx, ry = rx) =>
      isInView(x, y, rx, ry, view, halfWidth, halfHeight);
    let culledInstances = 0;
    const elapsed = Math.max(
      0,
      Math.min(0.1, state.loop.simulationTime - lastSimTime),
    );
    lastSimTime = state.loop.simulationTime;
    camera.set([cam.zoom, ppm, width, height, view.x, view.y]);
    write(buffers.camera, camera);
    atmosphericDust?.prepare(state,canvas.width,canvas.height,view,cam.zoom*ppm*canvas.width/width,renderQuality,renderStats.cpuEncodeMs);
    renderStats.uploadBytes+=atmosphericDust?.stats.uploadBytes??0;
    // Same authored blur controls; honor zero values. Purely visual accumulator.
    const speedNorm = Math.max(
      0,
      (body.speed - (p.motionBlurThreshold ?? 10)) /
        Math.max(1, 40 - (p.motionBlurThreshold ?? 10)),
    );
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const target = clamp(
      clamp(speedNorm * speedNorm) * (p.blurSpeedWeight ?? 0.5) +
        (state.driftIntensity || 0) * (p.blurDriftWeight ?? 0.7) +
        clamp(Math.abs(body.angularVelocity) / 2.5) *
          (p.blurAngularWeight ?? 0.4) +
        clamp(
          (state.filteredBody?.jerkMagnitude || body.jerkMagnitude || 0) / 400,
        ) *
          (p.blurJerkWeight ?? 0.3),
    );
    const acc = state.blurAccumulator || 0,
      rate =
        target > acc ? (p.blurAttackRate ?? 0.35) : (p.blurDecayRate ?? 0.04);
    state.blurAccumulator = acc + (target - acc) * rate;
    const blur = state.blurAccumulator * (p.motionBlurIntensity ?? 0.6),
      active = blur > 0.015 && (p.motionBlurSamples ?? 6) > 1;
    const invSpeed = body.speed > 0.001 ? 1 / body.speed : 0;
    background.set([
      view.x,
      view.y,
      cam.zoom,
      ppm,
      width,
      height,
      getCheckerTileMetres(p.checkerboardTileSize),
      blur,
      -body.velocityX * invSpeed,
      -body.velocityY * invSpeed,
      active ? Math.min(body.speed * 0.24 * blur, p.blurMaxOffset ?? 5) : 0,
      active ? Math.min(p.motionBlurSamples ?? 6, 32) : 1,
      surfaceIndex,
      renderQuality.detail,
      body.angularVelocity || 0,
      p.blurOpacityMin ?? 0.1,
      p.blurOpacityMax ?? 0.8,
      p.blurOpacityCurve ?? 2,
      0,
      0,
    ]);
    write(buffers.bg, background);
    let arrowCount = 0,
      arrowCandidates = 0;
    for (const a of state.trail.arrows) {
      const alpha = Math.pow(
        Math.max(0, 1 - a.age / a.lifespan),
        p.trailFade ?? 0.7,
      );
      if (alpha < 0.01) continue;
      if (arrowCandidates++ === MAX_ARROWS) break;
      const g = getTrailArrowGeometry(a.speed);
      const radius = g.length + 1.1 * g.lineWidth;
      if (!visible(a.x, a.y, radius)) {
        culledInstances++;
        continue;
      }
      const b = arrowCount++ * 9;
      arrows[b] = a.x - view.x;
      arrows[b + 1] = a.y - view.y;
      arrows[b + 2] = a.angle;
      arrows[b + 3] = g.length;
      arrows[b + 4] = g.lineWidth;
      const f = a.speed / TRAIL_REFERENCE_SPEED;
      if (f < 1) {
        arrows[b + 5] = f;
        arrows[b + 6] = (200 + 20 * f) / 255;
        arrows[b + 7] = (100 * (1 - f)) / 255;
      } else {
        const t = Math.min(1, f - 1);
        arrows[b + 5] = 1;
        arrows[b + 6] = (220 * (1 - t) + 50 * t) / 255;
        arrows[b + 7] = (50 * t) / 255;
      }
      arrows[b + 8] = alpha;
    }
    write(buffers.arrows, arrows, arrowCount * 9);
    let sparkCount = 0;
    if (p.showSparks)
      for (const s of getSparkPool()) {
        if (!s.alive) continue;
        const t = s.life / s.maxLife,
          b = sparkCount++ * 7,
          c = SPARK_PALETTE[s.hdrIndex % 5];
        sparks[b] = s.x - view.x;
        sparks[b + 1] = s.y - view.y;
        sparks[b + 2] = s.size * (1 - t * 0.5);
        sparks[b + 3] = c[0];
        sparks[b + 4] = c[1];
        sparks[b + 5] = c[2];
        sparks[b + 6] = (1 - t) ** 2;
      }
    write(buffers.sparks, sparks, sparkCount * 7);
    let splatCount = 0;
    for (
      let index = 0;
      index < (proceduralVisuals?0:Math.min(state.splatParticles.length, MAX_PARTICLES));
      index++
    ) {
      const s = state.splatParticles[index];
      if (!visible(s.x, s.y, s.radius)) {
        culledInstances++;
        continue;
      }
      const b = splatCount++ * 7;
      splats[b] = s.x - view.x;
      splats[b + 1] = s.y - view.y;
      splats[b + 2] = s.radius * 2;
      rgb(s.hue, 80, 40, splats, b + 3);
      splats[b + 6] = s.alpha;
    }
    renderStats.omittedSplats = Math.max(
      0,
      state.splatParticles.length - MAX_PARTICLES,
    );
    write(buffers.splats, splats, splatCount * 7);
    let decalCount = 0,
      balloonCount = 0,
      shadowCount = 0;
    let decalCandidates = 0;
    for (const d of proceduralVisuals?EMPTY_EVENTS:state.splatDecals) {
      if (d.alpha <= 0.005) continue;
      if (decalCandidates++ === MAX_SURFACE) break;
      if (!visible(d.x, d.y, d.radius)) {
        culledInstances++;
        continue;
      }
      surface(
        decals,
        decalCount++,
        d.x,
        d.y,
        d.radius,
        d.x * 137.3 + d.y * 271.7,
        d.hue,
        d.alpha,
        0,
      );
    }
    // Soft body footprint stays under the unchanged sprite; dimensions come from
    // the actual rendered artwork, never modify or substitute physical geometry.
    const sh = shadows;
    const cb = Math.cos(body.heading),
      sb = Math.sin(body.heading);
    if(p.sceneLightingEnabled!==false){
      const soft=environmentData[5],sun=environmentData;
      const dx=-sun[0]/Math.max(.25,sun[2])*.65,dy=-sun[1]/Math.max(.25,sun[2])*.65;
      const ox=BODY_RECT.x+BODY_RECT.width*.5,oy=BODY_RECT.y+BODY_RECT.length*.5;
      const x=body.centerX+cb*ox-sb*oy,y=body.centerY+sb*ox+cb*oy;
      // Rounded body shadows use the artwork envelope and heading, not three
      // circular blobs. RGB slots carry rotation for these shadow-only instances.
      surface(sh,shadowCount++,x+dx,y+dy,BODY_RECT.width*(.58+soft*.09),BODY_RECT.length*(.55+soft*.05),0,.38,5);
      sh[(shadowCount-1)*9+4]=cb;sh[(shadowCount-1)*9+5]=sb;
      surface(sh,shadowCount++,x,y,BODY_RECT.width*.54,BODY_RECT.length*.51,0,.38,6);
      sh[(shadowCount-1)*9+4]=cb;sh[(shadowCount-1)*9+5]=sb;
      for(const w of Object.values(state.wheels))surface(sh,shadowCount++,w.x,w.y,.14,.25,0,.52,2);
    }else{
    for (let i = 0; i < 3; i++) {
      const along = (i - 1) * BODY_RECT.length * 0.25;
      surface(
        sh,
        shadowCount++,
        body.centerX - sb * along + 0.04,
        body.centerY + cb * along + 0.08,
        BODY_RECT.width * 0.62,
        BODY_RECT.width * 0.6,
        0,
        0.26,
        2,
      );
    }
    }
    let balloonCandidates = 0;
    for (const b of state.balloons) {
      if (b.isPopped) continue;
      if (balloonCandidates++ === MAX_SURFACE - (p.sceneLightingEnabled===false?3:6)) break;
      const shadowX=p.sceneLightingEnabled===false?.12:-environmentData[0]/Math.max(.25,environmentData[2])*.7;
      const shadowY=p.sceneLightingEnabled===false?.18:-environmentData[1]/Math.max(.25,environmentData[2])*.7;
      // Include long low-elevation shadows as well as the balloon/string.
      if (!visible(b.x,b.y,b.radius*1.2+Math.abs(shadowX),Math.max(b.radius*2+.18,b.radius*.7+Math.abs(shadowY)))) {
        culledInstances += 2;
        continue;
      }
      surface(
        sh,
        shadowCount++,
        b.x + shadowX,
        b.y + shadowY,
        b.radius * 1.2,
        b.radius * 0.7,
        0,
        0.28,
        p.sceneLightingEnabled===false?2:4,
      );
      surface(
        balloons,
        balloonCount++,
        b.x,
        b.y,
        b.radius,
        b.hue * 0.1,
        balloonHue(b.hue,p),
        1,
        1,
      );
    }
    write(buffers.decals, decals, decalCount * 9);
    write(buffers.balloons, balloons, balloonCount * 9);
    write(buffers.shadows, sh, shadowCount * 9);
    renderStats.culledInstances = culledInstances;
    renderStats.instances = {
      decals: decalCount,
      balloons: balloonCount,
      shadows: shadowCount,
      arrows: arrowCount,
      splats: splatCount,
      sparks: sparkCount,
    };
    const skidEvents = p.showSkidMarks ? state.skidMarks : EMPTY_EVENTS,
      skidWidth = p.gpuSkidResolution ?? 1;
    if (
      lastSkidTime !== state.loop.simulationTime ||
      lastSkidEvents !== skidEvents ||
      lastSkidWidth !== skidWidth || lastSkidWet !== proceduralVisuals
    ) {
      cachedSkid = skidCache.update(skidEvents, skidWidth, skidColor, proceduralVisuals,seg=>recordWetTireTransfer(seg,seg.liquidTime??0));
      renderStats.uploadBytes += cachedSkid.uploadedBytes;
      lastSkidTime = state.loop.simulationTime;
      lastSkidEvents = skidEvents;
      lastSkidWidth = skidWidth;lastSkidWet=proceduralVisuals;
    }
    const skid = cachedSkid;
    renderStats.omittedSkids = skid.omitted;
    // Spawn only: upload one contiguous dirty range (sparse slots remain GPU-owned).
    const pool = getSmokePool(),
      spawned = consumeSpawnedSmokeIndices();
    let lo = MAX_SMOKE,
      hi = -1;
    const pack = (i) => {
      const s = pool[i];
      if (!s?.alive) return;
      const b = i * 12;
      // Spawn bursts reuse the staging array without allocating JS tuples.
      smokeData[b] = s.pos.x;
      smokeData[b + 1] = s.pos.y;
      smokeData[b + 2] = s.vel.x;
      smokeData[b + 3] = s.vel.y;
      smokeData[b + 4] = s.life;
      smokeData[b + 5] = s.maxLife;
      smokeData[b + 6] = s.size;
      smokeData[b + 7] = s.sizeBase;
      smokeData[b + 8] = s.r;
      smokeData[b + 9] = s.g;
      smokeData[b + 10] = s.b;
      smokeData[b + 11] = s.alpha;
      smokeFlags[i] = 1;
      smokeDirty[i] = 1;
      lo = Math.min(lo, i);
      hi = Math.max(hi, i);
    };
    if (uploadExistingSmoke) {
      for (let i = 0; i < pool.length; i++) pack(i);
      uploadExistingSmoke = false;
    } else for (const i of spawned) pack(i);
    // Dirty spans can contain living slots between spawns. Upload runs separately
    // so stale CPU positions never overwrite GPU-integrated neighbors.
    if (hi >= lo) {
      for (let i = lo; i <= hi;) {
        if (!smokeDirty[i]) {
          i++;
          continue;
        }
        const first = i;
        while (i <= hi && smokeDirty[i]) {
          smokeDirty[i] = 0;
          i++;
        }
        const count = i - first;
        device.queue.writeBuffer(
          buffers.smoke,
          first * 48,
          smokeData,
          first * 12,
          count * 12,
        );
        device.queue.writeBuffer(
          buffers.flags,
          first * 4,
          smokeFlags,
          first,
          count,
        );
        renderStats.uploadBytes += count * 52;
      }
    }
    const smokeSlots = getMaxSpawnedSmokeIndex() + 1;
    renderStats.smokeSlots = smokeSlots;
    smokeUniform[0] = elapsed;
    smokeUniformU32[1] = smokeSlots;
    smokeUniform[2] = p.smokeCurlNoiseScale ?? 2.5;
    smokeUniform[3] = state.loop.simulationTime;
    smokeUniform[4] = view.x;
    smokeUniform[5] = view.y;
    smokeUniform[6] = renderQuality.smokeDetail;
    smokeUniform[7] = 0;
    write(buffers.smokeUniform, smokeUniform);
    const useLiquid = !!liquidWorld?.active(state.loop.simulationTime,state.params);
    if (useLiquid) {
      liquidWorld.prepare(
        state,
        canvas.width,
        canvas.height,
        view,
        (cam.zoom * ppm * canvas.width) / width,
        isGPUVehicleReady(),
      );
      renderStats.uploadBytes += liquidWorld.stats.uploadBytes;
    }
    vehicleAirflow.prepare(state,!!timing,smokeSlots>0&&elapsed>0);
    renderStats.uploadBytes+=vehicleAirflow.stats.uploadBytes;
    smokeVolume?.prepare(state,canvas.width,canvas.height,cam.zoom*ppm*canvas.width/width,smokeSlots,!!timing);
    renderStats.uploadBytes+=smokeVolume?.stats.uploadBytes??0;
    const encoder = device.createCommandEncoder({ label: "worldFrame" });
    timing?.startFrame();
    if (smokeSlots > 0 && elapsed > 0) {
      renderStats.computeWorkgroups+=vehicleAirflow.encode(encoder);
      const pass = encoder.beginComputePass({
        label: "smokeCompute",
        timestampWrites: timing?.begin("compute"),
      });
      pass.setPipeline(pipelines.compute);
      pass.setBindGroup(0, groups.compute);
      pass.setBindGroup(1, groups.airflow);
      const n = Math.ceil(smokeSlots / 256);
      pass.dispatchWorkgroups(n);
      pass.end();
      renderStats.computeWorkgroups += n;
      renderStats.smokeComputeWorkgroups = n;
    }
    renderStats.computeWorkgroups+=smokeVolume?.encode(encoder)??0;
    renderStats.drawCalls+=smokeVolume?.stats.drawCalls??0;
    renderStats.computeWorkgroups+=atmosphericDust?.encode(encoder)??0;
    const pass = encoder.beginRenderPass({
      label: "worldLayers",
      timestampWrites: timing?.begin(),
      colorAttachments: [
        {
          view: useLiquid
            ? liquidWorld.worldView
            : context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    draw(pass, pipelines.bg, groups.bg, 4, 1);
    draw(
      pass,
      pipelines.surface,
      groups.surface,
      6,
      decalCount,
      buffers.decals,
    );
    draw(pass, pipelines.skid, skidCache.bindGroup, 6, skid.instances);
    draw(pass, pipelines.arrow, groups.arrow, 9, arrowCount, buffers.arrows);
    draw(
      pass,
      pipelines.surface,
      groups.surface,
      6,
      shadowCount,
      buffers.shadows,
    );
    // Upper world objects must not be treated as asphalt by puddle optics.
    const drawUpperWorld = (pass) => {
      renderStats.drawCalls+=atmosphericDust?.draw(pass)??0;
      draw(
        pass,
        pipelines.surface,
        groups.surface,
        6,
        balloonCount,
        buffers.balloons,
      );
      if (smokeSlots > 0 && p.smokeEnabled) {
        if(smokeVolume?.mode){renderStats.drawCalls+=smokeVolume.draw(pass);}else{
        pass.setPipeline(pipelines.smoke);
        pass.setBindGroup(0, groups.smokeCamera);
        pass.setBindGroup(1, groups.smokeParticles);
        pass.draw(6, smokeSlots);
        renderStats.drawCalls++;
        }
      }
      draw(pass, pipelines.part, groups.part, 6, sparkCount, buffers.sparks);
      if (!proceduralVisuals)
        draw(pass, pipelines.part, groups.part, 6, splatCount, buffers.splats);
    };
    if (!useLiquid) drawUpperWorld(pass);
    pass.end();
    if (useLiquid) {
      liquidWorld.encode(
        encoder,
        context.getCurrentTexture().createView(),
        drawUpperWorld,
      );
      renderStats.drawCalls += liquidWorld.stats.drawCalls;
    }
    timing?.encode(encoder);
    const readback =
      smokeSlots > 0 && !readbackPending && ++readbackFrames >= 12;
    if (readback) {
      readbackPending = true;
      readbackFrames = 0;
      encoder.copyBufferToBuffer(
        buffers.flags,
        0,
        buffers.readback,
        0,
        smokeSlots * 4,
      );
    }
    device.queue.submit([encoder.finish()]);
    timing?.submitted();
    atmosphericDust?.submitted?.();
    vehicleAirflow?.submitted();
    smokeVolume?.submitted();
    renderStats.gpuRenderMs = timing?.milliseconds ?? null;
    if (state.skidMarksNewThisFrame) state.skidMarksNewThisFrame.length = 0;
    if (readback) {
      const staging = buffers.readback,
        generation = rendererGeneration;
      staging
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          if (generation !== rendererGeneration) {
            staging.unmap();
            return;
          }
          const flags = new Uint32Array(staging.getMappedRange());
          reclaim.length = 0;
          for (let i = 0; i < smokeSlots; i++)
            if (flags[i] === 0 && pool[i].alive) reclaim.push(i);
          staging.unmap();
          reclaimSmokeParticles(reclaim);
        })
        .catch(() => {})
        .finally(() => {
          if (generation === rendererGeneration) readbackPending = false;
        });
    }
  } catch (error) {
    release(error.message);
    logger.warn("gpu", "GPU frame failed; using Canvas fallback.", {
      error: error.message,
    });
  }
  renderStats.cpuEncodeMs = performance.now() - start;
}

// On-demand diagnostic readback; never invoked by the animation loop.
export async function getDustTracerSnapshot(first=0,count){return atmosphericDust?atmosphericDust.readTracers(first,count):[];}
