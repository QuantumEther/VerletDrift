import { recordWetTireTransfer } from './renderer/wet-trail-events.js';
import { observeDust } from './renderer/dust-history.js';
import { profilingEnabled, recordPerformanceFrame, installPerformanceCapture } from './diagnostics/performance-capture.js';
// =============================================================
// MAIN — entry point and game loop
// =============================================================
// Wires all modules together. Owns the requestAnimationFrame loop
// with fixed-timestep physics sub-stepping and variable-rate rendering.
//
// PHYSICS STEP ORDER (enforced here, documented in physics.js):
//   1.  updateSteering(dt)
//   2.  updateEngine(dt)
//   3.  updateSuspension(dt)     [loads drive tire forces]
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
} from './constants.js';

import { initInput } from './input.js';
import { initGPU, isGPUReady, isGPUVehicleReady, renderFrameGPU, resizeGPU } from './gpu-renderer.js';
import { getSkidWidth } from './renderer/vehicle-geometry.js';
import { drawFallbackSmoke } from './renderer/smoke-fallback.js';

import {
  initializeCarBody,
  updateSteering,
  updateEngine,
  synchronizeEngineWithWheels,
  computeBodyDerivedState,
  updateSuspension,
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
} from './renderer/index.js';

import { drawDebugPanels } from './renderer/debug-overlay.js';
import { initDOMOverlay, syncDOMOverlay } from './renderer/debug-overlay-dom.js';

import { updateInfoBar, initChangeLogger } from './ui.js';
import { initWorkspace } from './ui/workspace.js';
import { initControls } from './ui/controls.js';
import { updateInstruments } from './ui/instruments.js';
import { startEngine as startEngineSound, stopEngine as stopEngineSound } from './sound.js';
import { initSoundStateManager } from './soundStateManager.js';
import { spawnBalloons, checkBalloonCollisions, updateSplatParticles, updateComboTimer } from './balloon.js';
import { physicsRandom } from './random.js';

// Debug & observability
import { logger, initLogger } from './debug/logger.js';
import { eventBuffer, initEvents, setStateReference } from './debug/events.js';
import { resolveConfig } from './debug/config.js';
import { checkFaults, markFreezeEntered } from './debug/faults.js';
import { DebugController } from './debug/controller.js';


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
initWorkspace();
const simCanvas   = getCanvas('simCanvas');
const gpuCanvasEl = document.getElementById('gpuCanvas'); // may be null (optional)

const simCtx   = simCanvas.getContext('2d');

// Apply initial resolution (1× — sliders are not yet connected).
// main canvas uses CSS size; gauge canvases are fixed size in HTML.
const simCssWidth  = simCanvas.clientWidth  || simCanvas.width;
const simCssHeight = simCanvas.clientHeight || simCanvas.height;

// Kick off WebGPU initialisation asynchronously.
// The game loop starts immediately; GPU rendering activates once ready.
if (gpuCanvasEl) {
  initGPU(gpuCanvasEl).catch((e) => {
    logger.warn('gpu', 'GPU initialization failed', { error: e.message });
  });
}

// Attach input listeners before anything else so no events are missed.
initInput(simCanvas);

// ===== Initialize diagnostics & observability =====
// Set up logger, event ring buffer, and debug modes before other modules run.
initDOMOverlay(); // Wire DOM overlay element references (must run after DOM is ready)
initEvents(200); // Ring buffer capacity: 200 events
setStateReference(state); // Wire state for auto-enrichment of tSimSec + frame fields
initLogger(eventBuffer);

// Resolve config from URL params → localStorage → defaults
const debugConfig = resolveConfig();

// Phase B: Initialize unified DebugController from config
// Maps legacy mode + logger levels → new controller levels
// Old levels (warn, debug, trace) → New levels (quiet, info, verbose)
const levelMap = {
  quiet: 'quiet',
  tuning: 'debug',   // tuning uses 'debug' logger level
  trace: 'verbose',
};
const loggerLevelToControllerLevel = {
  warn: 'quiet',     // warn level → quiet controller level
  debug: 'debug',    // debug level → debug controller level
  trace: 'verbose',  // trace level → verbose controller level
};
state.debug.controller = new DebugController({
  level: loggerLevelToControllerLevel[debugConfig.level] || levelMap[debugConfig.mode] || 'quiet',
  overlaysEnabled: debugConfig.overlaysEnabled,
  traceChannel: debugConfig.traceChannel,
  traceMs: debugConfig.traceMs,
  freezeOnError: debugConfig.freezeOnError,
});

// Initialize logger with controller and channel settings
logger.setController(state.debug.controller);
if (debugConfig.channels) logger.setChannelsAllowlist(debugConfig.channels);
if (debugConfig.traceChannel) {
  logger.setTraceWindow(debugConfig.traceChannel, debugConfig.traceMs);
}
state.debug.faults.freezeOnError = state.debug.controller.freezeOnError;

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

