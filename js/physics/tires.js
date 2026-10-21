// =============================================================
// PHYSICS / TIRES
// Peak-based combined-slip tire model, per-wheel force computation, drag, brakes.
// =============================================================
//
// Tire v2: peak-normalized combined-slip contact, one dissipative force-
// magnitude relaxation state, and trail derived from that contact's severity.
// Suspension loads, wheel/body impulse exchange, and brake mechanics are retained.

import { physicsState as state } from '../state.js';
import { integrateTireContacts } from './tire-contact.js';
import { tireGripLimit } from './tire-load.js';
import { validateTireParameters, SLIP_REFERENCE_SPEED } from './tire-model.js';
import {
  GRAVITY,
  CAR_HALF_LENGTH, CAR_HALF_WIDTH,
  DEG_TO_RAD,
} from '../constants.js';

import { logger } from '../debug/logger.js';
import { eventBuffer } from '../debug/events.js';

// --------------- private helpers ---------------

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

// Nominal rim-force settings converted to rotor torque capacity. Road friction
// limits tire contact force, not the brake's ability to stop an airborne wheel.
function computeWheelBrakeCapacity(name, wheelRad, params) {
  let brakeForceMag = 0;
  const isRearWheel = name.startsWith('rear');

  // Service brakes act on all wheels: 80% front / 20% rear axle bias.
  if (state.input.brakeKeyHeld) {
    brakeForceMag = params.brakeForce * (isRearWheel ? 0.1 : 0.4);
  }

  // Handbrake pressure is stored as a ramped value. Continue applying it while
  // that value decays after key release, rather than gating it on the key.
  if (isRearWheel) {
    brakeForceMag += params.brakeForce * 0.5 * clamp01(state.input.handbrakeValue || 0);
  }

  return Math.max(0, brakeForceMag) * wheelRad;
}

// -----------------------------------------------


