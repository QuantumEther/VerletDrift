// =============================================================
// PHYSICS / TIRES
// Pacejka tire model, per-wheel force computation, drag, brakes.
// =============================================================
//
// INVARIANTS — do not alter:
//   EMA smoothing on lateral velocity: latSmoothAlpha = 1 - exp(-dt / 0.025)
//   Low-speed lateral fade: clamp01(totalSpeed / 2.0)
//   Tire relaxation: tireRelaxTau = max(relaxationLength / vLongAbs, 1e-4)
//   Friction ellipse: scale both forces when hypot(lat, lon) > frictionLimit
//   Wheel inertia: retain omega history; brakes oppose rotation, not chassis speed.

import { physicsState as state } from '../state.js';
import { integrateWheelContact } from './wheel.js';
import { tireGripLimit } from './tire-load.js';
import {
  GRAVITY,
  TIRE_PEAK_SLIP_RATIO,
  DEG_TO_RAD,
  TAU,
} from '../constants.js';

import { logger } from '../debug/logger.js';
import { eventBuffer } from '../debug/events.js';

// --------------- private helpers ---------------

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

// Returns the effective gear ratio for the current gear, reading from
// state.params so slider changes take effect at runtime.
function getGearRatio(gear, params) {
  if (gear === 'N') return 0;
  if (gear === 'R') return -(params.gearRatio1 ?? 3.5);
  const map = {
    '1': params.gearRatio1,
    '2': params.gearRatio2,
    '3': params.gearRatio3,
    '4': params.gearRatio4,
    '5': params.gearRatio5,
    '6': params.gearRatio6,
  };
  return map[gear] ?? 0;
}

// Simplified Pacejka "Magic Formula" (E=0 variant).
// F = normalLoad × frictionCoeff × sin(C × atan(B × normalisedSlip))
function pacejkaForce(normalLoad, frictionCoeff, slipValue, peakSlipValue, B, C) {
  const safePeakSlip = Math.max(Math.abs(peakSlipValue), 1e-4);
  const normalisedSlip = slipValue / safePeakSlip;
  const peakNorm = Math.sin(C * Math.atan(B));
  if (peakNorm < 0.0001) return 0;
  return (normalLoad * frictionCoeff / peakNorm) *
         Math.sin(C * Math.atan(B * normalisedSlip));
}

// Nominal rim-force settings converted to rotor torque capacity. Road friction
// limits tire contact force, not the brake's ability to stop an airborne wheel.
function computeWheelBrakeCapacity(name, wheelRad, params) {
  let brakeForceMag = 0;
  const isRearWheel = name.startsWith('rear');

  // Regular brake (S key, front wheels get 80%, so 0.4 per wheel × 2 wheels = 80%)
  if (state.input.brakeKeyHeld && !isRearWheel) {
    brakeForceMag = params.brakeForce * 0.4;
  }

  // Handbrake (F key, rear only, progressive with handbrakeValue 0–1)
  if (state.input.handbrakeKeyHeld && isRearWheel) {
    brakeForceMag = params.brakeForce * 0.5 * clamp01(state.input.handbrakeValue || 0);
  }

  return Math.max(0, brakeForceMag) * wheelRad;
}

// -----------------------------------------------


