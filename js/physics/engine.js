// =============================================================
// ENGINE — drivetrain, clutch model, gear changes, sleep, audio stub
// =============================================================
// Exports: updateEngine, handleGearChange, applySleepIfNeeded, updateEngineSound
// Private: getGearRatio, torqueCurveNormalized, computeClutchEngagement

import { physicsState as state } from '../state.js';
import { updateEngineSound as soundUpdate, triggerGearChange as soundGearChange } from '../sound.js';
import {
  TORQUE_PEAK_RPM,
  GEAR_RATIOS,
  TAU,
} from '../constants.js';

import { logger } from '../debug/logger.js';
import { eventBuffer } from '../debug/events.js';


// =============================================================
// HELPERS
// =============================================================

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Returns the effective gear ratio for the current gear, reading from
// state.params so slider changes take effect at runtime.
function getGearRatio(gear, params) {
  if (gear === 'N') return 0;
  if (gear === 'R') return -(params.gearRatio1 ?? 3.5); // reverse ≈ −1st ratio
  const map = {
    '1': params.gearRatio1,
    '2': params.gearRatio2,
    '3': params.gearRatio3,
    '4': params.gearRatio4,
    '5': params.gearRatio5,
    '6': params.gearRatio6,
  };
  return map[gear] ?? GEAR_RATIOS[gear] ?? 0;
}

function torqueCurveNormalized(rpm, idleRpm, redlineRpm) {
  // Normalise position of rpm within the operating range.
  const rpmRange         = redlineRpm - idleRpm;
  const distanceFromPeak = (rpm - TORQUE_PEAK_RPM) / rpmRange;
  // Parabola: 1 at peak, falling off with the square of distance from peak.
  // The coefficient 2.5 controls how steeply the curve falls away from the peak.
  return Math.max(0, 1.0 - 2.5 * distanceFromPeak * distanceFromPeak);
}


// =============================================================
// ENGINE CLUTCH MODEL
// =============================================================

// Converts clutch pedal position [0, 1] to engagement factor [0, 1].
// Pedal position: 0 = floor (disengaged), 1 = released (engaged).
// The three zones are:
//   [0, bitePoint)                      → 0.0 (no engagement)
//   [bitePoint, bitePoint + biteRange]  → power-curve ramp (bite zone)
//   (bitePoint + biteRange, 1]          → 1.0 (fully engaged)
// The bite zone is where the real clutch feel happens: it should be narrow
// enough to feel like a real bite point, not a linear 0→1 ramp.
function computeClutchEngagement(pedalPosition, bitePoint, biteRange, biteCurve) {
  if (pedalPosition < bitePoint) {
    return 0.0;
  }
  const slipNormalized = (pedalPosition - bitePoint) / biteRange;
  if (slipNormalized >= 1.0) {
    return 1.0;
  }
  // Power curve: slipNormalized^biteCurve gives a convex ramp.
  // Higher biteCurve → most of the engagement happens in a narrow zone at the top.
  return Math.pow(slipNormalized, biteCurve);
}


// =============================================================
// ENGINE UPDATE
// =============================================================

