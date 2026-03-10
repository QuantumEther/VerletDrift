// =============================================================
// GPU-RENDERER — WebGPU world-space rendering
// =============================================================
// Replaces Canvas 2D world-space draw calls:
//   drawCheckerboard  → background.wgsl   (12,000 fillRects → 1 draw call)
//   drawTrailArrows   → arrows.wgsl       (3,000 Canvas ops → 1 draw call)
//   drawSparks        → particles.wgsl    (sparks)
//   drawSplatParticles→ particles.wgsl    (splat particles)
//   drawSkidMarks     → skid-accumulate + skid-composite (O(new) per frame)
//
// HUD (bars, gear, score) and gauge canvases stay in Canvas 2D.
// Balloons, map boundary, car, decals stay in Canvas 2D (simCanvas z:1).
// =============================================================

import { renderState as state } from './state.js';
import {
  PIXELS_PER_METER,
  TRAIL_ARROW_BASE_LENGTH_PX,
  TRAIL_REFERENCE_SPEED,
  DEFAULT_MAP_WIDTH,
  DEFAULT_MAP_HEIGHT,
} from './constants.js';
import { getSparkPool } from './renderer/index.js';


// =============================================================
// CONSTANTS
// =============================================================

const SKID_TEX_W    = 4096;
const SKID_TEX_H    = 3072;
const MAP_W         = DEFAULT_MAP_WIDTH;   // 300 m
const MAP_H         = DEFAULT_MAP_HEIGHT;  // 240 m
const MAP_CX        = MAP_W / 2;           // 150 m — map-centre X
const MAP_CY        = MAP_H / 2;           // 120 m — map-centre Y
const MAX_ARROWS    = 600;
const MAX_SPARKS_GPU = 300;   // must match renderer.js MAX_SPARKS
const MAX_SPLATS    = 600;
const MAX_SKID_NEW  = 2048;   // max new skid segments uploaded per render frame

// Float RGB for spark palette (matches SPARK_COLORS_SDR in renderer.js).
// Index matches spark.hdrIndex.
const SPARK_RGB = [
  [1.000, 0.973, 0.627],  // #fff8a0 — bright yellow
  [1.000, 0.851, 0.400],  // #ffd966 — golden
  [1.000, 0.600, 0.200],  // #ff9933 — orange
  [1.000, 1.000, 0.867],  // #ffffdd — near-white hot
  [1.000, 0.702, 0.102],  // #ffb31a — deep gold
];


// =============================================================
// MODULE STATE
// =============================================================

let device   = null;
let gpuCanvas = null;
let gpuCtx   = null;
let gpuFmt   = 'bgra8unorm';
let ready    = false;

// Render pipelines
let bgPipeline     = null;   // checkerboard + motion blur
let arrowPipeline  = null;   // instanced trail arrows
let partPipeline   = null;   // instanced particles (sparks + splats, shared)
let accumPipeline  = null;   // skid mark accumulation → skidTex
let compPipeline   = null;   // skid texture composite → swap chain

// Uniform buffers (UNIFORM | COPY_DST)
let bgUniBuf    = null;   // BgUniforms  (64 bytes)
let camUniBuf   = null;   // CameraUniforms (16 bytes) — shared by arrows + particles
let accumUniBuf = null;   // AccumUniforms (16 bytes)
let compUniBuf  = null;   // CompositeUniforms (16 bytes)

// Instance buffers (VERTEX | COPY_DST)
let arrowInstBuf = null;
let sparkInstBuf = null;
let splatInstBuf = null;
let skidInstBuf  = null;

// Skid accumulation texture (rgba8unorm, full-map coverage)
let skidTex     = null;
let skidTexView = null;
let skidSampler = null;

// Bind groups (created once after pipeline + buffer creation)
let bgBindGroup    = null;
let arrowBindGroup = null;
let partBindGroup  = null;   // shared by sparks + splats (same pipeline, same uniform)
let accumBindGroup = null;
let compBindGroup  = null;

