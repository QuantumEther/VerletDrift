// =============================================================
// MAIN — entry point and game loop
// =============================================================
// Wires all modules together. Owns the requestAnimationFrame loop
// with fixed-timestep physics sub-stepping and variable-rate rendering.
//
// PHYSICS STEP ORDER (enforced here, documented in physics.js):
//   1.  updateSteering(dt)
//   2.  updateEngine(dt)
//   3.  computeWeightTransfer()   [PHASE 3a: removed pre-force computeBodyDerivedState]
//   4.  computeTireForces()
//   5.  computeDragForces()
//   6.  computeBrakeForce()
//   7.  combine into net linear + angular acceleration
//   8.  verletIntegrateAllPoints(dt, ...)
//   9.  solveRigidBodyConstraints()
//  10.  clampParticleDisplacements()
//  11.  handleBoundaryCollisions()
//  12.  solveRigidBodyConstraints()  (again after collision)
//  13.  computeBodyDerivedState(dt)  (recompute for camera and render)
//  14.  applySleepIfNeeded()         [PHASE 3b: new sleep rule]
//  15.  updateCamera(dt)
//  16.  trail spawn / update
//  17.  updateEngineSound(...)       (no-op stub)
//
// RENDER ORDER (once per animation frame, after all sub-steps):
//   World space (camera transform applied):
//     drawCheckerboard, drawMapBoundary, drawTrailArrows, drawCar
//   Screen space (HUD, no camera transform):
//     drawSteeringWheelHud, drawThrottleBar, drawBrakeBar, drawClutchBar,
//     drawGearIndicator, updateInfoBar
//   Gauge canvases (separate contexts):
//     Tachometer, Speedometer, Lateral-G gauge
// =============================================================

import state from './state.js';
import {
  DEFAULT_MAP_WIDTH,
  DEFAULT_MAP_HEIGHT,
  MAX_FRAME_TIME_SEC,
  CAR_HALF_LENGTH,
  CAR_HALF_WIDTH,
  TACHOMETER_MAX_RPM,
  TACHOMETER_REDLINE_RPM,
  SPEEDOMETER_MAX_KPH,
  KPH_TO_MPS,
} from './constants.js';

import { initInput } from './input.js';
import { initGPU, isGPUReady, renderFrameGPU, resizeGPU } from './gpu-renderer.js';

import {
  initializeCarBody,
  updateSteering,
  updateEngine,
  computeBodyDerivedState,
  computeWeightTransfer,
  computeTireForces,
  computeDragForces,
  computeBrakeForce,
  verletIntegrateAllPoints,
  solveRigidBodyConstraints,
  clampParticleDisplacements,
  handleBoundaryCollisions,
  updateCamera,
  updateEngineSound,
  applySleepIfNeeded,
  wrapAngle,
} from './physics/index.js';

import {
  spawnTrailArrow,
  updateTrailArrows,
  drawTrailArrows,
} from './trail.js';

import {
  applyCameraTransform,
  removeCameraTransform,
  drawCheckerboard,
  drawMapBoundary,
  drawCar,
  drawCarGhosts,
  drawSteeringWheelHud,
  drawThrottleBar,
  drawBrakeBar,
  drawHandbrakeBar,
  drawClutchBar,
  drawGearIndicator,
  drawAnalogGauge,
  drawYawStabilityGauge,
  drawFrictionCircle,
  drawSlipAngleMeter,
  drawDriftRadar,
  drawBalloons,
  drawSplatParticles,
  drawScoreHud,
  drawSkidMarks,
  drawSplatDecals,
  drawKinematicArrows,
  updateSparks,
  updateSmoke,
  drawSparks,
  drawDebugOverlays,
  drawWheelSlipGauge,
  drawLogsToggleCheckbox,
  logsToggleButtonBounds,
} from './renderer/index.js';

import { drawDebugPanels } from './renderer/debug-overlay.js';

import { initSliders, updateInfoBar, createNeedlePhysics, initChangeLogger, registerGauge, getGaugeRegistry } from './ui.js?v=3';
import { startEngine as startEngineSound, stopEngine as stopEngineSound } from './sound.js';
import { initSoundStateManager } from './soundStateManager.js';
import { spawnBalloons, checkBalloonCollisions, updateSplatParticles, updateComboTimer } from './balloon.js';
import { physicsRandom } from './random.js';

// Debug & observability
import { logger, initLogger } from './debug/logger.js';
import { eventBuffer, initEvents } from './debug/events.js';
import { resolveConfig } from './debug/config.js';
import { checkFaults } from './debug/faults.js';


// =============================================================
// CANVAS SETUP
// =============================================================

// Gets and validates a canvas element by id.
// Throws a descriptive error if the element is missing, which is
// easier to diagnose than a null-dereference error later.
function getCanvas(elementId) {
  const canvas = document.getElementById(elementId);
  if (!canvas) throw new Error(`Canvas element #${elementId} not found in index.html`);
  return canvas;
}

// Applies the resolution scaling to a canvas.
// Multiplies by window.devicePixelRatio so the canvas data pixels match
// physical screen pixels exactly — this is what makes it pixel-perfect
// on high-DPI screens (Retina, 4K, Windows 150% scaling etc.).
// The slider value is a multiplier ON TOP of DPR, so slider 1.0 always
// means "native resolution for this screen" regardless of DPR.
function applyCanvasResolution(canvas, ctx, cssWidth, cssHeight, resolutionScale) {
  const devicePixelRatio  = window.devicePixelRatio || 1;
  const physicalScale     = resolutionScale * devicePixelRatio;

  // Internal pixel dimensions match physical screen pixels × slider scale.
  canvas.width  = Math.round(cssWidth  * physicalScale);
  canvas.height = Math.round(cssHeight * physicalScale);

  // CSS size stays unchanged — canvas occupies the same layout space.
  canvas.style.width  = cssWidth  + 'px';
  canvas.style.height = cssHeight + 'px';

  // Scale context so all drawing code continues to use CSS pixel coordinates.
  ctx.scale(physicalScale, physicalScale);
}


// =============================================================
// INITIALISATION
// =============================================================

// Canvases.
const simCanvas   = getCanvas('simCanvas');
const rpmCanvas   = getCanvas('rpmCanvas');
const speedCanvas = getCanvas('speedCanvas');
const latGCanvas  = getCanvas('latGCanvas'); // lateral G gauge (third canvas)
const gpuCanvasEl = document.getElementById('gpuCanvas'); // may be null (optional)

const simCtx   = simCanvas.getContext('2d');
const rpmCtx   = rpmCanvas.getContext('2d');
const speedCtx = speedCanvas.getContext('2d');
const latGCtx  = latGCanvas.getContext('2d');

// Apply initial resolution (1× — sliders are not yet connected).
// main canvas uses CSS size; gauge canvases are fixed size in HTML.
const simCssWidth  = simCanvas.clientWidth  || simCanvas.width;
const simCssHeight = simCanvas.clientHeight || simCanvas.height;

// Kick off WebGPU initialisation asynchronously.
// The game loop starts immediately; GPU rendering activates once ready.
if (gpuCanvasEl) {
  initGPU(gpuCanvasEl).catch((e) => {
    console.warn('[GPU] initGPU failed:', e);
  });
}

// Attach input listeners before anything else so no events are missed.
initInput(simCanvas);