// Manages RPM, clutch pedal position, clutch engagement, and stall detection.
// This is the heart of the drivetrain model.
//
// The clutch pedal position is the physical position of the pedal (0–1).
// The clutch engagement is derived from it via the bite-zone curve.
// RPM behaves differently depending on which clutch zone we are in.
export function updateEngine(dt) {
  const engine = state.engine;
  const input  = state.input;
  const body   = state.body;
  const params = state.params;

  if (!engine.isRunning) {
    engine.rpm = 0;
    return;
  }

  // --- Compute throttle amount ---
  // Mouse drag takes priority if active; keyboard D key is a binary fallback.
  let throttleAmount = 0;
  if (input.mouseThrottleActive) {
    throttleAmount = input.mouseThrottleAmount;
  } else if (input.throttleKeyHeld) {
    throttleAmount = 1.0;
  }

  // --- Move clutch pedal toward target position ---
  // A key held = push pedal to floor (disengage); released = pedal returns.
  const targetPedalPosition = input.clutchKeyHeld ? 0.0 : 1.0;
  const pedalRate = 1.0 / params.clutchEngageTime; // fraction per second
  if (engine.clutchPedalPosition < targetPedalPosition) {
    engine.clutchPedalPosition = Math.min(
      targetPedalPosition,
      engine.clutchPedalPosition + pedalRate * dt
    );
  } else {
    engine.clutchPedalPosition = Math.max(
      targetPedalPosition,
      engine.clutchPedalPosition - pedalRate * dt
    );
  }

  // --- Compute engagement factor from pedal position ---
  const prevClutchEngagement = engine.clutchEngagement; // save before update

  engine.clutchEngagement = computeClutchEngagement(
    engine.clutchPedalPosition,
    params.clutchBitePoint,
    params.clutchBiteRange,
    params.clutchBiteCurve,
  );

  const gearRatio = getGearRatio(engine.currentGear, params);

  // Camera jerk at clutch bite point — when engagement crosses 0.5 upward
  // (pedal releasing, clutch catching) at speed, the driveline loads up
  // suddenly and the car lurches. Model this as a forward camera impulse.
  const bitePointCrossing = prevClutchEngagement < 0.5 && engine.clutchEngagement >= 0.5;
  if (bitePointCrossing && body.speed > 2.0 && gearRatio !== 0) {
    const jerkMagnitude = Math.min(body.speed * 0.008, 0.12);
    const forwardX      = Math.sin(body.heading);
    const forwardY      = -Math.cos(body.heading);
    // Forward lurch — car accelerates suddenly as clutch catches.
    state.camera.jerkOffsetX = forwardX * jerkMagnitude;
    state.camera.jerkOffsetY = forwardY * jerkMagnitude;
  }

  // --- Handle stalled engine ---
  // A stalled engine produces no torque until restarted.
  // Recovery: press clutch fully to floor (disengage), then apply throttle.
  // This mirrors real life: stall → clutch in → throttle to idle → release.
  if (engine.isStalled) {
    engine.rpm = 0;
    const clutchFullyDisengaged = engine.clutchEngagement < 0.01;
    if (throttleAmount > 0.01 && clutchFullyDisengaged) {
      engine.isStalled = false;
      engine.rpm = params.idleRpm;
    }
    return;
  }

  // --- Rev-match blip (automatic RPM assist on downshift) ---
  // Briefly raises RPM to match wheel speed so a downshift doesn't cause a jerk.
  if (engine.revMatchTimer > 0) {
    engine.revMatchTimer -= dt;
    // Blend RPM toward the target over the blip duration.
    const blendRate = 8.0;
    engine.rpm += (engine.revMatchTargetRpm - engine.rpm) * blendRate * dt;
  }

  // Read live slider values for RPM limits and drivetrain
  const idleRpm    = params.idleRpm;
  const redlineRpm = params.redlineRpm;
  const stallRpm   = params.stallRpm;
  const wheelRad   = params.wheelRadius;
  const finalDrive = params.finalDriveRatio;

  // --- RPM computation: three cases based on clutch zone ---
  if (gearRatio === 0 || engine.clutchEngagement < 0.01) {
    // CASE A: Neutral OR clutch fully disengaged → free-revving engine.
    const freeRevTarget = idleRpm + throttleAmount * (redlineRpm - idleRpm);
    // THROTTLE TUNING (User Investigation): Rise rate was 6.0/3.0 which was too aggressive.
    // Small throttle press caused extreme RPM jump. Reduced to 2.5/1.8 for smoother response.
    // This gives ~1.5-2s ramp time from idle to redline, matching realistic engine acceleration.
    const riseRate = throttleAmount > 0.01 ? 2.5 : 1.8;
    engine.rpm += (freeRevTarget - engine.rpm) * riseRate * dt;
    engine.rpm  = clamp(engine.rpm, idleRpm, redlineRpm);

  } else if (engine.clutchEngagement > 0.99) {
    // CASE B: Clutch fully engaged → rigid mechanical coupling.
    // NEW: Use wheel omega (rotational velocity) instead of body speed.
    // This enables independent wheel spin-up during wheelspin/burnout.
    //
    // TRANSIENT FIX: During wheel spin-up (omega < threshold), blend free-rev
    // with wheel RPM to allow smooth launch. Once wheels gain momentum, fully
    // lock to wheel RPM (no runaway revving).
    const rearAvgOmega = (state.wheelOmega.rearLeft + state.wheelOmega.rearRight) * 0.5;
    // Convert wheel omega [rad/s] to wheel RPM
    const wheelRpmValue = rearAvgOmega * (60 / TAU);
    // In geared drivetrain: engineRpm = wheelRpm * gearRatio * finalDrive
    // (gear ratios amplify wheel speed back to engine speed)
    const engineRpmFromWheel = Math.abs(wheelRpmValue) * Math.abs(gearRatio) * finalDrive;

    // Free-rev target based on current throttle
    const freeRevTarget = idleRpm + throttleAmount * (redlineRpm - idleRpm);
    // Same throttle tuning as CASE A for consistency
    const riseRate = throttleAmount > 0.01 ? 2.5 : 1.8;
    const freeRpm = engine.rpm + (freeRevTarget - engine.rpm) * riseRate * dt;

    // Transient blend: if wheels are slow, blend free-rev with wheel demand.
    // Smooth transition: as wheels spin up, gradually lock RPM to wheel speed.
    // NOTE: At typical 0.3m wheel radius:
    //   10 rad/s  ≈ 3 m/s surface speed ≈ 11 km/h (very early launch)
    //   20 rad/s  ≈ 6 m/s surface speed ≈ 22 km/h (early acceleration)
    //   30 rad/s  ≈ 9 m/s surface speed ≈ 32 km/h (mid launch)
    //   50 rad/s  ≈ 15 m/s surface speed ≈ 54 km/h (full launch speed)
    // Threshold of 40 rad/s keeps engine free-revving through most of launch,
    // then locks to wheel speed as car reaches highway merging speed.
    const wheelSpeedThreshold = 40.0;  // rad/s — allow free-rev until wheels reach ~12 m/s
    const transientBlend = Math.max(0, 1.0 - rearAvgOmega / wheelSpeedThreshold);

    engine.rpm = freeRpm * transientBlend + engineRpmFromWheel * (1 - transientBlend);

    // During transient blending, allow RPM to dip lower when wheels are slow.
    // Blend-aware clamp floor: transitions from idle * 0.8 (free-rev) to idle * 0.2 (wheel-locked)
    // This lets engineRpmFromWheel dominate during early launch without being overridden by clamping.
    const clampFloor = idleRpm * (0.8 * transientBlend + 0.2 * (1 - transientBlend));
    engine.rpm = clamp(engine.rpm, clampFloor, redlineRpm);

    // Debug: Log engine state when wheels are spinning (sampled, only in tuning/trace modes)
    if (rearAvgOmega > 1 && throttleAmount > 0.1) {
      logger.sampleEvery('debug', 'engine', 100, () => ({
        rearAvgOmega: rearAvgOmega.toFixed(2),
        freeRpm: freeRpm.toFixed(0),
        engineRpmFromWheel: engineRpmFromWheel.toFixed(0),
        blend: transientBlend.toFixed(2),
        finalRpm: engine.rpm.toFixed(0),
      }));
    }

    const effectiveStallRpm = stallRpm * (1.0 - params.stallResistance * 0.8);
    if (engineRpmFromWheel < effectiveStallRpm && body.speed < 0.5 && throttleAmount < 0.05) {
      engine.isStalled = true;
      engine.rpm = 0;
      return;
    }

  } else {
    // CASE C: Clutch in slip/bite zone → engine free-revs independently.
    // Torque is applied to wheels through clutch engagement (in computeTireForces).
    // Wheels accelerate based on wheel torque integration, NOT coupled to engine RPM.
    // This allows clutch dumps, burnouts, and traction recovery to work correctly.

    const freeRevTarget = idleRpm + throttleAmount * (redlineRpm - idleRpm);
    const riseRate      = throttleAmount > 0.01 ? 6.0 : 3.0;
    const freeRpm       = engine.rpm + (freeRevTarget - engine.rpm) * riseRate * dt;

    engine.rpm = clamp(freeRpm, idleRpm * 0.8, redlineRpm);

    // Stall only if engine truly loses power (no throttle, wheels not spinning up from drag)
    const stallThreshold = stallRpm * 0.5;  // Very lenient during slip
    if (engine.rpm < stallThreshold && throttleAmount < 0.01 && body.speed < 0.2) {
      engine.isStalled = true;
      engine.rpm = 0;
    }
  }
}