// CPU-side staging arrays (reused every frame, no GC pressure)
const BG_DATA    = new Float32Array(16);
const CAM_DATA   = new Float32Array(4);
const ACCUM_DATA = new Float32Array(4);
const COMP_DATA  = new Float32Array(4);
const arrowData  = new Float32Array(MAX_ARROWS * 9);
const sparkData  = new Float32Array(MAX_SPARKS_GPU * 7);
const splatData  = new Float32Array(MAX_SPLATS * 7);
const skidData   = new Float32Array(MAX_SKID_NEW * 9);


// =============================================================
// HELPERS
// =============================================================

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// HSL (h: 0-360, s/l: 0-100) → linear RGB [0,1].
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return [f(0), f(8), f(4)];
}

// Speed → RGB for trail arrows (matches trail.js speedToColor, no alpha).
function speedToRgb(speed) {
  const ref = TRAIL_REFERENCE_SPEED;
  let r, g, b;
  if (speed < ref) {
    const f = speed / ref;
    r = f;
    g = (200 + 20 * f) / 255;
    b = (100 * (1 - f)) / 255;
  } else {
    const f = Math.min(1, (speed - ref) / ref);
    r = 1.0;
    g = (220 * (1 - f) + 50 * f) / 255;
    b = (50 * f) / 255;
  }
  return [r, g, b];
}

// Load a WGSL shader from js/shaders/.
async function loadWGSL(name) {
  const url = new URL(`./shaders/${name}`, import.meta.url);
  const r   = await fetch(url);
  if (!r.ok) throw new Error(`[GPU] Failed to load shader ${name}: ${r.status}`);
  return r.text();
}