// Bind all controls before starting physics. This also restores valid sound preferences.
initControls();

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
      soundToggleButton.setAttribute('aria-pressed','true');
    } else {
      stopEngineSound();
      isSoundEnabled = false;
      soundToggleButton.textContent = 'Sound OFF';
      soundToggleButton.setAttribute('aria-pressed','false');
    }
  });
}

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
  // F2: Cycle through debug levels (silent → quiet → info → debug → verbose → silent)
  // Phase B: Use unified DebugController instead of direct state mutation
  if (e.code === 'F2') {
    e.preventDefault();
    state.debug.controller.cycleLevel();
    logger.info('main', `Debug level changed to: ${state.debug.controller.level}`);
  }

  // F3: Toggle overlay visibility
  // Phase B: Use unified DebugController instead of direct state mutation
  if (e.code === 'F3') {
    e.preventDefault();
    state.debug.controller.toggleOverlayVisibility();
    logger.info('main', `Overlays ${state.debug.controller.isOverlayVisible() ? 'enabled' : 'disabled'}`);
  }

  // Shift+Ctrl+T: Open trace window for a channel (prompt user)
  // Phase B: Use unified DebugController instead of direct logger method
  if (e.shiftKey && e.ctrlKey && e.code === 'KeyT') {
    e.preventDefault();
    const channel = prompt('Enter channel name to trace (tires, engine, smoke, etc):');
    if (channel && channel.trim()) {
      state.debug.controller.openTraceWindow(channel.trim(), 2000);
      logger.info('main', `Trace window opened for channel: ${channel}`);
    }
  }
});