// ===== Initialize diagnostics & observability =====
// Set up logger, event ring buffer, and debug modes before other modules run.
initEvents(200); // Ring buffer capacity: 200 events
state.debug.events = eventBuffer;
initLogger(eventBuffer);

// Resolve config from URL params → localStorage → defaults
const debugConfig = resolveConfig();
state.debug.mode = debugConfig.mode;
state.debug.overlaysEnabled = debugConfig.overlaysEnabled;
logger.setMode(debugConfig.mode);
if (debugConfig.overlaysEnabled) logger.setOverlaysEnabled(true);
if (debugConfig.logChannels) logger.setChannelsAllowlist(debugConfig.logChannels);
if (debugConfig.traceChannel) {
  logger.setTraceWindow(debugConfig.traceChannel, debugConfig.traceMs);
}
if (debugConfig.freezeOnError) {
  state.debug.faults.freezeOnError = true;
}

// Add global error handlers
window.addEventListener('error', (e) => {
  logger.error('main', `Uncaught error: ${e.message}`, {
    filename: e.filename,
    lineno: e.lineno,
    stack: e.error?.stack
  });
  if (eventBuffer) {
    eventBuffer.pushEvent({
      level: 'error',
      channel: 'global',
      type: 'uncaught_error',
      msg: e.message,
      data: { filename: e.filename, lineno: e.lineno },
      dedupeKey: 'uncaught:' + e.lineno,
    });
  }
  if (state.debug.faults.freezeOnError) {
    state.debug.faults.isFrozen = true;
  }
});

window.addEventListener('unhandledrejection', (e) => {
  logger.error('main', `Unhandled promise rejection: ${e.reason}`, {});
  if (eventBuffer) {
    eventBuffer.pushEvent({
      level: 'error',
      channel: 'global',
      type: 'unhandled_rejection',
      msg: String(e.reason),
      dedupeKey: 'rejection:' + Date.now(),
    });
  }
  if (state.debug.faults.freezeOnError) {
    state.debug.faults.isFrozen = true;
  }
});

// Bind HTML sliders to state.params. This reads initial HTML slider values
// into state.params so physics starts with the correct parameters.
initSliders();

// Initialize sound state manager for cross-window synchronization via localStorage.
initSoundStateManager();

// Attach delegated console logger for all UI input events.
initChangeLogger();

// Wire sound toggle button -- AudioContext requires user gesture to start.
const soundToggleButton = document.getElementById('soundToggle');
let isSoundEnabled = false;
if (soundToggleButton) {
  soundToggleButton.addEventListener('click', () => {
    if (!isSoundEnabled) {
      startEngineSound();
      isSoundEnabled = true;
      soundToggleButton.textContent = 'Sound ON';
      soundToggleButton.style.background = '#2ecc71';
      soundToggleButton.style.borderColor = '#2ecc71';
      soundToggleButton.style.color = '#111';
    } else {
      stopEngineSound();
      isSoundEnabled = false;
      soundToggleButton.textContent = 'Sound OFF';
      soundToggleButton.style.background = '#e74c3c';
      soundToggleButton.style.borderColor = '#e74c3c';
      soundToggleButton.style.color = '#fff';
    }
  });
}

// Wire logs toggle checkbox — drawn on canvas, detect clicks within button bounds.
simCanvas.addEventListener('click', (e) => {
  const rect = simCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Check if click is within logs toggle button bounds
  if (x >= logsToggleButtonBounds.x &&
      x <= logsToggleButtonBounds.x + logsToggleButtonBounds.width &&
      y >= logsToggleButtonBounds.y &&
      y <= logsToggleButtonBounds.y + logsToggleButtonBounds.height) {
    // Toggle logging state
    state.params.logsEnabled = !state.params.logsEnabled;
  }
});

// Bind canvas resolution slider (not part of state.params, manual handler).
const canvasResolutionSlider = document.getElementById('canvasResolutionSlider');
const canvasResolutionValue  = document.getElementById('canvasResolutionValue');
if (canvasResolutionSlider) {
  const updateCanvasResolution = () => {
    const scale = parseFloat(canvasResolutionSlider.value);
    canvasResolutionValue.textContent = scale.toFixed(1);
    // Canvas will be resized in renderFrame() when next drawn.
  };
  canvasResolutionSlider.addEventListener('input', updateCanvasResolution);
  updateCanvasResolution();
}