// =============================================================
// GEAR CHANGES
// =============================================================

// Called by input.js when the driver selects a new gear.
// On downshift, schedules an automatic rev-match blip to reduce
// the jerk that would otherwise occur from RPM mismatch.
// On any shift, clutch engagement is unaffected — the driver still
// controls the clutch pedal independently.
export function handleGearChange(newGear) {
  const engine = state.engine;
  const body   = state.body;
  const params = state.params;

  const previousRatio = getGearRatio(engine.currentGear, params);
  const newRatio      = getGearRatio(newGear, params);

  // Rev-match blip for downshifts: if the new gear would demand a higher RPM
  // than the engine currently has, blip the throttle to close the gap.
  if (newRatio !== 0 && previousRatio !== 0 && newRatio > previousRatio) {
    const vehicleSpeed = body.speed;
    const wheelRpm     = (vehicleSpeed * 60) / (TAU * params.wheelRadius);
    const targetRpm    = wheelRpm * Math.abs(newRatio) * params.finalDriveRatio;
    if (targetRpm > engine.rpm) {
      engine.revMatchTargetRpm = Math.min(targetRpm, params.redlineRpm);
      engine.revMatchTimer     = 0.2; // blip lasts 200 ms
    }
  }

  engine.previousGear = engine.currentGear;
  engine.currentGear  = newGear;

  // Phase C: Event Enrichment - Emit gear change events
  if (newGear !== engine.previousGear && eventBuffer) {
    const isUpshift = newRatio !== 0 && previousRatio !== 0 && newRatio < previousRatio;
    const isDownshift = !isUpshift && newRatio !== 0 && previousRatio !== 0;
    const eventType = isUpshift ? 'upshift' : isDownshift ? 'downshift' : 'gear_change';

    eventBuffer.pushEvent({
      level: 'info',
      channel: 'drivetrain',
      type: eventType,
      msg: `Gear: ${engine.previousGear} → ${newGear} (${eventType})`,
      data: {
        fromGear: engine.previousGear,
        toGear: newGear,
        rpm: engine.rpm,
        isUpshift: isUpshift,
        isDownshift: isDownshift,
        previousRatio: previousRatio,
        newRatio: newRatio,
      },
      dedupeKey: `gear:${engine.previousGear}_to_${newGear}`,
    });

    state.debug.transitionState.lastGear = newGear;
  }

  // Play gear change crack sound.
  const isUpshift = newRatio !== 0 && previousRatio !== 0 && newRatio < previousRatio;
  soundGearChange(isUpshift);

  // Camera jerk — offset the camera TARGET rearward briefly.
  // The spring then chases body.center while the offset decays,
  // producing a natural lag-and-catch feel rather than a shove.
  const jerkMagnitude = Math.min(body.speed * 0.015, 0.25)*10; // metres
  const forwardX      = Math.sin(body.heading);
  const forwardY      = -Math.cos(body.heading);

  // Gear change: camera target jumps rearward (driveline unloading).
  state.camera.jerkOffsetX = -forwardX * jerkMagnitude;
  state.camera.jerkOffsetY = -forwardY * jerkMagnitude;
}