// Create a GPU uniform buffer.
function makeUniBuf(sz) {
  return device.createBuffer({
    size:  sz,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

// Create a GPU instance/vertex buffer.
function makeInstBuf(byteSize) {
  return device.createBuffer({
    size:  byteSize,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
}

// Premultiplied-alpha blend descriptor (used by arrows, particles, composite).
const PREMUL_BLEND = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

// Instance buffer attribute layout: stride 36 bytes (9 × f32), step 'instance'.
// locations 1–9 follow the @location annotations in WGSL.
function makeInstLayout9(/* locations 1-9 */) {
  const attrs = [];
  for (let i = 0; i < 9; i++) {
    attrs.push({ shaderLocation: i + 1, offset: i * 4, format: 'float32' });
  }
  return [{ arrayStride: 36, stepMode: 'instance', attributes: attrs }];
}

// Instance buffer attribute layout: stride 28 bytes (7 × f32), step 'instance'.
// locations 1–7.
function makeInstLayout7() {
  const attrs = [];
  for (let i = 0; i < 7; i++) {
    attrs.push({ shaderLocation: i + 1, offset: i * 4, format: 'float32' });
  }
  return [{ arrayStride: 28, stepMode: 'instance', attributes: attrs }];
}


// =============================================================
// PIPELINE CREATION
// =============================================================

async function createAllPipelines() {
  const [bgWGSL, arrowWGSL, partWGSL, accumWGSL, compWGSL] = await Promise.all([
    loadWGSL('background.wgsl'),
    loadWGSL('arrows.wgsl'),
    loadWGSL('particles.wgsl'),
    loadWGSL('skid-accumulate.wgsl'),
    loadWGSL('skid-composite.wgsl'),
  ]);

  const bgMod    = device.createShaderModule({ code: bgWGSL,    label: 'background' });
  const arrowMod = device.createShaderModule({ code: arrowWGSL, label: 'arrows' });
  const partMod  = device.createShaderModule({ code: partWGSL,  label: 'particles' });
  const accumMod = device.createShaderModule({ code: accumWGSL, label: 'skid-accum' });
  const compMod  = device.createShaderModule({ code: compWGSL,  label: 'skid-comp' });

  // 1. Background — full-screen triangle-strip quad, no vertex buffer.
  bgPipeline = await device.createRenderPipelineAsync({
    label:  'background',
    layout: 'auto',
    vertex: { module: bgMod, entryPoint: 'vs_main' },
    fragment: {
      module: bgMod,
      entryPoint: 'fs_main',
      targets: [{ format: gpuFmt }],  // opaque, no blend needed
    },
    primitive: { topology: 'triangle-strip' },
  });

  // 2. Trail arrows — instanced, 9 verts hard-coded in shader.
  arrowPipeline = await device.createRenderPipelineAsync({
    label:  'arrows',
    layout: 'auto',
    vertex: {
      module:     arrowMod,
      entryPoint: 'vs_main',
      buffers:    makeInstLayout9(),
    },
    fragment: {
      module:     arrowMod,
      entryPoint: 'fs_main',
      targets:    [{ format: gpuFmt, blend: PREMUL_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // 3. Particles (sparks + splats) — instanced unit quads.
  partPipeline = await device.createRenderPipelineAsync({
    label:  'particles',
    layout: 'auto',
    vertex: {
      module:     partMod,
      entryPoint: 'vs_main',
      buffers:    makeInstLayout7(),
    },
    fragment: {
      module:     partMod,
      entryPoint: 'fs_main',
      targets:    [{ format: gpuFmt, blend: PREMUL_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // 4. Skid accumulation — instanced quads, renders to skidTex (rgba8unorm).
  accumPipeline = await device.createRenderPipelineAsync({
    label:  'skid-accum',
    layout: 'auto',
    vertex: {
      module:     accumMod,
      entryPoint: 'vs_main',
      buffers:    makeInstLayout9(),
    },
    fragment: {
      module:     accumMod,
      entryPoint: 'fs_main',
      targets:    [{ format: 'rgba8unorm', blend: PREMUL_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // 5. Skid composite — full-screen quad sampling skidTex.
  compPipeline = await device.createRenderPipelineAsync({
    label:  'skid-comp',
    layout: 'auto',
    vertex:   { module: compMod, entryPoint: 'vs_main' },
    fragment: {
      module:     compMod,
      entryPoint: 'fs_main',
      targets:    [{ format: gpuFmt, blend: PREMUL_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });
}


// =============================================================
// BUFFER AND BIND GROUP SETUP
// =============================================================

function createBuffersAndBindGroups() {
  // Uniform buffers
  bgUniBuf    = makeUniBuf(64);   // 16 × f32
  camUniBuf   = makeUniBuf(16);   // 4  × f32
  accumUniBuf = makeUniBuf(16);   // 4  × f32
  compUniBuf  = makeUniBuf(16);   // 4  × f32

  // Instance buffers
  arrowInstBuf = makeInstBuf(MAX_ARROWS    * 36);  // 9 × f32 per arrow
  sparkInstBuf = makeInstBuf(MAX_SPARKS_GPU * 28);  // 7 × f32 per spark
  splatInstBuf = makeInstBuf(MAX_SPLATS    * 28);  // 7 × f32 per splat
  skidInstBuf  = makeInstBuf(MAX_SKID_NEW  * 36);  // 9 × f32 per segment

  // Skid accumulation texture — full-map-coverage at 4096×3072.
  // rgba8unorm: same format as 'load' render attachment.
  skidTex = device.createTexture({
    label:  'skidAccum',
    size:   [SKID_TEX_W, SKID_TEX_H],
    format: 'rgba8unorm',
    usage:  GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  skidTexView = skidTex.createView();

  skidSampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Bind groups — created after pipeline compilation (for layout inference).
  bgBindGroup = device.createBindGroup({
    label:   'bgBG',
    layout:  bgPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: bgUniBuf } }],
  });

  arrowBindGroup = device.createBindGroup({
    label:   'arrowBG',
    layout:  arrowPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: camUniBuf } }],
  });

  partBindGroup = device.createBindGroup({
    label:   'partBG',
    layout:  partPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: camUniBuf } }],
  });

  accumBindGroup = device.createBindGroup({
    label:   'accumBG',
    layout:  accumPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: accumUniBuf } }],
  });

  compBindGroup = device.createBindGroup({
    label:   'compBG',
    layout:  compPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: compUniBuf } },
      { binding: 1, resource: skidTexView },
      { binding: 2, resource: skidSampler },
    ],
  });

  // Upload constant AccumUniforms (never changes at runtime).
  // zoom=1.0 so texture maps 1:1 to world space; ppm = texels per metre.
  ACCUM_DATA[0] = 1.0;                  // zoom (fixed)
  ACCUM_DATA[1] = SKID_TEX_W / MAP_W;  // ppm for texture space (≈13.65 tx/m)
  ACCUM_DATA[2] = SKID_TEX_W;
  ACCUM_DATA[3] = SKID_TEX_H;
  device.queue.writeBuffer(accumUniBuf, 0, ACCUM_DATA);

  // Clear skid texture to fully transparent (0,0,0,0).
  const clearEnc = device.createCommandEncoder({ label: 'skidClear' });
  clearEnc.beginRenderPass({
    colorAttachments: [{
      view:       skidTexView,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp:     'clear',
      storeOp:    'store',
    }],
  }).end();
  device.queue.submit([clearEnc.finish()]);
}


// =============================================================
// PUBLIC API
// =============================================================

// Initialises the WebGPU device, compiles all pipelines, and creates buffers.
// Returns true if WebGPU is available and init succeeded; false otherwise.
export async function initGPU(canvas) {
  if (!navigator.gpu) {
    console.warn('[GPU] WebGPU not available — falling back to Canvas 2D.');
    return false;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.warn('[GPU] No WebGPU adapter — falling back to Canvas 2D.');
    return false;
  }

  device    = await adapter.requestDevice();
  gpuCanvas = canvas;
  gpuCtx    = canvas.getContext('webgpu');
  gpuFmt    = navigator.gpu.getPreferredCanvasFormat();

  gpuCtx.configure({
    device,
    format:    gpuFmt,
    alphaMode: 'premultiplied',
  });

  // Compile all shaders before marking ready (avoids first-frame stutter).
  await createAllPipelines();
  createBuffersAndBindGroups();

  ready = true;
  console.log('[GPU] WebGPU initialised. Format:', gpuFmt);
  return true;
}

export function isGPUReady() { return ready; }


// Resize gpuCanvas pixel dimensions to match simCanvas.
// Call whenever the main canvas is resized.
export function resizeGPU(w, h) {
  if (!ready) return;
  if (gpuCanvas.width !== w || gpuCanvas.height !== h) {
    gpuCanvas.width  = w;
    gpuCanvas.height = h;
  }
}


// =============================================================
// RENDER FRAME
// =============================================================

// Renders one GPU frame. Must be called AFTER the interpolated state has been
// applied to state.body / state.camera (main.js does this before calling).
// canvasWidth/Height: physical pixel dimensions of the canvas this frame.
export function renderFrameGPU(canvasWidth, canvasHeight) {
  if (!ready) return;

  resizeGPU(canvasWidth, canvasHeight);

  const camera = state.camera;
  const body   = state.body;
  const params = state.params;
  const ppm    = params.pixelsPerMeter || PIXELS_PER_METER;
  const zoom   = camera.zoom;
  const eff    = zoom * ppm;  // effective pixels per metre

  // ---- Blur accumulator (mirrors drawCheckerboard logic in renderer.js) ----
  // Kept here so the GPU path doesn't need to call drawCheckerboard at all.
  const speed        = body.speed;
  const blurSamplesN = params.motionBlurSamples     || 6;
  const blurIntensity = params.motionBlurIntensity   || 0.6;
  const blurMaxOff   = params.blurMaxOffset          || 5.0;
  const blurAttack   = params.blurAttackRate         || 0.35;
  const blurDecay    = params.blurDecayRate          || 0.04;
  const threshold    = params.motionBlurThreshold    || 10;

  const speedNorm  = Math.max(0, (speed - threshold) / Math.max(1, 40 - threshold));
  const speedBlur  = clamp01(speedNorm * speedNorm) * (params.blurSpeedWeight   || 0.50);
  const driftBlur  = (state.driftIntensity || 0)    * (params.blurDriftWeight   || 0.70);
  const angVelBlur = clamp01(Math.abs(body.angularVelocity) / 2.5) * (params.blurAngularWeight || 0.40);
  const filtJerk   = (state.filteredBody && state.filteredBody.jerkMagnitude) || body.jerkMagnitude || 0;
  const jerkBlur   = clamp01(filtJerk / 400)        * (params.blurJerkWeight   || 0.30);
  const targetBlur = clamp01(speedBlur + driftBlur + angVelBlur + jerkBlur);

  const acc        = state.blurAccumulator || 0;
  const blurAlpha  = targetBlur > acc ? blurAttack : blurDecay;
  state.blurAccumulator = acc + (targetBlur - acc) * blurAlpha;
  const effectiveBlur  = state.blurAccumulator * blurIntensity;

  const blurActive     = effectiveBlur > 0.015 && blurSamplesN > 1;
  const blurOffset     = blurActive
    ? Math.min(speed * 0.12 * effectiveBlur * 2.0, blurMaxOff) : 0;
  const sampleCount    = blurActive ? blurSamplesN : 1;
  const invSpeed       = speed > 0.001 ? 1 / speed : 0;
  const blurVelX       = -body.velocityX * invSpeed;
  const blurVelY       = -body.velocityY * invSpeed;

  // ---- Background uniforms ----
  const tileMetres = (params.checkerboardTileSize || 80) / ppm;
  const shake      = state.screenShake;
  BG_DATA[ 0] = camera.x;
  BG_DATA[ 1] = camera.y;
  BG_DATA[ 2] = zoom;
  BG_DATA[ 3] = ppm;
  BG_DATA[ 4] = canvasWidth;
  BG_DATA[ 5] = canvasHeight;
  BG_DATA[ 6] = tileMetres;
  BG_DATA[ 7] = effectiveBlur;
  BG_DATA[ 8] = blurVelX;
  BG_DATA[ 9] = blurVelY;
  BG_DATA[10] = blurOffset;
  BG_DATA[11] = sampleCount;
  BG_DATA[12] = shake.shakeX || 0;
  BG_DATA[13] = shake.shakeY || 0;
  BG_DATA[14] = body.angularVelocity || 0;
  BG_DATA[15] = 0;  // _pad

  // ---- Camera uniforms (arrows + particles) ----
  CAM_DATA[0] = zoom;
  CAM_DATA[1] = ppm;
  CAM_DATA[2] = canvasWidth;
  CAM_DATA[3] = canvasHeight;

  // ---- Composite uniforms (UV scale + centre for skid texture sampling) ----
  // uvCenter = world position of camera in UV [0,1] space (UV = worldPos / mapSize).
  // uvScale  = half-extent of the visible canvas in UV space, accounting for zoom.
  COMP_DATA[0] = camera.x / MAP_W;                      // uvCenterX
  COMP_DATA[1] = camera.y / MAP_H;                      // uvCenterY
  COMP_DATA[2] = canvasWidth  / (2 * eff * MAP_W);      // uvScaleX
  COMP_DATA[3] = canvasHeight / (2 * eff * MAP_H);      // uvScaleY

  // ---- Trail arrow instances ----
  const arrows    = state.trail.arrows;
  const arrowFade = params.trailFade || 0.7;
  let arrowCount  = 0;
  for (const arrow of arrows) {
    if (arrowCount >= MAX_ARROWS) break;
    const normAge = arrow.age / arrow.lifespan;
    const alpha   = Math.pow(1.0 - normAge, arrowFade);
    if (alpha < 0.01) continue;

    const speedRatio = arrow.speed / TRAIL_REFERENCE_SPEED;
    const length     = (TRAIL_ARROW_BASE_LENGTH_PX / ppm) * Math.max(0.4, speedRatio);
    const lineWidth  = Math.max(0.1, 0.2 * Math.min(speedRatio, 2.0));
    const [r, g, b]  = speedToRgb(arrow.speed);

    const base = arrowCount * 9;
    arrowData[base + 0] = arrow.x - camera.x;
    arrowData[base + 1] = arrow.y - camera.y;
    arrowData[base + 2] = arrow.angle;
    arrowData[base + 3] = length;
    arrowData[base + 4] = lineWidth;
    arrowData[base + 5] = r;
    arrowData[base + 6] = g;
    arrowData[base + 7] = b;
    arrowData[base + 8] = alpha;
    arrowCount++;
  }

  // ---- Spark instances ----
  const sparkPool = getSparkPool();
  let sparkCount  = 0;
  for (let i = 0; i < sparkPool.length; i++) {
    const p = sparkPool[i];
    if (!p.alive) continue;
    if (sparkCount >= MAX_SPARKS_GPU) break;

    const t     = p.life / p.maxLife;
    const alpha = (1 - t) * (1 - t);
    if (alpha < 0.01) continue;

    const size      = p.size * (1.0 - t * 0.5);
    const rgb       = SPARK_RGB[p.hdrIndex % SPARK_RGB.length];

    const base = sparkCount * 7;
    sparkData[base + 0] = p.x - camera.x;
    sparkData[base + 1] = p.y - camera.y;
    sparkData[base + 2] = size;
    sparkData[base + 3] = rgb[0];  // raw RGB — shader premultiplies
    sparkData[base + 4] = rgb[1];
    sparkData[base + 5] = rgb[2];
    sparkData[base + 6] = alpha;
    sparkCount++;
  }

  // ---- Splat particle instances ----
  const splats    = state.splatParticles || [];
  let splatCount  = 0;
  for (const p of splats) {
    if (splatCount >= MAX_SPLATS) break;
    if (p.alpha < 0.01) continue;

    const [r, g, b] = hslToRgb(p.hue, 80, 40);

    const base = splatCount * 7;
    splatData[base + 0] = p.x - camera.x;
    splatData[base + 1] = p.y - camera.y;
    splatData[base + 2] = p.radius * 2;  // diameter → shader uses as world-space size
    splatData[base + 3] = r;
    splatData[base + 4] = g;
    splatData[base + 5] = b;
    splatData[base + 6] = p.alpha;
    splatCount++;
  }

  // ---- New skid segment instances ----
  // state.skidMarksNewThisFrame is populated by recordSkidMarks() in main.js.
  // We drain it here each render frame.
  const newSegs  = state.skidMarksNewThisFrame || [];
  let skidCount  = 0;
  for (const seg of newSegs) {
    if (skidCount >= MAX_SKID_NEW) break;

    let r, g, b;
    if (seg.hue >= 0) {
      // Balloon paint: saturation encodes paint richness (matches drawSkidMarks).
      const ps  = seg.paintSaturation !== undefined ? seg.paintSaturation : 1.0;
      const sat = 30 + ps * 65;   // 30–95%
      const lum = 20 + ps * 30;   // 20–50%
      [r, g, b] = hslToRgb(seg.hue, sat, lum);
    } else {
      // Standard rubber-black: rgba(20, 15, 10, alpha)
      r = 20 / 255; g = 15 / 255; b = 10 / 255;
    }

    // Segments are stored in world coords. Subtract map centre for shader NDC calc.
    const base = skidCount * 9;
    skidData[base + 0] = seg.x1 - MAP_CX;
    skidData[base + 1] = seg.y1 - MAP_CY;
    skidData[base + 2] = seg.x2 - MAP_CX;
    skidData[base + 3] = seg.y2 - MAP_CY;
    skidData[base + 4] = seg.width;
    skidData[base + 5] = r;
    skidData[base + 6] = g;
    skidData[base + 7] = b;
    skidData[base + 8] = seg.alpha;
    skidCount++;
  }

  // ---- Upload to GPU ----
  // All writeBuffer calls go to device.queue FIFO; they complete before submit.
  device.queue.writeBuffer(bgUniBuf,   0, BG_DATA);
  device.queue.writeBuffer(camUniBuf,  0, CAM_DATA);
  device.queue.writeBuffer(compUniBuf, 0, COMP_DATA);
  if (arrowCount > 0) device.queue.writeBuffer(arrowInstBuf, 0, arrowData, 0, arrowCount * 9);
  if (sparkCount > 0) device.queue.writeBuffer(sparkInstBuf, 0, sparkData, 0, sparkCount * 7);
  if (splatCount > 0) device.queue.writeBuffer(splatInstBuf, 0, splatData, 0, splatCount * 7);
  if (skidCount  > 0) device.queue.writeBuffer(skidInstBuf,  0, skidData,  0, skidCount  * 9);

  // ---- Encode + submit ----
  const enc = device.createCommandEncoder({ label: 'gpuFrame' });

  // Pass 1: Skid accumulation — render new segments into persistent texture.
  // loadOp:'load' preserves all previously accumulated marks.
  if (skidCount > 0) {
    const accumPass = enc.beginRenderPass({
      label: 'skidAccum',
      colorAttachments: [{
        view:     skidTexView,
        loadOp:   'load',
        storeOp:  'store',
      }],
    });
    accumPass.setPipeline(accumPipeline);
    accumPass.setBindGroup(0, accumBindGroup);
    accumPass.setVertexBuffer(0, skidInstBuf);
    accumPass.draw(6, skidCount);  // 6 verts × skidCount instances
    accumPass.end();
  }

  // Pass 2: Main render — clear swap chain, draw world elements in order.
  const swapView = gpuCtx.getCurrentTexture().createView();
  const mainPass = enc.beginRenderPass({
    label: 'main',
    colorAttachments: [{
      view:       swapView,
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp:     'clear',
      storeOp:    'store',
    }],
  });

  // 2a. Checkerboard background (opaque, fills whole canvas).
  mainPass.setPipeline(bgPipeline);
  mainPass.setBindGroup(0, bgBindGroup);
  mainPass.draw(4);  // 4 verts for triangle-strip full-screen quad

  // 2b. Skid composite — blend accumulated texture over background.
  mainPass.setPipeline(compPipeline);
  mainPass.setBindGroup(0, compBindGroup);
  mainPass.draw(6);  // 6 verts (2 triangles)

  // 2c. Trail arrows.
  if (arrowCount > 0) {
    mainPass.setPipeline(arrowPipeline);
    mainPass.setBindGroup(0, arrowBindGroup);
    mainPass.setVertexBuffer(0, arrowInstBuf);
    mainPass.draw(9, arrowCount);  // 9 verts × arrowCount instances
  }

  // 2d. Sparks.
  if (sparkCount > 0) {
    mainPass.setPipeline(partPipeline);
    mainPass.setBindGroup(0, partBindGroup);
    mainPass.setVertexBuffer(0, sparkInstBuf);
    mainPass.draw(6, sparkCount);
  }

  // 2e. Splat particles.
  if (splatCount > 0) {
    mainPass.setPipeline(partPipeline);
    mainPass.setBindGroup(0, partBindGroup);
    mainPass.setVertexBuffer(0, splatInstBuf);
    mainPass.draw(6, splatCount);
  }

  mainPass.end();
  device.queue.submit([enc.finish()]);

  // Drain new skid segments — they have been uploaded to the accumulation texture.
  if (newSegs.length > 0) newSegs.length = 0;
}