// Keyboard bindings for debug modes
document.addEventListener('keydown', (e) => {
  // F2: Cycle through debug modes (quiet → tuning → trace → quiet)
  if (e.code === 'F2') {
    e.preventDefault();
    const modes = ['quiet', 'tuning', 'trace'];
    const currentIdx = modes.indexOf(state.debug.mode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    logger.setMode(nextMode);
    state.debug.mode = nextMode;
    console.log(`[DEBUG] Mode changed to: ${nextMode}`);
  }

  // F3: Toggle overlay visibility
  if (e.code === 'F3') {
    e.preventDefault();
    const newState = !state.debug.overlaysEnabled;
    logger.setOverlaysEnabled(newState);
    state.debug.overlaysEnabled = newState;
    console.log(`[DEBUG] Overlays ${newState ? 'enabled' : 'disabled'}`);
  }

  // Shift+Ctrl+T: Open trace window for a channel (prompt user)
  if (e.shiftKey && e.ctrlKey && e.code === 'KeyT') {
    e.preventDefault();
    const channel = prompt('Enter channel name to trace (tires, engine, smoke, etc):');
    if (channel && channel.trim()) {
      logger.setTraceWindow(channel.trim(), 2000);
      console.log(`[DEBUG] Trace window opened for channel: ${channel}`);
    }
  }
});

// Create needle physics instances for each gauge.
// These are independent spring-damper systems — one per gauge.
const rpmNeedle  = createNeedlePhysics();
const speedNeedle = createNeedlePhysics();
const latGNeedle  = createNeedlePhysics();

// New gauge needle instances (v15: 4 new gauges + drift radar).
const yawMarginNeedle = createNeedlePhysics();
const betaNeedle = createNeedlePhysics();
const radarNeedles = [
  createNeedlePhysics(),  // Yaw Margin
  createNeedlePhysics(),  // Rear Saturation
  createNeedlePhysics(),  // Front Authority
  createNeedlePhysics(),  // Slip Angle
  createNeedlePhysics(),  // Countersteer Alignment
  createNeedlePhysics(),  // Speed Ratio
];

// Custom renderer mapping: name → function
const customRendererMap = {
  drawYawStabilityGauge,
  drawFrictionCircle,
  drawSlipAngleMeter,
  drawDriftRadar,
};

// Place the car in the centre of the default map (coordinates in metres).
initializeCarBody(DEFAULT_MAP_WIDTH * 0.5, DEFAULT_MAP_HEIGHT * 0.5);

// Scatter balloons across the map. Must be called after initializeCarBody
// so state.params.mapWidth/Height are set correctly.
spawnBalloons();

// Initial derivation so body state is valid before the first render.
computeBodyDerivedState(1 / 60);
computeWeightTransfer();

// Register dynamic gauges via the gauge registry.
// These are added to the gauge row alongside the hardcoded RPM/Speed/LatG gauges.
// NOTE: Migrated from wheelGrip to wheelFrictionUtil for semantic clarity.
// wheelGrip was repurposed to store friction circle utilization (0-1) instead of grip remaining.
// Using wheelFrictionUtil directly makes the semantics clear: this gauge shows traction utilization.
registerGauge({
  label:          'FL Util',
  getValue:       () => state.wheelFrictionUtil.frontLeft,
  min:            0,
  max:            1,
  title:          'FL UTIL',
  subtitle:       'friction utilization',
  majorStep:      0.25,
  minorDivisions: 5,
  redFrom:        0.8,  // Red zone above 80% utilization (near traction limit)
  labelFormatter: (v) => v.toFixed(2),
});

registerGauge({
  label:          'FR Util',
  getValue:       () => state.wheelFrictionUtil.frontRight,
  min:            0,
  max:            1,
  title:          'FR UTIL',
  subtitle:       'friction utilization',
  majorStep:      0.25,
  minorDivisions: 5,
  redFrom:        0.8,
  labelFormatter: (v) => v.toFixed(2),
});

registerGauge({
  label:          'RL Util',
  getValue:       () => state.wheelFrictionUtil.rearLeft,
  min:            0,
  max:            1,
  title:          'RL UTIL',
  subtitle:       'friction utilization',
  majorStep:      0.25,
  minorDivisions: 5,
  redFrom:        0.8,
  labelFormatter: (v) => v.toFixed(2),
});

registerGauge({
  label:          'RR Util',
  getValue:       () => state.wheelFrictionUtil.rearRight,
  min:            0,
  max:            1,
  title:          'RR UTIL',
  subtitle:       'friction utilization',
  majorStep:      0.25,
  minorDivisions: 5,
  redFrom:        0.8,
  labelFormatter: (v) => v.toFixed(2),
});

registerGauge({
  label:          'Jerk',
  getValue:       () => Math.min(state.body.jerkMagnitude, 500),
  min:            0,
  max:            500,
  title:          'JERK',
  subtitle:       'm/s³',
  majorStep:      100,
  minorDivisions: 5,
  redFrom:        400,
  labelFormatter: (v) => String(Math.round(v)),
});


registerGauge({
  label:          'Drift',
  getValue:       () => state.driftIntensity,
  min:            0,
  max:            1,
  title:          'DRIFT',
  subtitle:       'intensity',
  majorStep:      0.25,
  minorDivisions: 5,
  redFrom:        0.7,
  labelFormatter: (v) => v.toFixed(2),
});

registerGauge({
  label:          'Blur',
  getValue:       () => state.blurAccumulator || 0,
  min:            0,
  max:            1,
  title:          'BLUR',
  subtitle:       'intensity',
  majorStep:      0.25,
  minorDivisions: 5,
  redFrom:        0.8,
  labelFormatter: (v) => v.toFixed(2),
});

// --- NEW GAUGES (v15) ---

// Yaw Stability Margin Gauge: needle rotates ±140° and grows in length.
registerGauge({
  label:            'YAW',
  title:            'YAW STABILITY',
  subtitle:         'Margin',
  min:              -2.0,
  max:               2.0,
  majorStep:        0.5,
  minorDivisions:   5,
  redFrom:          1.5,
  getValue:         () => state.body.angularVelocity,
  needle:           yawMarginNeedle,
  labelFormatter:   (v) => v.toFixed(1),
  customRenderer:   'drawYawStabilityGauge',  // Custom renderer flag for ui.js
});

// Friction Circle Gauges (Front & Rear axles).
registerGauge({
  label:            'FRICTION F',
  title:            'FRONT GRIP',
  subtitle:         'Circle',
  min:              0,
  max:              1,
  getValue:         () => {
    const fxN = state.axleForces.front.N > 0 ? state.axleForces.front.fx / (state.params.tireFrictionCoeff * state.axleForces.front.N) : 0;
    const fyN = state.axleForces.front.N > 0 ? state.axleForces.front.fy / (state.params.tireFrictionCoeff * state.axleForces.front.N) : 0;
    return Math.hypot(fxN, fyN);
  },
  customRenderer:   'drawFrictionCircle',
  axle:             'front',
});

registerGauge({
  label:            'FRICTION R',
  title:            'REAR GRIP',
  subtitle:         'Circle',
  min:              0,
  max:              1,
  getValue:         () => {
    const fxN = state.axleForces.rear.N > 0 ? state.axleForces.rear.fx / (state.params.tireFrictionCoeff * state.axleForces.rear.N) : 0;
    const fyN = state.axleForces.rear.N > 0 ? state.axleForces.rear.fy / (state.params.tireFrictionCoeff * state.axleForces.rear.N) : 0;
    return Math.hypot(fxN, fyN);
  },
  customRenderer:   'drawFrictionCircle',
  axle:             'rear',
});

// Slip Angle Meter (β): horizontal bar.
registerGauge({
  label:            'SLIP β',
  title:            'SLIP ANGLE',
  subtitle:         'Degrees',
  min:              -45,
  max:               45,
  getValue:         () => {
    const heading = state.body.heading;
    const vLong = state.body.velocityX * Math.sin(heading) + state.body.velocityY * -Math.cos(heading);
    const vLat = state.body.velocityX * Math.cos(heading) + state.body.velocityY * Math.sin(heading);
    const beta = Math.atan2(vLat, Math.max(Math.abs(vLong), 0.25)) * 180 / Math.PI;
    return beta;
  },
  needle:           betaNeedle,
  customRenderer:   'drawSlipAngleMeter',
});

// Drift Stability Radar: 6-axis spider chart with spring-smoothed polygon.
registerGauge({
  label:            'DRIFT',
  title:            'DRIFT RADAR',
  subtitle:         'Stability',
  min:              0,
  max:              1,
  getValue:         () => state.driftIntensity,
  customRenderer:   'drawDriftRadar',
  radarNeedles:     radarNeedles,  // Array of 6 needle physics for each axis
});


// =============================================================
// RENDER INTERPOLATION SNAPSHOTS
// =============================================================
// Unity-style fixed physics rate + display-rate rendering with interpolation.
//
// ARCHITECTURE (matches Unity FixedUpdate / Update separation):
//   - Physics ticks at a fixed WALL-CLOCK rate (physicsHz slider, e.g. 100Hz).
//     The accumulator counts real elapsed time, NOT simulated time.
//     This guarantees physics ticks happen ~physicsHz times per real second
//     regardless of timeScale.
//   - timeScale only shrinks the dt PASSED TO each physics step.
//     At timeScale=0.1 + 100Hz physics: ticks still fire 100×/s in real time,
//     but each tick advances only 0.001s of simulation → silky slow motion.
//   - The renderer fires every requestAnimationFrame (240Hz on your display).
//     It interpolates the car/camera position between the last two physics
//     snapshots using alpha = wallAccumulator / physicsWallDt.
//     At 100Hz physics + 240Hz display: between every physics tick you get
//     ~2.4 render frames, each drawing a smoothly interpolated position.
//
/**
 * Snapshot of interpolatable state between two physics ticks.
 *
 * Captured fields: body.centerX/Y, body.heading, steering.frontWheelAngle,
 * steering.wheelAngle, camera.x/y/zoom.
 *
 * The renderer lerps between snapPrev and snapCurr using
 *   alpha = wallAccumulator / physicsWallDt
 * and writes the blended values back into state before calling renderFrame(),
 * then restores them afterward so physics reads the real values next tick.
 *
 * Known limitation — wheel positions are NOT interpolated:
 *   drawCar() reads state.wheels.frontLeft.x etc. directly. At 100 Hz physics
 *   this is visually undetectable, but the individual wheel corner positions
 *   will snap rather than glide between render frames. Fixing this would
 *   require snapshotting all four (x, y) pairs and applying the same lerp
 *   restore pattern — deferred to a future pass.
 *
 * Particles, decals, and balloons are physics-side only and not interpolated.
 */
function makeBodySnapshot() {
  return {
    centerX:    state.body.centerX,
    centerY:    state.body.centerY,
    heading:    state.body.heading,
    steerAngle: state.steering.frontWheelAngle,
    wheelAngle: state.steering.wheelAngle,
    camX:       state.camera.x,
    camY:       state.camera.y,
    camZoom:    state.camera.zoom,
  };
}

// Snapshots of the last two completed physics steps.
// Renderer interpolates between them.
let snapPrev = null;
let snapCurr = null;

// FPS tracking — smoothed with EMA for stable display.
let renderFpsEma  = 0;
let physicsTpsEma = 0; // ticks per second (actual, measured)


// =============================================================
// GAME LOOP
// =============================================================

function mainLoop(timestampMilliseconds) {
  requestAnimationFrame(mainLoop);

  const timestampSeconds = timestampMilliseconds * 0.001;

  // --- Wall-clock frame time (real seconds, not simulated) ---
  if (state.loop.previousTimestamp === 0) {
    state.loop.previousTimestamp = timestampSeconds;
  }
  const wallFrameTime = Math.min(
    timestampSeconds - state.loop.previousTimestamp,
    MAX_FRAME_TIME_SEC   // spiral-of-death guard: cap at 250ms
  );
  state.loop.previousTimestamp = timestampSeconds;

  // --- Render FPS (EMA smoothed) ---
  const instantRenderFps = wallFrameTime > 0 ? 1.0 / wallFrameTime : 0;
  renderFpsEma = renderFpsEma === 0
    ? instantRenderFps
    : renderFpsEma + (instantRenderFps - renderFpsEma) * 0.05;

  // --- Physics tick rate in wall-clock time ---
  // physicsHz = how many times per real second we want physics to tick.
  // This is INDEPENDENT of timeScale — ticks happen at the same wallclock
  // cadence regardless of simulation speed.
  const physicsHz      = state.params.simulationFps; // slider (30–200)
  const physicsWallDt  = 1.0 / physicsHz;            // wall seconds per tick

  // Accumulate real elapsed time (NOT scaled by timeScale).
  state.loop.accumulator += wallFrameTime;

  // Fire physics ticks to consume accumulated wall time.
  // Each tick advances (physicsWallDt × timeScale) seconds of SIMULATION time.
  // → timeScale=1.0: normal speed   → timeScale=0.1: 10× slow motion
  // The tick RATE in wall-clock is unchanged; only the simulated dt shrinks.
  const maxSubstepsPerFrame = Math.max(1, Math.round(state.params.maxSubstepsPerFrame || 6));
  let ticksThisFrame = 0;
  while (state.loop.accumulator >= physicsWallDt && ticksThisFrame < maxSubstepsPerFrame) {
    snapPrev = snapCurr;

    // Simulated dt: real step size × timeScale.
    const simDt = physicsWallDt * state.params.timeScale;
    state.loop.simulationTime += simDt;
    runPhysicsStep(simDt);

    snapCurr = makeBodySnapshot();

    state.loop.accumulator -= physicsWallDt;
    ticksThisFrame++;
  }

  if (state.loop.accumulator >= physicsWallDt) {
    // Stabilizer #1 — hard-cap backlog: once we hit the per-frame substep cap,
    // drop all remaining whole substeps immediately instead of carrying a long
    // backlog that can cause temporal "rubber-banding" and force bursts.
    // Physical rationale: if wall-clock can't keep up, it's safer to skip old
    // impulses than to replay them late. Feel impact: slightly less temporal
    // fidelity under load, but far more stable and predictable control feel.
    const droppedSubsteps = Math.floor(state.loop.accumulator / physicsWallDt);
    state.loop.droppedSubsteps += droppedSubsteps;
    state.loop.droppedSubstepsLastFrame = droppedSubsteps;
    state.loop.accumulator %= physicsWallDt;
  } else {
    state.loop.droppedSubstepsLastFrame = 0;
  }

  // Smooth physics ticks-per-second display.
  const instantTps = ticksThisFrame / wallFrameTime;
  if (ticksThisFrame > 0) {
    physicsTpsEma = physicsTpsEma === 0
      ? instantTps
      : physicsTpsEma + (instantTps - physicsTpsEma) * 0.1;
  }

  // --- Interpolation alpha ---
  // How far (0→1) between snapPrev and snapCurr are we right now?
  // accumulator is the leftover wall time after consuming whole ticks.
  // alpha = 0 → render snapPrev; alpha = 1 → render snapCurr.
  // Normal case: 0 < alpha < 1 → smooth sub-tick interpolation.
  const alpha = physicsWallDt > 0 ? state.loop.accumulator / physicsWallDt : 1.0;

  // Publish FPS measurements so updateInfoBar can display them.
  state.loop.renderFps  = renderFpsEma;
  state.loop.physicsTps = physicsTpsEma;

  // Increment debug frame counter (for sampling and telemetry)
  logger.incrementFrameCount();
  state.debug.frame = logger.getFrameCount();

  // Check if simulation is frozen due to fault (if enabled)
  if (state.debug.faults.isFrozen) {
    console.warn('[FAULT] Simulation frozen. Check console and overlays for details.');
    return; // Skip rendering and physics this frame
  }

  // Render once per animation frame using interpolated state.
  renderFrame(alpha, snapPrev, snapCurr, wallFrameTime);
}


// =============================================================
// ONE PHYSICS SUB-STEP
// =============================================================

// Runs a single fixed-dt physics sub-step in the mandatory call order.
// dt is in seconds.
function runPhysicsStep(dt) {
  // Handbrake progressive ramp: 0→1 in ~0.25s while held, releases instantly
  if (state.input.handbrakeKeyHeld) {
    state.input.handbrakeValue = Math.min(1.0, (state.input.handbrakeValue || 0) + dt / 0.25);
  } else {
    state.input.handbrakeValue = Math.max(0.0, (state.input.handbrakeValue || 0) - dt / 0.15);
  }

  // 1. Update steering: maps visual wheel angle → front tyre lock angle,
  //    applies self-centring.
  updateSteering(dt);

  // 2. Update engine: advances clutch pedal position, computes clutch
  //    engagement from pedal, updates RPM for the current clutch zone,
  //    checks for stall.
  updateEngine(dt);

  // === PHASE 3a: DERIVED-STATE BUG FIX ===
  // REMOVED: Pre-force computeBodyDerivedState(dt) call that was zeroing
  // angularVelocity and acceleration before force computation. This was
  // a critical bug: it made yaw damping ineffective (used ω=0) and broke
  // slip angle calculations (which use ω×r). Now we use ω from the END
  // of the previous step, ensuring yaw damping has real angular velocity
  // to work with. See Deep Research Report: "Derived-state reset bug".

  // 3. Weight transfer: distributes normal load to each wheel based on
  //    the body's longitudinal and lateral accelerations (computed at end of previous step).
  computeWeightTransfer();

  // 5–7. Compute all forces.
  const tireForces  = computeTireForces(dt);   // { forceX, forceY, torque }
  const dragForces  = computeDragForces();   // { forceX, forceY }
  const brakeForces = { forceX: 0, forceY: 0 }; // braking now per-wheel inside computeTireForces (traction circle)

  // 8. Sum forces into net values.
  const netForceX  = tireForces.forceX + dragForces.forceX + brakeForces.forceX;
  const netForceY  = tireForces.forceY + dragForces.forceY + brakeForces.forceY;
  const netTorque  = tireForces.torque;

  // === PHASE 2b YAW DAMPING ===
  // Apply counter-torque proportional to angular velocity.
  // Formula: τ_damp = -yawDamping × I × ω
  // Since α_damp = τ_damp / I = -yawDamping × ω, the parameter is a
  // decay rate in 1/s — directly interpretable:
  //   0.0 → undamped (spin persists forever)
  //   1.0 → realistic (angular velocity halves in ~0.7 s, aerodynamic-like)
  //   3.0 → sporty stability control
  //   5.0 → heavy stability assist
  const massKg = state.params.carMassKg;
  const momentOfInertia = massKg * (CAR_HALF_LENGTH * CAR_HALF_LENGTH +
                                    CAR_HALF_WIDTH  * CAR_HALF_WIDTH) / 3;
  const yawDampingTorque = -state.params.yawDamping * momentOfInertia * state.body.angularVelocity;
  const dampenedNetTorque = netTorque + yawDampingTorque;

  // (YAW diagnostic logging removed)

  // 9. Convert to accelerations (F = ma → a = F/m; τ = Iα → α = τ/I).
  // Note: massKg and momentOfInertia already computed above in yaw damping section.
  const netLinearAccelX   = netForceX / massKg;
  const netLinearAccelY   = netForceY / massKg;
  const netAngularAccel   = dampenedNetTorque / momentOfInertia;

  // 10. Verlet integration: advance all four wheel positions using the
  //     computed linear and angular accelerations.
  verletIntegrateAllPoints(dt, netLinearAccelX, netLinearAccelY, netAngularAccel);

  // 11. Constraint solver pass 1: restore rigid body distances after integration.
  solveRigidBodyConstraints();

  // 12. Anti-tunnelling: clamp any particle that moved too far in one step.
  clampParticleDisplacements();

  // 13. Boundary collisions: bounce particles off map walls.
  handleBoundaryCollisions();

  // 14. Constraint solver pass 2: restore rigidity after collision response.
  //     Without this second pass, a corner hitting a wall can stretch the body.
  solveRigidBodyConstraints();

  // 15. Recompute derived state after integration and collision resolution.
  //     This ensures the camera and renderer read the final, correct values.
  computeBodyDerivedState(dt);

  // === PHASE 3b: SLEEP RULE ===
  // Apply sleep/settle rule to prevent micro-drifting at very low speeds.
  // When speed and yaw rate are below thresholds with no input, snap Verlet
  // history to zero velocity for a complete imperceptible stop.
  applySleepIfNeeded();

  // 16. Camera: spring-damper follow of body centre, speed-based zoom.
  updateCamera(dt);

  // 17. Trail: spawn arrows at the spawn interval; age and cull existing ones.
  state.trail.spawnAccumulator += dt;
  if (state.trail.spawnAccumulator >= state.params.trailSpawnInterval) {
    state.trail.spawnAccumulator -= state.params.trailSpawnInterval;
    spawnTrailArrow();
  }
  updateTrailArrows(dt);

  // 18. Engine sound — pass traction state for squeal detection.
  let throttleAmount = 0;
  if (state.input.mouseThrottleActive) {
    throttleAmount = state.input.mouseThrottleAmount;
  } else if (state.input.throttleKeyHeld) {
    throttleAmount = 1.0;
  }
  const effectiveRpm = (state.engine.isRunning && !state.engine.isStalled) ? state.engine.rpm : 0;
  updateEngineSound(
    effectiveRpm,
    TACHOMETER_MAX_RPM,
    throttleAmount,
    state.tractionState.isSlipping,
    // Use max of lateralSpeed and drift-derived speed for richer sound scaling
    Math.max(state.tractionState.lateralSpeed || 0, state.driftIntensity * 12.0)
  );

  // 19. Balloon game: check for collisions, update splat particles, tick combo timer.
  checkBalloonCollisions(dt, state.loop.simulationTime);
  updateSplatParticles(dt);
  updateComboTimer(dt);

  // 20. Balloon respawn up to maxBalloons.
  updateBalloonRespawn(dt);

  // Increment balloon hue frame counter (used by paint mixing system)
  if (state.tractionState.lastBalloonHueFrames !== undefined) {
    state.tractionState.lastBalloonHueFrames++;
  }

  // 21. Record skid marks at wheel positions when grip is low.
  recordSkidMarks(dt);

  // 22. Decay screen shake magnitude each physics step.
  decayScreenShake(dt);

  // 23. Update spark particles (spawn at low-grip wheels, age, cull).
  if (state.params.showSparks) {
    updateSparks(dt);
  }

  // 24. Update tire smoke (spawn at locked/overspinning wheels, advect, cull).
  if (state.params.smokeEnabled) {
    updateSmoke(dt);
  }

  // 25. Check for physics-phase faults (wheel omega, constraints, slip anomalies)
  checkFaults('physics');
}


// =============================================================
// HELPER: Canvas Resolution Scale
// =============================================================

// Get current canvas resolution scale from the slider (0.5 to 2.0).
function getCanvasResolutionScale() {
  if (canvasResolutionSlider) {
    return parseFloat(canvasResolutionSlider.value);
  }
  return 1.0;
}


// =============================================================
// RENDER FRAME
// =============================================================

// Draws one complete frame. Called once per animation frame regardless
// of how many physics sub-steps ran this frame.
function renderFrame(alpha, prev, curr, wallRenderDt) {
  const cssWidth  = simCanvas.clientWidth  || simCanvas.width;
  const cssHeight = simCanvas.clientHeight || simCanvas.height;
  const resolutionScale = getCanvasResolutionScale();

  const canvasWidth  = Math.round(cssWidth  * resolutionScale);
  const canvasHeight = Math.round(cssHeight * resolutionScale);

  if (simCanvas.width  !== canvasWidth  ||
      simCanvas.height !== canvasHeight) {
    simCanvas.width  = canvasWidth;
    simCanvas.height = canvasHeight;
  }

  // Sync gpuCanvas pixel size to simCanvas whenever it changes.
  if (gpuCanvasEl) resizeGPU(canvasWidth, canvasHeight);

  // --- INTERPOLATE RENDER STATE ---
  // If we have two snapshots, lerp between them by alpha.
  // On the very first frame before any physics ticks, just render raw state.
  if (prev && curr) {
    // Angle interpolation needs shortest-path wrapping to avoid spinning through 2π.
    const headingDelta  = wrapAngle(curr.heading    - prev.heading);
    const steerDelta    = wrapAngle(curr.steerAngle - prev.steerAngle);
    const wheelDelta    = wrapAngle(curr.wheelAngle - prev.wheelAngle);

    state.body.centerX              = prev.centerX + (curr.centerX - prev.centerX) * alpha;
    state.body.centerY              = prev.centerY + (curr.centerY - prev.centerY) * alpha;
    state.body.heading              = prev.heading  + headingDelta * alpha;
    state.steering.frontWheelAngle  = prev.steerAngle + steerDelta * alpha;
    state.steering.wheelAngle       = prev.wheelAngle  + wheelDelta * alpha;
    state.camera.x                  = prev.camX   + (curr.camX   - prev.camX)   * alpha;
    state.camera.y                  = prev.camY   + (curr.camY   - prev.camY)   * alpha;
    state.camera.zoom               = prev.camZoom + (curr.camZoom - prev.camZoom) * alpha;
  }

  // --- World space (camera transform active) ---
  simCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  applyCameraTransform(simCtx, canvasWidth, canvasHeight);

  if (isGPUReady()) {
    // GPU handles: background, skid marks, trail arrows, sparks, splat particles.
    // Canvas 2D handles remaining world-space elements (map boundary, decals,
    // balloons, car) on the transparent simCanvas (z-index:1) that sits above.
    drawMapBoundary(simCtx);
    drawSplatDecals(simCtx);
    // drawSkidMarks: handled by GPU accumulation texture
    // drawSplatParticles: handled by GPU particle pipeline
    drawBalloons(simCtx);
    // drawTrailArrows: handled by GPU instanced arrows
    // drawSparks: handled by GPU particle pipeline
    if (state.params.showKinematicArrows) {
      drawKinematicArrows(simCtx);
    }
  } else {
    // Canvas 2D fallback — full world-space rendering when WebGPU is unavailable.
    drawCheckerboard(simCtx, canvasWidth, canvasHeight);  // also updates blurAccumulator
    drawMapBoundary(simCtx);
    drawSplatDecals(simCtx);
    if (state.params.showSkidMarks) {
      drawSkidMarks(simCtx);
    }
    drawSplatParticles(simCtx);
    drawBalloons(simCtx);
    drawTrailArrows(simCtx);
    if (state.params.showSparks) {
      drawSparks(simCtx);
    }
    if (state.params.showKinematicArrows) {
      drawKinematicArrows(simCtx);
    }
  }

  // Debug overlays (tire forces, SAT, slip angles, etc.) — always Canvas 2D.
  if (state.params.debugShowTireForces || state.params.debugShowSlipAngles ||
      state.params.debugShowSAT || state.params.debugShowSmoothingFilter ||
      state.params.debugShowCrossover || state.params.debugShowWheelSpeeds) {
    drawDebugOverlays(simCtx);
  }

  // --- Record current pose for motion blur ghost trail ---
  const maxGhosts = Math.max(1, (state.params.motionBlurSamples || 6));
  const history = state.carPoseHistory;
  history.push({
    cx:      state.body.centerX,
    cy:      state.body.centerY,
    heading: state.body.heading,
    wheels: {
      frontLeft:  { x: state.wheels.frontLeft.x,  y: state.wheels.frontLeft.y  },
      frontRight: { x: state.wheels.frontRight.x, y: state.wheels.frontRight.y },
      rearLeft:   { x: state.wheels.rearLeft.x,   y: state.wheels.rearLeft.y   },
      rearRight:  { x: state.wheels.rearRight.x,  y: state.wheels.rearRight.y  },
    },
    steerAngle: state.steering.frontWheelAngle,
  });
  while (history.length > maxGhosts + 1) history.shift();

  drawCarGhosts(simCtx);
  drawCar(simCtx);
  removeCameraTransform(simCtx);

  // --- GPU world render (background + skid + arrows + particles) ---
  // Called after interpolated state is set but before restoring physics state.
  if (isGPUReady()) {
    renderFrameGPU(canvasWidth, canvasHeight);
  }

  // --- Restore physics state after render (so physics reads real values next step) ---
  if (curr) {
    state.body.centerX              = curr.centerX;
    state.body.centerY              = curr.centerY;
    state.body.heading              = curr.heading;
    state.steering.frontWheelAngle  = curr.steerAngle;
    state.steering.wheelAngle       = curr.wheelAngle;
    state.camera.x                  = curr.camX;
    state.camera.y                  = curr.camY;
    state.camera.zoom               = curr.camZoom;
  }

  // --- Screen space (HUD, no camera transform) ---
  drawSteeringWheelHud(simCtx, canvasWidth, canvasHeight);
  drawThrottleBar(simCtx, canvasWidth, canvasHeight);
  drawBrakeBar(simCtx, canvasWidth, canvasHeight);
  drawHandbrakeBar(simCtx, canvasWidth, canvasHeight);
  drawClutchBar(simCtx, canvasWidth, canvasHeight);
  drawGearIndicator(simCtx, canvasWidth, canvasHeight);
  drawScoreHud(simCtx, canvasWidth, canvasHeight);
  drawLogsToggleCheckbox(simCtx, canvasWidth, canvasHeight);

  // Debug panels (telemetry overlay)
  drawDebugPanels(simCtx, canvasWidth, canvasHeight);

  // Check for render-phase faults (non-finites, timing anomalies)
  checkFaults('render', wallRenderDt * 1000); // convert seconds to ms

  // Info bar text.
  updateInfoBar();

  // --- Gauge canvases ---
  // Pass wall-clock dt so needle springs are framerate-independent.
  drawGauges(wallRenderDt);
}


// Draws all three analog gauge canvases.
// dt: real wall-clock seconds since last render frame (for framerate-independent needle spring).
function drawGauges(dt) {
  const labelFontScale = state.params.gaugeLabelScale;

  // Compute gauge shake intensity from vehicle speed.
  // Below 40 m/s (~144 km/h) there is no shake.
  // Above that it ramps to full amplitude at ~70 m/s (~250 km/h).
  const SHAKE_THRESHOLD = 40; // m/s
  const SHAKE_FULL_SPEED = 70; // m/s
  const speedJitter = state.body.speed > SHAKE_THRESHOLD
    ? Math.min((state.body.speed - SHAKE_THRESHOLD) / (SHAKE_FULL_SPEED - SHAKE_THRESHOLD), 1.0)
    : 0;

  // Tachometer: 0–7000 RPM, redline at 6500.
  const rpmNormalized = rpmNeedle.step(
    state.engine.isStalled || !state.engine.isRunning
      ? 0
      : state.engine.rpm / TACHOMETER_MAX_RPM,
    dt
  );
  drawAnalogGauge(rpmCtx, rpmCanvas.width, rpmCanvas.height, {
    value:           state.engine.rpm,
    min:             0,
    max:             TACHOMETER_MAX_RPM,
    title:           'RPM',
    subtitle:        '× 1000',
    majorStep:       1000,
    minorDivisions:  5,
    redFrom:         TACHOMETER_REDLINE_RPM,
    needleNormalized: rpmNormalized,
    labelFormatter:  (v) => String(v / 1000),
    labelFontScale,
    speedJitter,
  });

  // Speedometer: 0–200 km/h.
  const speedKph        = state.body.speed / KPH_TO_MPS;
  const speedNormalized = speedNeedle.step(speedKph / SPEEDOMETER_MAX_KPH, dt);
  drawAnalogGauge(speedCtx, speedCanvas.width, speedCanvas.height, {
    value:           speedKph,
    min:             0,
    max:             SPEEDOMETER_MAX_KPH,
    title:           'SPEED',
    subtitle:        'km/h',
    majorStep:       20,
    minorDivisions:  4,
    redFrom:         null,
    needleNormalized: speedNormalized,
    labelFormatter:  (v) => String(Math.round(v)),
    labelFontScale,
    speedJitter,
  });

  // Lateral G gauge: 0–1.5 G.
  const lateralG       = Math.min(Math.abs(state.body.lateralAccel) / 9.81, 3.0);
  const lateralGMax    = 1.5;
  const latGNormalized = latGNeedle.step(lateralG / lateralGMax, dt);
  drawAnalogGauge(latGCtx, latGCanvas.width, latGCanvas.height, {
    value:           lateralG,
    min:             0,
    max:             lateralGMax,
    title:           'LAT G',
    subtitle:        'g-force',
    majorStep:       0.5,
    minorDivisions:  5,
    redFrom:         1.0,
    needleNormalized: latGNormalized,
    labelFormatter:  (v) => v.toFixed(1),
    labelFontScale,
    speedJitter,
  });

  // --- Dynamic registered gauges ---
  const registry = getGaugeRegistry();
  for (const entry of registry) {
    const value = entry.getValue();

    // Check if this gauge has a custom renderer
    if (entry.customRenderer) {
      const customRenderer = customRendererMap[entry.customRenderer];
      if (customRenderer) {
        // For custom renderers, handle needle smoothing based on gauge type
        let config = {
          value,
          labelFontScale,
          speedJitter,
        };

        // Add type-specific config
        if (entry.needle && entry.customRenderer === 'drawYawStabilityGauge') {
          const normalized = entry.needle.step(
            (value - entry.min) / Math.max(entry.max - entry.min, 1),
            dt
          );
          config.needleNormalized = normalized;
        } else if (entry.needle && entry.customRenderer === 'drawSlipAngleMeter') {
          const normalized = (value - entry.min) / Math.max(entry.max - entry.min, 1);
          config.needleNormalized = entry.needle.step(Math.max(0, Math.min(normalized, 1)), dt);
        } else if (entry.radarNeedles && entry.customRenderer === 'drawDriftRadar') {
          config.radarNeedles = entry.radarNeedles;
        } else if (entry.axle && entry.customRenderer === 'drawFrictionCircle') {
          config.axle = entry.axle;
        }

        // Call the custom renderer
        customRenderer(entry.ctx, entry.canvas.width, entry.canvas.height, config);
      }
    } else {
      // Standard analog gauge rendering
      const range = entry.max - entry.min;
      const normalized = (entry.needle ? entry.needle.step(
        range > 0 ? (value - entry.min) / range : 0,
        dt
      ) : 0);

      drawAnalogGauge(entry.ctx, entry.canvas.width, entry.canvas.height, {
        value:            value,
        min:              entry.min,
        max:              entry.max,
        title:            entry.title,
        subtitle:         entry.subtitle,
        majorStep:        entry.majorStep,
        minorDivisions:   entry.minorDivisions,
        redFrom:          entry.redFrom,
        needleNormalized: normalized,
        labelFormatter:   entry.labelFormatter,
        labelFontScale,
        speedJitter,
      });
    }
  }

  // --- Wheel slip ratio gauges (Phase 5.5) ---
  const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const canvasIds = ['wheelFLCanvas', 'wheelFRCanvas', 'wheelRLCanvas', 'wheelRRCanvas'];

  for (let i = 0; i < 4; i++) {
    const name = wheelNames[i];
    const canvasId = canvasIds[i];
    const canvas = document.getElementById(canvasId);

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawWheelSlipGauge(ctx, canvas.width, canvas.height, {
          slipRatio: state.wheelSlipRatio[name] || 0,
          utilization: state.wheelFrictionUtil[name] || 0,
          wheelName: name,
          peakSlipRatio: state.params.peakSlipRatio || 0.12,
        });
      }
    }
  }
}


