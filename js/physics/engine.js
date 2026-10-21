// =============================================================
// ENGINE — drivetrain, clutch model, gear changes, sleep, audio stub
// =============================================================
// Exports: updateEngine, handleGearChange, applySleepIfNeeded, updateEngineSound
// Private: getGearRatio, torqueCurveNormalized, computeClutchEngagement

import { physicsState as state } from '../state.js';
import { updateEngineSound as soundUpdate, triggerGearChange as soundGearChange } from '../sound.js';
import {
  CAR_HALF_LENGTH, CAR_HALF_WIDTH,
  TORQUE_PEAK_RPM,
  GEAR_RATIOS,
  TAU,
} from '../constants.js';

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
  const input = state.input;
  const body = state.body;
  const params = state.params;

  if (!engine.isRunning) {
    engine.rpm = 0;
    engine.transmittedTorqueNm = 0;
    engine.drivetrainLocked = false;
    return;
  }

  let throttleAmount = 0;
  if (input.mouseThrottleActive) throttleAmount = input.mouseThrottleAmount;
  else if (input.throttleKeyHeld) throttleAmount = 1;

  const targetPedalPosition = input.clutchKeyHeld ? 0 : 1;
  const pedalRate = 1 / params.clutchEngageTime;
  if (engine.clutchPedalPosition < targetPedalPosition) {
    engine.clutchPedalPosition = Math.min(targetPedalPosition,
      engine.clutchPedalPosition + pedalRate * dt);
  } else {
    engine.clutchPedalPosition = Math.max(targetPedalPosition,
      engine.clutchPedalPosition - pedalRate * dt);
  }

  const prevClutchEngagement = engine.clutchEngagement;
  engine.clutchEngagement = computeClutchEngagement(
    engine.clutchPedalPosition, params.clutchBitePoint,
    params.clutchBiteRange, params.clutchBiteCurve,
  );
  const gearRatio = getGearRatio(engine.currentGear, params);
  const drivetrainLocked = gearRatio !== 0 && engine.clutchEngagement > 0.99;
  engine.drivetrainLocked = drivetrainLocked;

  const bitePointCrossing = prevClutchEngagement < 0.5 && engine.clutchEngagement >= 0.5;
  if (bitePointCrossing && body.speed > 2 && gearRatio !== 0) {
    const jerkMagnitude = Math.min(body.speed * 0.008, 0.12);
    const forwardX = Math.sin(body.heading);
    const forwardY = -Math.cos(body.heading);
    state.camera.jerkOffsetX = forwardX * jerkMagnitude;
    state.camera.jerkOffsetY = forwardY * jerkMagnitude;
  }

  if (engine.isStalled) {
    engine.rpm = 0;
    engine.transmittedTorqueNm = 0;
    if (engine.clutchEngagement < 0.01 && throttleAmount > 0.01) {
      engine.isStalled = false;
      engine.rpm = params.idleRpm;
    } else {
      return;
    }
  }

  let revMatchTorque = 0;
  if (engine.revMatchTimer > 0) {
    engine.revMatchTimer -= dt;
    const inertia = Math.max(params.engineInertiaKgM2 || 0.25, 1e-4);
    const rpmError = engine.revMatchTargetRpm - engine.rpm;
    revMatchTorque = clamp(rpmError * (TAU / 60) * inertia * 8,
      0, params.peakEngineTorqueNm * 0.5);
  }

  const idleRpm = params.idleRpm;
  const redlineRpm = params.redlineRpm;
  const inertia = Math.max(params.engineInertiaKgM2 || 0.25, 1e-4);
  const peakTorque = Math.max(params.peakEngineTorqueNm, 0);
  const torqueNormalized = torqueCurveNormalized(engine.rpm, idleRpm, redlineRpm);
  const engineFriction = peakTorque * 0.035 + engine.rpm * (TAU / 60) * 0.01;
  // Idle creep comes through the crank/clutch, never an extra wheel motor.
  // In locked gear the force setting caps the governor's net wheel effort.
  const idleTorqueLimit = drivetrainLocked
    ? engineFriction + Math.max(0, params.idleCreepForce) * params.wheelRadius
      / Math.max(Math.abs(gearRatio * params.finalDriveRatio), 1e-4)
    : peakTorque * 0.25;
  const idleGovernor = clamp(engineFriction + (idleRpm - engine.rpm) * 0.05,
    0, idleTorqueLimit);
  // Redline is a fuel cut, not a clamp on the displayed crank speed. Wheels
  // can mechanically over-rev the engine; that must remain visible and the
  // crank must stop producing combustion/rev-match torque while overspeed.
  const lockedShaftOmega = drivetrainLocked
    ? (state.wheelOmega.rearLeft + state.wheelOmega.rearRight) * 0.5
      * gearRatio * params.finalDriveRatio : 0;
  const reverseCrank = drivetrainLocked && lockedShaftOmega < 0;
  const fuelCut = engine.rpm >= redlineRpm || reverseCrank;
  const combustionTorque = fuelCut ? 0
    : peakTorque * torqueNormalized * throttleAmount + idleGovernor + revMatchTorque;

  if (drivetrainLocked) {
    // In locked gear, crank inertia is reflected into the rear-wheel solve.
    // RPM is synchronized after that solve in synchronizeEngineWithWheels().
    // If the selected gear back-drives the crank in the wrong direction,
    // combustion is off and friction must still oppose shaft rotation.
    engine.transmittedTorqueNm = combustionTorque - engineFriction * (reverseCrank ? -1 : 1);
  } else {
    const rearOmega = (state.wheelOmega.rearLeft + state.wheelOmega.rearRight) * 0.5;
    const shaftOmega = rearOmega * gearRatio * params.finalDriveRatio;
    const crankOmega = engine.rpm * TAU / 60;
    const clutchSlip = crankOmega - shaftOmega;
    // Neutral does not connect the crank to a stationary driven axle, even
    // with the pedal released. There is no modeled gearbox-input-shaft load.
    const clutchCapacity = gearRatio === 0 ? 0 : peakTorque * engine.clutchEngagement;
    const clutchTorque = clamp(clutchSlip * peakTorque / 100,
      -clutchCapacity, clutchCapacity);
    engine.transmittedTorqueNm = clutchTorque;

    const nextOmega = Math.max(0, crankOmega
      + (combustionTorque - clutchTorque - engineFriction) * dt / inertia);
    engine.rpm = nextOmega * 60 / TAU;
  }

  const effectiveStallRpm = params.stallRpm * (1 - params.stallResistance * 0.8);
  if (engine.rpm < effectiveStallRpm && engine.clutchEngagement > 0.01
      && body.speed < 0.5 && throttleAmount < 0.05) {
    engine.isStalled = true;
    engine.rpm = 0;
    engine.transmittedTorqueNm = 0;
  }
}