// =============================================================
// SLEEP RULE (Phase 3b)
// =============================================================

// Applies a sleep/settle rule to prevent micro-drifting at very low speeds.
// When the car is nearly stationary and not being controlled, snap the Verlet
// history to zero velocity so the car comes to a complete, imperceptible stop.
// This fixes the "unending drift" problem where the car coasts to 0.049 m/s
// and stays there forever due to low-speed drag cutoffs.
export function applySleepIfNeeded() {
  const noInput = !state.input.throttleKeyHeld &&
                  !state.input.brakeKeyHeld &&
                  !state.input.mouseThrottleActive;

  const v = state.body.speed;
  const w = Math.abs(state.body.angularVelocity);

  const vSleep = 0.02;   // m/s (2 cm/s — imperceptible to player)
  const wSleep = 0.02;   // rad/s

  // When speed and yaw are below sleep thresholds and there's no input,
  // snap all Verlet history to current position, zeroing implicit velocity.
  if (noInput && v < vSleep && w < wSleep) {
    for (const wheel of Object.values(state.wheels)) {
      wheel.prevX = wheel.x;
      wheel.prevY = wheel.y;
    }
    // Also zero body rotational velocity by snapping heading history
    state.body.prevHeading = state.body.heading;
  }
}


// =============================================================
// AUDIO STUB (Phase 8)
// =============================================================

// Wrapper re-exported so main.js doesn't need to import sound.js directly.
// isSlipping and lateralSlipSpeed are passed through for tire squeal.
export function updateEngineSound(rpm, maxRpm, throttlePosition, isSlipping, lateralSlipSpeed) {
  soundUpdate(rpm, maxRpm, throttlePosition, isSlipping, lateralSlipSpeed);
}