// =============================================================
// BALLOON RESPAWN
// =============================================================

// Respawn accumulator — tracks fractional balloons owed per second.
let balloonRespawnAccumulator = 0;

// Advances the respawn timer and spawns new balloons up to maxBalloons.
function updateBalloonRespawn(dt) {
  const maxBalloons  = state.params.maxBalloons;
  const respawnRate  = state.params.balloonRespawnRate; // balloons per second

  const liveBalloons = state.balloons.filter(b => !b.isPopped).length;
  if (liveBalloons >= maxBalloons) {
    balloonRespawnAccumulator = 0;
    return;
  }

  balloonRespawnAccumulator += respawnRate * dt;

  while (balloonRespawnAccumulator >= 1 && liveBalloons < maxBalloons) {
    balloonRespawnAccumulator -= 1;
    spawnSingleBalloon();
  }
}

// Spawns a single balloon at a random map position (avoiding car vicinity).
function spawnSingleBalloon() {
  const margin     = 5; // metres from map edge
  const mapWidth   = state.params.mapWidth;
  const mapHeight  = state.params.mapHeight;
  const carX       = state.body.centerX;
  const carY       = state.body.centerY;

  let attempts = 0;
  let x, y;
  do {
    x = margin + physicsRandom() * (mapWidth  - margin * 2);
    y = margin + physicsRandom() * (mapHeight - margin * 2);
    attempts++;
    // Avoid spawning within 15m of the car so it doesn't instantly pop.
  } while (Math.hypot(x - carX, y - carY) < 15 && attempts < 20);

  const radius  = 0.6 + physicsRandom() * 1.2;
  const hue     = physicsRandom() * 360;

  state.balloons.push({ x, y, radius, hue, isPopped: false,
    deformTime: 0, deformScale: 1.0, deformDir: { x: 0, y: -1 } });
}