// Computes per-wheel tire forces and returns the net body force and net torque.
// The car is rear-wheel-drive: engine torque goes only to rear wheels.
// All four wheels contribute lateral forces (from slip angles).
//
// Returns: { forceX, forceY, torque }
export function computeTireForces(dt) {
  const body        = state.body;
  const engine      = state.engine;
  const loads       = state.wheelLoads;
  const params      = state.params;

  const heading         = body.heading;
  const angularVelocity = body.angularVelocity;
  const frictionCoeff   = params.tireFrictionCoeff;
  const gearRatio       = getGearRatio(engine.currentGear, params);

  // Car forward unit vector (in canvas coords: +Y is down, +X is right).
  const forwardX = Math.sin(heading);
  const forwardY = -Math.cos(heading);
  // Car right unit vector (perpendicular, 90° clockwise from forward).
  const rightX   =  Math.cos(heading);
  const rightY   =  Math.sin(heading);

  // Longitudinal speed along the car's forward axis.
  const longitudinalSpeed = dot(body.velocityX, body.velocityY, forwardX, forwardY);
  const speedMagnitude    = Math.max(0.05, body.speed);

  // Apply clutch-transmitted crank torque through the current gear ratio.
  // Only the rear wheels are driven in this model.
  let driveForce = 0;
  if (gearRatio !== 0 && engine.clutchEngagement > 0 && !engine.isStalled) {
    let throttleAmount = 0;
    if (state.input.mouseThrottleActive) {
      throttleAmount = state.input.mouseThrottleAmount;
    } else if (state.input.throttleKeyHeld) {
      throttleAmount = 1.0;
    }

    const wheelTorque = (engine.transmittedTorqueNm || 0)
      * Math.abs(gearRatio) * params.finalDriveRatio;
    driveForce = wheelTorque / params.wheelRadius;

    // Reverse: flip the direction.
    if (gearRatio < 0) driveForce = -driveForce;

    // Idle creep: small force at idle in a low gear even without throttle.
    if (throttleAmount < 0.05 && Math.abs(gearRatio) >= 1.0 &&
        engine.clutchEngagement > 0.9 && Math.abs(longitudinalSpeed) < 3) {
      driveForce += params.idleCreepForce * engine.clutchEngagement;
    }
  }

  // Wheel positions (arm vectors from body centre to wheel).
  const wheelPositions = {
    frontLeft:  state.wheels.frontLeft,
    frontRight: state.wheels.frontRight,
    rearLeft:   state.wheels.rearLeft,
    rearRight:  state.wheels.rearRight,
  };

  const peakSlipAngleRad = Math.max(params.peakSlipAngleDeg * DEG_TO_RAD, 1e-4);
  const safePeakSlipRatio = Math.max(Math.abs(params.peakSlipRatio), 1e-4);

  let netForceX = 0;
  let netForceY = 0;
  let netTorque = 0;

  // Per-wheel lateral force magnitudes — stored for SAT computation after the loop.
  const perWheelLateralForce = {};

  const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const wheelKinematics = state.wheelKinematics;
  const wheelInertia = params.wheelInertia || 1.2;
  const reflectedEngineInertia = engine.drivetrainLocked
    ? (params.engineInertiaKgM2 || 0.25)
      * (gearRatio * params.finalDriveRatio) ** 2 / 2
    : 0;
  if (!state.wheelBrakeTorque) state.wheelBrakeTorque = {};

  let maxLateralWheelSpeed = 0;
  let anyWheelSlipping     = false;

  for (const name of wheelNames) {
    const wheelPos    = wheelPositions[name];
    const normalLoad  = loads[name];
    const gripLimit = tireGripLimit(normalLoad, frictionCoeff,
      params.carMassKg * GRAVITY / 4, params.tireLoadSensitivity);
    const effectiveFriction = normalLoad > 0 ? gripLimit / normalLoad : 0;
    const isFront     = name === 'frontLeft' || name === 'frontRight';

    // Arm vector: wheel position relative to body centre.
    const armX = wheelPos.x - body.centerX;
    const armY = wheelPos.y - body.centerY;

    // Wheel velocity = body CoM velocity + angular velocity × arm.
    // 2D cross product: ω × arm = (-ω × armY, ω × armX)
    const wheelVelX = body.velocityX + (-angularVelocity * armY);
    const wheelVelY = body.velocityY + ( angularVelocity * armX);

    // The front wheels are steered; rear wheels always align with car heading.
    const steeringAngle = isFront ? state.steering.frontWheelAngle : 0;

    // Wheel's own forward and right vectors (rotated by steering angle).
    const wheelForwardX = Math.sin(heading + steeringAngle);
    const wheelForwardY = -Math.cos(heading + steeringAngle);
    const wheelRightX   =  Math.cos(heading + steeringAngle);
    const wheelRightY   =  Math.sin(heading + steeringAngle);

    const cachedKinematics = wheelKinematics[name];
    cachedKinematics.wheelForwardX = wheelForwardX;
    cachedKinematics.wheelForwardY = wheelForwardY;
    cachedKinematics.wheelRightX = wheelRightX;
    cachedKinematics.wheelRightY = wheelRightY;
    cachedKinematics.wheelVelX = wheelVelX;
    cachedKinematics.wheelVelY = wheelVelY;

    // Project wheel velocity onto its own axes.
    const wheelLongitudinalSpeed = dot(wheelVelX, wheelVelY, wheelForwardX, wheelForwardY);
    const wheelLateralSpeed      = dot(wheelVelX, wheelVelY, wheelRightX,   wheelRightY);
    const lateralSpeedAbs        = Math.abs(wheelLateralSpeed);
    cachedKinematics.lateralSpeedAbs = lateralSpeedAbs;

    // Store per-wheel lateral speed for per-wheel skid marks and spark generation.
    state.wheelLateralSpeed[name] = lateralSpeedAbs;

    if (lateralSpeedAbs > maxLateralWheelSpeed) maxLateralWheelSpeed = lateralSpeedAbs;
    if (lateralSpeedAbs > 1.8) anyWheelSlipping = true;

    // --- Smooth lateral velocity BEFORE it enters the slip angle calculation ---
    // Constraint solver micro-impulses create high-frequency noise in wheelLateralSpeed.
    // That noise is amplified by the nonlinear Pacejka curve (small vLat changes →
    // large force changes near saturation). Smoothing vLat upstream kills the noise
    // before it enters the nonlinearity — far more effective than filtering the output.
    // Time constant 25ms → at 100Hz alpha ≈ 0.22. Fast enough to track real slides,
    // slow enough to reject constraint impulse spikes.
    const latSmoothTau   = 0.025; // seconds
    const latSmoothAlpha = 1.0 - Math.exp(-dt / latSmoothTau);
    const prevSmoothedLat = state.smoothedWheelLat[name];
    const smoothedLat = prevSmoothedLat + (wheelLateralSpeed - prevSmoothedLat) * latSmoothAlpha;
    state.smoothedWheelLat[name] = smoothedLat;

    // Use smoothed lateral speed for slip angle and force computation.
    const vLong = wheelLongitudinalSpeed;
    const vLat  = smoothedLat;   // ← smoothed, not raw
    const minSlipDenom = 0.5;  // m/s — ensures slip angle defined even at standstill
    const slipDenom = Math.max(Math.abs(vLong), minSlipDenom);
    const slipAngle = Math.atan2(vLat, slipDenom);

    // Lateral force (perpendicular to wheel heading): Pacejka.
    const lateralForceMag = pacejkaForce(normalLoad, effectiveFriction,
                                          Math.abs(slipAngle), peakSlipAngleRad,
                                          params.pacejkaB, params.pacejkaC);
    // Sign: opposes lateral drift direction (use smoothed vLat so sign is stable).
    const lateralForceSign = smoothedLat > 0 ? -1 : 1;

    // --- Low-speed lateral fade ---
    // At near-zero speed, slip angle math hits the denominator clamp and
    // constraint micro-impulses produce large slip angles from tiny velocities.
    // Scale lateral force smoothly to zero below LOW_SPEED_FADE_END m/s.
    const LOW_SPEED_FADE_END = 2.0; // m/s — full lateral force above this speed
    const totalSpeed = Math.hypot(body.velocityX, body.velocityY);
    const lowSpeedFade = clamp01(totalSpeed / LOW_SPEED_FADE_END);
    const fadedLateralForceMag = lateralForceMag * lowSpeedFade;

    // Compute true kinematic slip ratio: κ = (R·ω - v_long) / max(|R·ω|, |v_long|, ε)
    const wheelRad = params.wheelRadius;
    function slipAtOmega(omega) {
      const surfaceSpeed = omega * wheelRad;
      const denominator = Math.max(Math.abs(surfaceSpeed), Math.abs(wheelLongitudinalSpeed), 0.5);
      return clamp((surfaceSpeed - wheelLongitudinalSpeed) / denominator, -1, 1);
    }

    function longitudinalTarget(omega) {
      const slip = slipAtOmega(omega);
      return pacejkaForce(normalLoad, effectiveFriction, Math.abs(slip), safePeakSlipRatio,
        params.pacejkaB, params.pacejkaC) * Math.sign(slip);
    }

    // Preserve the combined-force cap and distance-based force relaxation.
    // Resolve longitudinal force at the new rotor speed, so the contact force
    // accelerating the body is the same force reacting against wheel inertia.
    const frictionLimit  = gripLimit;
    const relaxationLength = params.tireRelaxationLength !== undefined
      ? Math.max(params.tireRelaxationLength, 0.02) : 0.3;
    const vLongAbs = Math.max(Math.abs(wheelLongitudinalSpeed), 0.5);
    const tireRelaxTau = Math.max(relaxationLength / vLongAbs, 1e-4);
    const tireRelaxAlpha = clamp01(1.0 - Math.exp(-dt / tireRelaxTau));
    const prev = state.prevTireForce[name];
    // Load can change faster than the tire relaxation state (especially at
    // wheel lift-off). Keep carried force inside the *current* friction circle
    // before it enters either the rotor solve or lateral-force relaxation.
    // With zero normal load this clears contact force immediately; when load
    // returns, the normal relaxation path rebuilds force over time.
    const previousMagnitude = Math.hypot(prev.lon, prev.lat);
    if (previousMagnitude > frictionLimit && previousMagnitude > 0) {
      const loadScale = frictionLimit / previousMagnitude;
      prev.lon *= loadScale;
      prev.lat *= loadScale;
    }
    function cappedLongitudinalTarget(omega) {
      const longitudinal = longitudinalTarget(omega);
      const magnitude = Math.hypot(fadedLateralForceMag, longitudinal);
      const scale = magnitude > frictionLimit && magnitude > 0 ? frictionLimit / magnitude : 1;
      return longitudinal * scale;
    }

    const previousOmega = state.wheelOmega[name];
    const torqueDrive = isFront ? 0 : driveForce * wheelRad * 0.5;
    const rotation = integrateWheelContact({
      omega: previousOmega,
      inertia: wheelInertia + (isFront ? 0 : reflectedEngineInertia),
      radius: wheelRad, dt,
      driveTorque: torqueDrive,
      brakeCapacity: computeWheelBrakeCapacity(name, wheelRad, params),
      previousForce: prev.lon, targetForce: cappedLongitudinalTarget,
      frictionLimit, relaxationTime: tireRelaxTau,
    });
    // Retain the existing 500 rad/s runaway guard; it is not the integration rule.
    state.wheelOmega[name] = clamp(rotation.omega, -500, 500);
    state.wheelBrakeTorque[name] = dt > 0 ? rotation.brakeImpulse / dt : 0;
    const slipRatio = slipAtOmega(state.wheelOmega[name]);
    const longitudinalForceMag = longitudinalTarget(state.wheelOmega[name]);
    const combinedMag    = Math.hypot(fadedLateralForceMag, longitudinalForceMag);
    let frictionScale    = 1.0;
    if (combinedMag > frictionLimit && combinedMag > 0) {
      frictionScale = frictionLimit / combinedMag;
    }

    const scaledLateral      = fadedLateralForceMag * frictionScale * lateralForceSign;
    const scaledLongitudinal = longitudinalForceMag  * frictionScale;

    // --- FRICTION CIRCLE UTILIZATION ---
    const utilization = frictionLimit > 0.01
      ? Math.hypot(scaledLateral, scaledLongitudinal) / frictionLimit
      : 0;
    state.wheelFrictionUtil[name] = clamp01(utilization);

    state.wheelSlipAngle[name] = slipAngle;
    state.wheelSlipRatio[name] = slipRatio;

    // --- TIRE FORCE RELAXATION ---
    const relaxedLat = prev.lat + (scaledLateral - prev.lat) * tireRelaxAlpha;
    const relaxedLon = dt > 0 ? rotation.contactImpulse / dt : prev.lon;
    prev.lat = relaxedLat;
    prev.lon = rotation.force;
    logger.trace('tires', () => `${name}: ωPrev=${previousOmega.toFixed(2)}, ωNew=${state.wheelOmega[name].toFixed(2)}, TBrake=${state.wheelBrakeTorque[name].toFixed(2)}`);

    // Per-wheel grip: lateral saturation
    const lateralSaturation = frictionLimit > 0
      ? Math.abs(scaledLateral) / frictionLimit
      : 0;
    const simplifiedGrip = clamp01(1.0 - lateralSaturation);
    state.wheelGrip[name] = simplifiedGrip;

    // --- HYSTERETIC GRIP STATE MACHINE (simplified: binary stable/slipping) ---
    const gws = state.wheelGripState[name];
    const SLIP_TRIGGER     = params.gripLossThreshold     !== undefined ? params.gripLossThreshold     : 0.90;
    const RECOVERY_TRIGGER = params.gripRecoveryThreshold !== undefined ? params.gripRecoveryThreshold : 0.80;

    if (gws.state === 'stable') {
      // Transition to slipping when utilization exceeds threshold
      if (state.wheelFrictionUtil[name] > SLIP_TRIGGER) {
        gws.state = 'slipping';
      }
    } else {  // slipping
      // Transition back to stable when utilization drops below recovery threshold
      if (state.wheelFrictionUtil[name] < RECOVERY_TRIGGER) {
        gws.state = 'stable';
      }
    }

    const emaAlpha = gws.state === 'stable'
      ? (params.gripEmaStable   !== undefined ? params.gripEmaStable   : 0.15)
      : (params.gripEmaSlipping !== undefined ? params.gripEmaSlipping : 0.35);
    gws.smoothedGrip = gws.smoothedGrip + (state.wheelFrictionUtil[name] - gws.smoothedGrip) * emaAlpha;

    // Store utilization for backward compatibility
    state.wheelGrip[name] = state.wheelFrictionUtil[name];

    // Phase C: Event Enrichment - Emit wheel grip state change events
    const newState = gws.state;
    const prevState = state.debug.transitionState.wheelGripStatePrev[name];
    if (prevState !== newState && eventBuffer) {
      eventBuffer.pushEvent({
        level: 'info',
        channel: 'wheels',
        type: `wheel_grip_${prevState}_to_${newState}`,
        msg: `${name} grip: ${prevState} → ${newState}`,
        data: {
          wheel: name,
          fromState: prevState,
          toState: newState,
          frictionUtil: state.wheelFrictionUtil[name],
          slipRatio: state.wheelSlipRatio[name],
          slipAngle: state.wheelSlipAngle[name],
        },
        dedupeKey: `grip:${name}:${newState}`,
      });
    }
    state.debug.transitionState.wheelGripStatePrev[name] = newState;

    // Store lateral force magnitude for SAT computation (front wheels only).
    perWheelLateralForce[name] = relaxedLat;

    // Resolve forces into world space.
    const wheelForceX = relaxedLon * wheelForwardX + relaxedLat * wheelRightX;
    const wheelForceY = relaxedLon * wheelForwardY + relaxedLat * wheelRightY;

    state.wheelForces[name].fx = wheelForceX;
    state.wheelForces[name].fy = wheelForceY;

    netForceX += wheelForceX;
    netForceY += wheelForceY;

    // Torque contribution: 2D cross product of arm and force vectors.
    netTorque += armX * wheelForceY - armY * wheelForceX;
  }

  // Rotor integration occurred with the tire reaction in the force loop above.
  for (const name of wheelNames) {
    const finalOmega = state.wheelOmega[name];

    // Phase C: Event Enrichment - Emit wheel overspin enter/exit events
    const OVERSPIN_THRESHOLD = 200; // rad/s
    const isOverspinning = Math.abs(finalOmega) > OVERSPIN_THRESHOLD;
    const wasOverspinning = state.debug.transitionState.wheelOverspin[name];

    if (isOverspinning && !wasOverspinning && eventBuffer) {
      eventBuffer.pushEvent({
        level: 'warn',
        channel: 'drivetrain',
        type: 'wheel_overspin_enter',
        msg: `${name} overspin: ${Math.abs(finalOmega).toFixed(1)} rad/s`,
        data: {
          wheel: name,
          omega: finalOmega,
          threshold: OVERSPIN_THRESHOLD,
          rpm: state.engine.rpm,
          currentGear: state.engine.currentGear,
        },
        dedupeKey: `overspin:${name}:enter`,
      });
    } else if (!isOverspinning && wasOverspinning && eventBuffer) {
      eventBuffer.pushEvent({
        level: 'info',
        channel: 'drivetrain',
        type: 'wheel_overspin_exit',
        msg: `${name} overspin recovered`,
        data: {
          wheel: name,
          finalOmega: finalOmega,
        },
        dedupeKey: `overspin:${name}:exit`,
      });
    }

    state.debug.transitionState.wheelOverspin[name] = isOverspinning;
  }

  // Aggregate wheel forces into axle forces for friction circle gauges.
  state.axleForces.front.fx = state.wheelForces.frontLeft.fx + state.wheelForces.frontRight.fx;
  state.axleForces.front.fy = state.wheelForces.frontLeft.fy + state.wheelForces.frontRight.fy;
  state.axleForces.front.N  = state.wheelLoads.frontLeft + state.wheelLoads.frontRight;

  state.axleForces.rear.fx  = state.wheelForces.rearLeft.fx  + state.wheelForces.rearRight.fx;
  state.axleForces.rear.fy  = state.wheelForces.rearLeft.fy  + state.wheelForces.rearRight.fy;
  state.axleForces.rear.N   = state.wheelLoads.rearLeft + state.wheelLoads.rearRight;

  // Track traction loss state for sound and skid marks.
  state.tractionState.prevSlipping  = state.tractionState.isSlipping;
  state.tractionState.isSlipping    = anyWheelSlipping;
  state.tractionState.lateralSpeed  = maxLateralWheelSpeed;

  // --- DRIFT INTENSITY — aggregated [0..1] score ---
  const lateralComponent = clamp01(maxLateralWheelSpeed / 12.0);
  const angularComponent = clamp01(Math.abs(body.angularVelocity) / 3.0);
  const bodyLongitudinal = body.velocityX * Math.sin(body.heading) + body.velocityY * -Math.cos(body.heading);
  const bodyLateral = body.velocityX * Math.cos(body.heading) + body.velocityY * Math.sin(body.heading);
  const slipAngle = Math.abs(Math.atan2(bodyLateral, Math.max(Math.abs(bodyLongitudinal), 0.25)));
  const slipAngleComponent = clamp01(slipAngle / (Math.PI / 4));
  const rawDrift = lateralComponent * 0.55 + angularComponent * 0.25 + slipAngleComponent * 0.20;
  const driftAlpha = rawDrift > state.driftIntensity ? 0.25 : 0.05;
  state.driftIntensity = state.driftIntensity + (rawDrift - state.driftIntensity) * driftAlpha;

  // --- Self-Aligning Torque (SAT) ---
  // Pneumatic trail tp(α) = t₀ × exp(-|α| / α₀)
  const t0     = state.params.pneumaticTrail;
  const alpha0 = Math.PI / 12;

  const frontLoad = (loads.frontLeft + loads.frontRight) * 0.5 || 1;
  const frontLateralFL = Math.abs(perWheelLateralForce.frontLeft  || 0);
  const frontLateralFR = Math.abs(perWheelLateralForce.frontRight || 0);
  const peakLateralForce = frontLoad * frictionCoeff;
  const slipFractionFL = peakLateralForce > 0 ? frontLateralFL / peakLateralForce : 0;
  const slipFractionFR = peakLateralForce > 0 ? frontLateralFR / peakLateralForce : 0;
  const peakSlipAngleRad2 = params.peakSlipAngleDeg * DEG_TO_RAD;
  const approxSlipFL = slipFractionFL * peakSlipAngleRad2 * 2.5;
  const approxSlipFR = slipFractionFR * peakSlipAngleRad2 * 2.5;

  // Use actual wheel slip angles (computed earlier in the loop) instead of approximation
  const trailFL = t0 * Math.exp(-Math.abs(state.wheelSlipAngle.frontLeft) / alpha0);
  const trailFR = t0 * Math.exp(-Math.abs(state.wheelSlipAngle.frontRight) / alpha0);

  const satFL  = (perWheelLateralForce.frontLeft  || 0) * trailFL;
  const satFR  = (perWheelLateralForce.frontRight || 0) * trailFR;
  const rawSAT = satFL + satFR;

  // EMA output filter on SAT — smooth out high-frequency noise.
  // The exponential trail (above) naturally limits peak SAT; no hard clamp needed.
  const satFilterAlpha = 1.0 - Math.exp(-dt / 0.08);  // 80ms time constant
  const prevSAT = state.steering.selfAligningTorque;
  state.steering.selfAligningTorque = prevSAT + (rawSAT - prevSAT) * satFilterAlpha;

  return { forceX: netForceX, forceY: netForceY, torque: netTorque };
}