// A fully engaged clutch constrains crank speed to the driven axle. The engine
// inertia is included in each rear wheel's effective inertia by the tire solve.
export function synchronizeEngineWithWheels() {
  const engine = state.engine;
  if (!engine.isRunning || engine.isStalled || !engine.drivetrainLocked) return;
  const gearRatio = getGearRatio(engine.currentGear, state.params);
  const rearOmega = (state.wheelOmega.rearLeft + state.wheelOmega.rearRight) * 0.5;
  const rpm = Math.abs(rearOmega * gearRatio * state.params.finalDriveRatio) * 60 / TAU;
  engine.rpm = rpm;
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
  const hasTwoGearRatios = newRatio !== 0 && previousRatio !== 0;
  const ratioIsUpshift = hasTwoGearRatios && Math.abs(newRatio) < Math.abs(previousRatio);
  const ratioIsDownshift = hasTwoGearRatios && Math.abs(newRatio) > Math.abs(previousRatio);

  // Rev-match blip for downshifts: if the new gear would demand a higher RPM
  // than the engine currently has, blip the throttle to close the gap.
  if (newRatio !== 0 && previousRatio !== 0 && ratioIsDownshift) {
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
    const eventType = ratioIsUpshift ? 'upshift' : ratioIsDownshift ? 'downshift' : 'gear_change';

    eventBuffer.pushEvent({
      level: 'info',
      channel: 'drivetrain',
      type: eventType,
      msg: `Gear: ${engine.previousGear} → ${newGear} (${eventType})`,
      data: {
        fromGear: engine.previousGear,
        toGear: newGear,
        rpm: engine.rpm,
        isUpshift: ratioIsUpshift,
        isDownshift: ratioIsDownshift,
        previousRatio: previousRatio,
        newRatio: newRatio,
      },
      dedupeKey: `gear:${engine.previousGear}_to_${newGear}`,
    });

    state.debug.transitionState.lastGear = newGear;
  }

  // Play gear change crack sound.
  const isUpshift = newRatio !== 0 && previousRatio !== 0 && ratioIsUpshift;
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
    // Sleep is an explicit dissipative body intervention. Keep its caches in
    // agreement with the newly stationary pose histories before the next tire
    // forecast. Do not erase rotor, force-magnitude, or steering state.
    const b = state.body;
    state.sleepDiagnostic = { removedBodyEnergy: .5 * state.params.carMassKg * b.speed ** 2
      + .5 * state.params.carMassKg * (CAR_HALF_LENGTH ** 2 + CAR_HALF_WIDTH ** 2) / 3 * b.angularVelocity ** 2 };
    b.velocityX = b.velocityY = b.speed = b.angularVelocity = 0;
    b.prevVelocityX = b.prevVelocityY = 0;
    b.accelX = b.accelY = b.prevAccelX = b.prevAccelY = b.jerkX = b.jerkY = b.jerkMagnitude = 0;
    b.longitudinalAccel = b.lateralAccel = 0;
    // Exported SAT is an interval average, not stored tire torsional energy.
    // With zero body transport the point-contact pneumatic moment is zero.
    state.steering.selfAligningTorque = 0;
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