// =============================================================
// SKID MARKS
// =============================================================

let skidPrevPositions = {};
const skidFadeState = { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };

function recordSkidMarks(dt) {
  // NOTE: wheelGrip now stores friction circle utilization [0=safe, 1=at limit]
  // (migrated from old "grip remaining" semantic for clarity)
  const utilization = state.wheelFrictionUtil;
  const wheels = state.wheels;
  const body   = state.body;
  const decals = state.splatDecals;
  const p      = state.params;

  // Read all tunable params with safe defaults
  // skidGripThreshold is now skidUtilizationThreshold (0.6 = trigger skids when 60%+ utilization)
  const skidUtilThreshold = p.skidGripThreshold !== undefined ? p.skidGripThreshold : 0.6;
  const fadeRate       = p.skidFadeRate         !== undefined ? p.skidFadeRate         : 8.0;
  const widthMin       = p.skidWidthMin         !== undefined ? p.skidWidthMin         : 0.12;
  const widthMax       = p.skidWidthMax         !== undefined ? p.skidWidthMax         : 0.47;
  const alphaMin       = p.skidAlphaMin         !== undefined ? p.skidAlphaMin         : 0.2;
  const alphaMax       = p.skidAlphaMax         !== undefined ? p.skidAlphaMax         : 0.7;
  const jerkBoostMax   = p.skidJerkBoostMax     !== undefined ? p.skidJerkBoostMax     : 0.3;
  const maxSegments    = p.skidMaxSegments      !== undefined ? p.skidMaxSegments       : 4000;
  const pickupRate     = p.paintPickupRate      !== undefined ? p.paintPickupRate       : 2.5;
  const satPickupRate  = p.paintSatPickupRate   !== undefined ? p.paintSatPickupRate    : 0.8;
  const depletionRate  = p.paintDepletionRate   !== undefined ? p.paintDepletionRate    : 0.10;
  const minSat         = p.paintMinSat          !== undefined ? p.paintMinSat           : 0.05;
  const decalDepletion = p.paintDecalDepletion  !== undefined ? p.paintDecalDepletion   : 0.08;
  const driftIntensity = state.driftIntensity   || 0;

  // --- Handle balloon pop paint injection ---
  // Frame 1 after pop = first step where lastBalloonHueFrames was incremented to 1
  const freshBalloonHue = state.tractionState.lastBalloonHue;
  const isFreshPop = (freshBalloonHue !== undefined && freshBalloonHue >= 0 &&
                      state.tractionState.lastBalloonHueFrames === 1);

  if (isFreshPop) {
    for (const wn of ['frontLeft', 'frontRight', 'rearLeft', 'rearRight']) {
      const tp = state.tirePaint[wn];
      tp.hue = freshBalloonHue;
      tp.saturation = 1.0;
      tp.contactDecalIdx = -1;
      tp.contactDuration = 0;
    }
  }

  const allWheels = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

  for (const wheelName of allWheels) {
    const u = utilization[wheelName] || 0;
    // isSliding when utilization EXCEEDS threshold (we're using lots of traction = slipping/locking)
    const isSliding = u > skidUtilThreshold;

    if (isSliding) {
      skidFadeState[wheelName] = Math.min(1.0, skidFadeState[wheelName] + fadeRate * dt);
    } else {
      skidFadeState[wheelName] = Math.max(0.0, skidFadeState[wheelName] - fadeRate * dt);
    }

    const fade  = skidFadeState[wheelName];
    const tp    = state.tirePaint[wheelName];
    const wheel = wheels[wheelName];

    // --- PAINT SYSTEM: check if wheel is over a decal ---
    let contactDecalIdx = -1;
    for (let di = decals.length - 1; di >= 0; di--) {
      const d = decals[di];
      if (d.alpha < 0.02) continue;
      const dx = wheel.x - d.x;
      const dy = wheel.y - d.y;
      if (dx * dx + dy * dy < d.radius * d.radius) {
        contactDecalIdx = di;
        break;
      }
    }

    // Track contact duration (reset when decal index changes)
    if (contactDecalIdx >= 0) {
      if (contactDecalIdx === tp.contactDecalIdx) {
        tp.contactDuration += dt;
      } else {
        tp.contactDuration = dt;
        tp.contactDecalIdx = contactDecalIdx;
      }
    } else {
      tp.contactDecalIdx = -1;
      tp.contactDuration = 0;
    }

    // Paint pickup from decal
    if (contactDecalIdx >= 0) {
      const d          = decals[contactDecalIdx];
      const wheelLoad  = state.wheelLoads[wheelName] || 1;
      const normalLoad = Math.min(wheelLoad / 8000, 1.5);
      const contactB   = Math.min(tp.contactDuration * 1.5, 1.0);
      const rate       = pickupRate * normalLoad * contactB * Math.max(d.alpha, 0.1);

      if (tp.hue < 0 || tp.saturation < minSat) {
        tp.hue = d.hue;
        tp.saturation = Math.min(satPickupRate * dt * rate * 4, 1.0);
      } else {
        const hueDiff = ((d.hue - tp.hue) + 540) % 360 - 180;
        tp.hue = ((tp.hue + hueDiff * rate * dt) + 360) % 360;
        tp.saturation = Math.min(tp.saturation + satPickupRate * rate * dt, 1.0);
      }
      d.alpha = Math.max(0.01, d.alpha - decalDepletion * dt);
    }

    // Paint depletion while sliding
    if (isSliding && tp.saturation > 0) {
      tp.saturation = Math.max(0, tp.saturation - dt * depletionRate * (0.5 + driftIntensity * 0.5));
      if (tp.saturation < minSat) {
        tp.hue = -1;
        tp.saturation = 0;
      }
    }

    // --- RECORD SKID SEGMENT ---
    if (fade < 0.01) {
      delete skidPrevPositions[wheelName];
      continue;
    }

    if (skidPrevPositions[wheelName]) {
      const prev = skidPrevPositions[wheelName];
      const dist = Math.hypot(wheel.x - prev.x, wheel.y - prev.y);

      if (dist > 0.03) {
        // Skid intensity scales with utilization above threshold
        const excessUtilization = Math.max(0, u - skidUtilThreshold);
        const width     = widthMin + excessUtilization * (widthMax - widthMin);
        const baseAlpha = alphaMin + excessUtilization * (alphaMax - alphaMin);
        const jerkBoost = Math.min((body.jerkMagnitude || 0) / 300, jerkBoostMax);
        const alpha     = Math.min(baseAlpha * fade + jerkBoost, 0.95);

        const hue = (tp.saturation > minSat && tp.hue >= 0) ? tp.hue : -1;

        const seg = {
          x1: prev.x, y1: prev.y,
          x2: wheel.x, y2: wheel.y,
          hue,
          paintSaturation: hue >= 0 ? tp.saturation : 1.0,
          width,
          alpha,
        };
        state.skidMarks.push(seg);
        // Feed GPU accumulation — gpu-renderer.js drains this each render frame.
        if (state.skidMarksNewThisFrame) state.skidMarksNewThisFrame.push(seg);

        if (state.skidMarks.length > maxSegments) {
          state.skidMarks.splice(0, Math.floor(maxSegments * 0.1));
        }
      }
    }

    skidPrevPositions[wheelName] = { x: wheel.x, y: wheel.y };
  }
}