// Computes rolling resistance and aerodynamic drag opposing the car's velocity.
//
// Returns: { forceX, forceY }
export function computeDragForces() {
  const body   = state.body;
  const params = state.params;

  const normalForce         = params.carMassKg * GRAVITY;
  const rollingResistance   = params.rollingResistanceCoeff * normalForce;
  const aeroDrag            = params.aeroDragCoeff * body.speed * body.speed;
  const totalDragMagnitude  = rollingResistance + aeroDrag;

  if (body.speed > 0.001) {
    const invSpeed = 1 / body.speed;
    return {
      forceX: -body.velocityX * invSpeed * totalDragMagnitude,
      forceY: -body.velocityY * invSpeed * totalDragMagnitude,
    };
  }
  return { forceX: 0, forceY: 0 };
}


// Returns a braking force opposing the car's velocity when the brake pedal is held.
//
// Returns: { forceX, forceY }
export function computeBrakeForce() {
  const body   = state.body;
  const input  = state.input;
  const params = state.params;

  if (!input.brakeKeyHeld || body.speed < 0.05) {
    return { forceX: 0, forceY: 0 };
  }

  const invSpeed = 1 / body.speed;

  return {
    forceX: -body.velocityX * invSpeed * params.brakeForce,
    forceY: -body.velocityY * invSpeed * params.brakeForce,
  };
}