// Computes per-wheel tire forces and returns the net body force and net torque.
// The car is rear-wheel-drive: engine torque goes only to rear wheels.
// All four wheels contribute lateral forces (from slip angles).
//
// Returns: { forceX, forceY, torque }
export function computeTireForces(dt, { prescribedBody = false, externalAcceleration } = {}) {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('Tire timestep must be finite and positive');
  const body        = state.body;
  const engine      = state.engine;
  const loads       = state.wheelLoads;
  const params      = state.params;
  validateTireParameters(params);

  const heading         = body.heading;
  const angularVelocity = body.angularVelocity;
  const frictionCoeff   = params.tireFrictionCoeff;
  const gearRatio       = getGearRatio(engine.currentGear, params);

  // Apply clutch-transmitted crank torque through the current gear ratio.
  // Only the rear wheels are driven in this model.
  let driveForce = 0;
  if (gearRatio !== 0 && engine.clutchEngagement > 0 && !engine.isStalled) {
    const wheelTorque = (engine.transmittedTorqueNm || 0)
      * Math.abs(gearRatio) * params.finalDriveRatio;
    driveForce = wheelTorque / params.wheelRadius;

    // Reverse: flip the direction.
    if (gearRatio < 0) driveForce = -driveForce;
  }

  // Wheel positions (arm vectors from body centre to wheel).
  const wheelPositions = {
    frontLeft:  state.wheels.frontLeft,
    frontRight: state.wheels.frontRight,
    rearLeft:   state.wheels.rearLeft,
    rearRight:  state.wheels.rearRight,
  };

  const peakSlipAngleRad = params.peakSlipAngleDeg * DEG_TO_RAD;


  let netForceX = 0;
  let netForceY = 0;
  let netTorque = 0;

  // Tire-generated aligning moments, already using the common force transient.
  const perWheelAligningTorque = {};
  state.wheelContactDiagnostics ??= {};

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

  const contacts = wheelNames.map(name => {
    const w = wheelPositions[name], isFront = name.startsWith('front');
    const angle = heading + (isFront ? state.steering.frontWheelAngle : 0);
    return { name, armX: w.x - body.centerX, armY: w.y - body.centerY,
      forwardX: Math.sin(angle), forwardY: -Math.cos(angle), rightX: Math.cos(angle), rightY: Math.sin(angle),
      radius: params.wheelRadius, omega: state.wheelOmega[name],
      inertia: wheelInertia + (isFront ? 0 : reflectedEngineInertia),
      driveTorque: isFront ? 0 : driveForce * params.wheelRadius * .5,
      brakeCapacity: computeWheelBrakeCapacity(name, params.wheelRadius, params),
      previousForce: state.prevTireForce[name].lon, previousLateralForce: state.prevTireForce[name].lat,
      limit: tireGripLimit(loads[name], frictionCoeff, params.carMassKg * GRAVITY / 4, params.tireLoadSensitivity),
      peakAngle: peakSlipAngleRad, peakRatio: params.peakSlipRatio,
      pneumaticTrail: params.pneumaticTrail, slidingRatio: params.tireSlidingFrictionRatio, relaxationLength: params.tireRelaxationLength };
  });
  // Clip carried history to current support before either body or wheel solve.
  for (const c of contacts) {
    const magnitude = Math.hypot(c.previousForce, c.previousLateralForce);
    if (magnitude > c.limit && magnitude > 0) {
      c.previousForce *= c.limit / magnitude; c.previousLateralForce *= c.limit / magnitude;
    }
  }
  const solution = integrateTireContacts({ dt, contacts, prescribedBody, externalAcceleration,
    mass: params.carMassKg,
    inertia: params.carMassKg * (CAR_HALF_LENGTH ** 2 + CAR_HALF_WIDTH ** 2) / 3,
    velocity: [body.velocityX, body.velocityY, body.angularVelocity] });
  state.tireContactSolve = { substeps: solution.substeps, evaluations: solution.evaluations,
    maxBodyResidual: solution.maxBodyResidual, predictedVelocity: solution.velocity };

  for (const name of wheelNames) {
    const wheelPos    = wheelPositions[name];
    const normalLoad  = loads[name];
    const gripLimit = tireGripLimit(normalLoad, frictionCoeff,
      params.carMassKg * GRAVITY / 4, params.tireLoadSensitivity);
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

    const vLong = wheelLongitudinalSpeed, vLat = wheelLateralSpeed;
    // Retained diagnostic alias; no extra upstream velocity filter.
    state.smoothedWheelLat[name] = vLat;
    const wheelRad = params.wheelRadius;
    const frictionLimit = gripLimit;
    const tireRelaxTau = params.tireRelaxationLength /
      Math.max(Math.hypot(vLong, vLat), SLIP_REFERENCE_SPEED);
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
    const previousOmega = state.wheelOmega[name];
    const torqueDrive = isFront ? 0 : driveForce * wheelRad * 0.5;
    const rotation = solution.rotations[wheelNames.indexOf(name)];
    // Preserve the torque-balanced result. A universal speed clamp hides
    // drivetrain overspeed and silently discards angular momentum.
    state.wheelOmega[name] = rotation.omega;
    state.wheelBrakeTorque[name] = dt > 0 ? rotation.brakeImpulse / dt : 0;
    const target = rotation.target;
    const slipRatio = target.kappa;
    const slipAngle = target.alpha;
    state.wheelContactDiagnostics[name] = { ...rotation,
      impulseResidual: (wheelInertia + (isFront ? 0 : reflectedEngineInertia)) * (rotation.omega - previousOmega)
        - torqueDrive * dt - rotation.brakeImpulse + wheelRad * rotation.contactImpulse,
      relaxationTime: tireRelaxTau, bodyResidual: solution.maxBodyResidual, severity: target.severity, trail: params.pneumaticTrail * target.trailFraction };
    const scaledLateral = target.lat;
    const scaledLongitudinal = target.lon;

    // --- FRICTION CIRCLE UTILIZATION ---
    const utilization = frictionLimit > 0.01
      ? Math.hypot(scaledLateral, scaledLongitudinal) / frictionLimit
      : 0;
    state.wheelFrictionUtil[name] = clamp01(utilization);

    state.wheelSlipAngle[name] = slipAngle;
    state.wheelSlipRatio[name] = slipRatio;

    // --- TIRE FORCE RELAXATION ---
    // Average both components over the same contact substeps. Mixing a lateral
    // endpoint with a longitudinal average can exceed the friction circle.
    const relaxedLat = dt > 0 ? rotation.lateralImpulse / dt : prev.lat;
    const relaxedLon = dt > 0 ? rotation.contactImpulse / dt : prev.lon;
    prev.lat = rotation.lateralForce;
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

    // Pneumatic trail is lost as the adhering contact region saturates.
    perWheelAligningTorque[name] = rotation.aligningImpulse / dt;

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

  // Tire deformation is already represented by the force-magnitude state.
  // No independent 80ms SAT filter: unloaded contacts cannot carry stale SAT.
  state.steering.selfAligningTorque = (perWheelAligningTorque.frontLeft || 0)
    + (perWheelAligningTorque.frontRight || 0);

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