const MAX_SKID_SEGMENTS_MAIN = 4000; // kept for compat; actual limit from params


// =============================================================
// SCREEN SHAKE
// =============================================================

// Decays the screen shake magnitude exponentially each physics step.
function decayScreenShake(dt) {
  const shake = state.screenShake;
  if (shake.magnitude <= 0.001) {
    shake.magnitude = 0;
    shake.shakeX    = 0;
    shake.shakeY    = 0;
    return;
  }

  // Exponential decay.
  shake.magnitude *= Math.exp(-8.0 * dt);

  // Generate a new random offset each step — this is what makes it "shake"
  // rather than just move smoothly.
  const angle     = physicsRandom() * Math.PI * 2;
  shake.shakeX    = Math.cos(angle) * shake.magnitude;
  shake.shakeY    = Math.sin(angle) * shake.magnitude;
}

// Triggers a screen shake. Called from balloon.js via state mutation
// (balloon.js sets state.screenShake.magnitude directly).
// This function exists so renderer can read shake from state.
export function triggerScreenShake(magnitude) {
  if (magnitude > state.screenShake.magnitude) {
    state.screenShake.magnitude = magnitude;
  }
}


// Debug helper: expose parameters to browser console via logger
window.debugParams = () => {
  const p = state.params;
  logger.info('debug', '=== CRITICAL PARAMETERS ===');
  logger.info('debug', `wheelInertia: ${p.wheelInertia.toFixed(3)} (should be 1.2)`);
  logger.info('debug', `wheelRadius: ${p.wheelRadius.toFixed(3)} (should be 0.35)`);
  logger.info('debug', `finalDriveRatio: ${p.finalDriveRatio.toFixed(2)} (should be 4.1)`);
  logger.info('debug', `gearRatio1: ${p.gearRatio1.toFixed(2)} (should be 3.5)`);
  logger.info('debug', `carMassKg: ${p.carMassKg.toFixed(0)} (should be 1200-1500)`);
  logger.info('debug', `peakEngineTorqueNm: ${p.peakEngineTorqueNm.toFixed(0)} (should be 350-400)`);
  logger.info('debug', `idleRpm: ${p.idleRpm.toFixed(0)} (should be 800)`);
  logger.info('debug', `redlineRpm: ${p.redlineRpm.toFixed(0)} (should be 9000)`);
  logger.info('debug', '=== ALL PARAMS ===');
  logger.info('debug', JSON.stringify(p, null, 2));
};

// Kick off the game loop.
requestAnimationFrame(mainLoop);