// Vehicle initialization is independent of instrument presentation.
initializeCarBody(DEFAULT_MAP_WIDTH * 0.5, DEFAULT_MAP_HEIGHT * 0.5);
spawnBalloons();
computeBodyDerivedState(1 / 60);
updateSuspension(0);

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
  const profileStart = profilingEnabled ? performance.now() : 0;
  const profileIntervalMs = profilingEnabled && state.loop.previousTimestamp > 0
    ? timestampMilliseconds - state.loop.previousTimestamp * 1000 : 0;
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
  // Skipped entirely when the simulation is frozen due to a fault — physics stops
  // advancing but rendering continues so the debug overlay stays visible.
  const maxSubstepsPerFrame = Math.max(1, Math.round(state.params.maxSubstepsPerFrame || 6));
  let ticksThisFrame = 0;

  if (!state.debug.faults.isFrozen) {
    // Each tick advances (physicsWallDt × timeScale) seconds of SIMULATION time.
    // → timeScale=1.0: normal speed   → timeScale=0.1: 10× slow motion
    // The tick RATE in wall-clock is unchanged; only the simulated dt shrinks.
    while (state.loop.accumulator >= physicsWallDt && ticksThisFrame < maxSubstepsPerFrame) {
      snapPrev = snapCurr;

      // Simulated dt: real step size × timeScale.
      const simDt = physicsWallDt * state.params.timeScale;
      state.loop.simulationTime += simDt;
      runPhysicsStep(simDt);
      observeDust(state.body,state.loop.simulationTime,state.params.dustEnabled);

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
  } else {
    // Frozen: drain accumulator so interpolation alpha stays at 0 (render last known state).
    state.loop.accumulator = 0;
    state.loop.droppedSubstepsLastFrame = 0;
    // Fire one-shot freeze event (no-ops after first call until resetFaultState())
    markFreezeEntered();
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

  // Update telemetry metrics for this frame
  state.debug.metrics.dtMs = wallFrameTime * 1000;  // Convert to milliseconds
  state.debug.metrics.substepsThisFrame = ticksThisFrame;

  // Render once per animation frame using interpolated state.
  // Always runs — even when frozen — so the debug overlay can display fault information.
  const profileRenderStart = profilingEnabled ? performance.now() : 0;
  renderFrame(alpha, snapPrev, snapCurr, wallFrameTime);
  const profileRenderEnd = profilingEnabled ? performance.now() : 0;

  // Sync DOM debug overlay — always runs (even when frozen) so FROZEN banner stays current.
  syncDOMOverlay(state, eventBuffer);

  // Post-render state sync: only needed when physics actually ran this frame.
  if (!state.debug.faults.isFrozen) {
    // Save constraint metrics for next frame's spike detection
    state.debug.metrics.prevConstraintMaxCorr = state.debug.metrics.constraintMaxCorr;

    // Phase C: Event Enrichment - Sync transition states for next frame
    // This ensures grip state changes are detected on the next frame's physics step
    for (const wheelName of ['frontLeft', 'frontRight', 'rearLeft', 'rearRight']) {
      state.debug.transitionState.wheelGripStatePrev[wheelName] =
        state.wheelGripState[wheelName].state;
    }

    // Reset frame flags
    state.debug.transitionState.gearChangedThisFrame = false;
  }
  if (profilingEnabled) recordPerformanceFrame(timestampMilliseconds, profileIntervalMs,
    profileRenderStart - profileStart, profileRenderEnd - profileRenderStart,
    performance.now() - profileStart, state.loop.droppedSubstepsLastFrame);
}


// =============================================================
// ONE PHYSICS SUB-STEP
// =============================================================

// Runs a single fixed-dt physics sub-step in the mandatory call order.
// dt is in seconds.
function runPhysicsStep(dt) {
  // Handbrake pressure ramps on over 0.25s and decays over 0.15s after release.
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

  // 3. Spring/damper chassis dynamics supply normal loads for this tire tick.
  updateSuspension(dt);

  // 5–7. Compute all forces.
  const tireForces  = computeTireForces(dt);   // { forceX, forceY, torque }
  synchronizeEngineWithWheels();
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

  // 21b. Age and decay skid marks, culling fully transparent ones.
  // Simple exponential decay: alpha *= exp(-decay_rate * age_time)
  // Removes marks that exceed max age or become too transparent.
  {
    const skidMaxAge = state.params.skidMaxAge || 5.0;
    const skidAlphaDecayRate = state.params.skidAlphaDecayRate || 1.0;
    const now = Date.now();

    for (let i = state.skidMarks.length - 1; i >= 0; i--) {
      const seg = state.skidMarks[i];
      if (!seg) continue;

      // Apply exponential alpha decay to all segments (regardless of createdTime)
      seg.alpha *= Math.exp(-skidAlphaDecayRate * dt);

      // Check age-based culling (segments with createdTime)
      let shouldCull = seg.alpha < 0.001;  // always cull if fully transparent
      if (seg.createdTime !== undefined) {
        const ageSeconds = (now - seg.createdTime) * 0.001;  // convert ms to seconds
        if (ageSeconds > skidMaxAge) {
          shouldCull = true;  // cull if exceeds max age
        }
      }

      if (shouldCull) {
        state.skidMarks.splice(i, 1);
      }
    }
  }

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

  // World and HUD coordinates remain CSS pixels; resolution affects sampling only.
  const canvasWidth = cssWidth;
  const canvasHeight = cssHeight;
  const pixelScale = resolutionScale * (window.devicePixelRatio || 1);
  const backingWidth = Math.round(cssWidth * pixelScale);
  const backingHeight = Math.round(cssHeight * pixelScale);

  if (simCanvas.width !== backingWidth || simCanvas.height !== backingHeight) {
    simCanvas.width = backingWidth;
    simCanvas.height = backingHeight;
  }
  simCtx.setTransform(backingWidth / cssWidth, 0, 0, backingHeight / cssHeight, 0, 0);
  simCtx.imageSmoothingEnabled = true;
  simCtx.imageSmoothingQuality = 'high';

  // Sync gpuCanvas pixel size to simCanvas, scaled by gpuResolutionScale.
  // Lower scale = fewer GPU pixels = better performance; higher = sharper effects.
  if (gpuCanvasEl) {
    const gpuScale = state.params.gpuResolutionScale ?? 1.0;
    resizeGPU(Math.round(backingWidth * gpuScale), Math.round(backingHeight * gpuScale));
  }

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
    // GPU owns world effects and the wet vehicle when liquid is active.
    // Canvas retains the fallback vehicle, boundary, diagnostics and HUD.
    drawMapBoundary(simCtx);
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
    drawFallbackSmoke(simCtx);
    // This legacy upload queue is render-only. The authoritative marks remain
    // in state.skidMarks; retaining this duplicate queue leaks in Canvas mode.
    state.skidMarksNewThisFrame.length = 0;
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

  if (!isGPUVehicleReady()) {
    drawCarGhosts(simCtx);
    drawCar(simCtx, !isGPUReady());
  }
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


// Update the live DOM/SVG instruments without changing the physics tick rate.
// dt: real wall-clock seconds since last render frame (for framerate-independent needle spring).
function drawGauges() { updateInstruments(state); }

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
        const width = getSkidWidth(u, p, wheelName);
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
          createdTime: Date.now(),  // timestamp for decay calculation
        };
        // Visual snapshot survives native skid expiration; gameplay data is untouched.
        recordWetTireTransfer(seg, state.loop.simulationTime);
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

// Expose globals for E2E testing
window.state = state;
window.eventBuffer = eventBuffer;
window.drawDebugPanels = drawDebugPanels;
window.getState = () => state;

// Kick off the game loop.
requestAnimationFrame(mainLoop);

// Diagnostic overlay is opt-in through ?gpuProfile=1; normal UI is unchanged.
installPerformanceCapture();
