// =============================================================
// PHYSICS — Verlet integration, four-point rigid body, tire model,
//           weight transfer, engine/clutch/transmission, camera
// =============================================================
//
// ARCHITECTURE:
//   The car body is four Verlet particles (wheel positions).
//   A rigid-body constraint solver keeps them at fixed distances.
//   Forces are computed per-wheel using a simplified Pacejka tire model,
//   then summed into a net linear force and net torque.
//   The net force drives linear acceleration; net torque drives rotation.
//   Both are applied to all four particles via the Verlet integrator.
//
// CALL ORDER (enforced by main.js each sub-step):
//   1. updateSteering(dt)
//   2. updateEngine(dt)
//   3. computeBodyDerivedState(dt)
//   4. computeWeightTransfer()
//   5. computeTireForces()       → returns { forceX, forceY, torque }
//   6. computeDragForces()       → returns { forceX, forceY }
//   7. computeBrakeForce()       → returns { forceX, forceY }
//   8. combine forces into net acceleration and angular acceleration
//   9. verletIntegrateAllPoints(dt, netAccelX, netAccelY, netAngularAccel)
//  10. solveRigidBodyConstraints()
//  11. handleBoundaryCollisions()
//  12. solveRigidBodyConstraints()   (again, to restore shape after collision)
//  13. computeBodyDerivedState(dt)   (recompute for camera and render)
//  14. updateCamera(dt)
// =============================================================

import state from './state.js';
import { updateEngineSound as soundUpdate, triggerGearChange as soundGearChange } from './sound.js';
import {
  CAR_HALF_WIDTH,
  CAR_HALF_LENGTH,
  CONSTRAINT_AXLE_WIDTH,
  CONSTRAINT_SIDE_LENGTH,
  CONSTRAINT_DIAGONAL,
  GRAVITY,
  MAX_DISPLACEMENT_PER_STEP,
  TORQUE_PEAK_RPM,
  GEAR_RATIOS,
  CLUTCH_BITE_POINT,
  CLUTCH_BITE_RANGE,
  CLUTCH_BITE_CURVE,
  CLUTCH_ENGAGE_TIME,
  TIRE_PEAK_SLIP_RATIO,
  CAMERA_MIN_ZOOM,
  CAMERA_MAX_ZOOM,
  CAMERA_ZOOM_SPEED_THRESHOLD_KPH,
  KPH_TO_MPS,
  PNEUMATIC_TRAIL,
  STEERING_COLUMN_INERTIA,
  STEERING_VISCOUS_DAMPING,
  STEERING_COULOMB_FRICTION,
  TAU,
  DEG_TO_RAD,
} from './constants.js';

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


// =============================================================
// MATH HELPERS
// =============================================================

// Clamps a value between a minimum and maximum, inclusive.
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Clamps to the [0, 1] range. Used for normalised quantities.
function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Wraps an angle in radians to the range (-π, π].
// Used to find the shortest angular distance between two headings.
function wrapAngle(angle) {
  while (angle >  Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

// Dot product of two 2D vectors.
function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}


// =============================================================
// INITIALISATION
// =============================================================

// Places the four wheel particles in a rectangle centred at
// (worldCenterX, worldCenterY) with the car facing up (heading = 0).
// Must be called once before the game loop starts.
// Previous positions are set equal to current so initial velocity = 0.
export function initializeCarBody(worldCenterX, worldCenterY) {
  const wheels = state.wheels;

  // The car faces "up" initially. In canvas coordinates +Y is down,
  // so "front" of the car is at smaller Y (towards the top of the screen).
  wheels.frontLeft.x  = worldCenterX - CAR_HALF_WIDTH;
  wheels.frontLeft.y  = worldCenterY - CAR_HALF_LENGTH;

  wheels.frontRight.x = worldCenterX + CAR_HALF_WIDTH;
  wheels.frontRight.y = worldCenterY - CAR_HALF_LENGTH;

  wheels.rearLeft.x   = worldCenterX - CAR_HALF_WIDTH;
  wheels.rearLeft.y   = worldCenterY + CAR_HALF_LENGTH;

  wheels.rearRight.x  = worldCenterX + CAR_HALF_WIDTH;
  wheels.rearRight.y  = worldCenterY + CAR_HALF_LENGTH;

  // Set previous = current so Verlet starts at rest.
  for (const wheel of Object.values(wheels)) {
    wheel.prevX = wheel.x;
    wheel.prevY = wheel.y;
  }

  // Place camera at the body centre.
  state.camera.x     = worldCenterX;
  state.camera.y     = worldCenterY;
  state.camera.prevX = worldCenterX;
  state.camera.prevY = worldCenterY;
}


// =============================================================
// DERIVED BODY STATE
// =============================================================

// Computes all quantities that depend on wheel positions:
// centre, heading, velocity, angular velocity, and accelerations.
// Must be called at the TOP of each physics sub-step before anything
// else reads from state.body. Also called again at the END of the step
// so camera and render get up-to-date values.
export function computeBodyDerivedState(dt) {
  const wheels = state.wheels;
  const body   = state.body;

  // Save last frame's velocity so we can derive acceleration this frame.
  body.prevVelocityX = body.velocityX;
  body.prevVelocityY = body.velocityY;
  body.prevHeading   = body.heading;

  // Front-axle midpoint and rear-axle midpoint.
  const frontMidX = (wheels.frontLeft.x + wheels.frontRight.x) * 0.5;
  const frontMidY = (wheels.frontLeft.y + wheels.frontRight.y) * 0.5;
  const rearMidX  = (wheels.rearLeft.x  + wheels.rearRight.x)  * 0.5;
  const rearMidY  = (wheels.rearLeft.y  + wheels.rearRight.y)  * 0.5;

  // Centre of mass = midpoint between front and rear axle midpoints.
  body.centerX = (frontMidX + rearMidX) * 0.5;
  body.centerY = (frontMidY + rearMidY) * 0.5;

  // Heading: angle of the vector from rear midpoint to front midpoint.
  // atan2 returns the angle of a vector in standard maths convention.
  // We add PI/2 to rotate so heading 0 means facing up (−Y in canvas).
  body.heading = Math.atan2(frontMidY - rearMidY, frontMidX - rearMidX) + Math.PI * 0.5;

  // Derive linear velocity from centre-of-mass Verlet displacement.
  // Average the four wheel velocities to get the body's CoM velocity.
  let avgVelX = 0, avgVelY = 0;
  for (const wheel of Object.values(wheels)) {
    avgVelX += (wheel.x - wheel.prevX);
    avgVelY += (wheel.y - wheel.prevY);
  }
  // Divide by count (4) and by dt to get px/s.
  const inverseFourDt = 1 / (4 * dt);
  body.velocityX = avgVelX * inverseFourDt;
  body.velocityY = avgVelY * inverseFourDt;
  body.speed     = Math.hypot(body.velocityX, body.velocityY);

  // Angular velocity from heading change. wrapAngle handles wraparound.
  body.angularVelocity = wrapAngle(body.heading - body.prevHeading) / dt;

  // Accelerations: change in velocity per second.
  // These are used by computeWeightTransfer() to shift tyre loads.
  const invDt = 1 / dt;
  const accelX = (body.velocityX - body.prevVelocityX) * invDt;
  const accelY = (body.velocityY - body.prevVelocityY) * invDt;

  // --- Jerk (3rd derivative): rate of change of acceleration ---
  // Store previous acceleration before overwriting.
  body.prevAccelX = body.accelX;
  body.prevAccelY = body.accelY;
  body.accelX = accelX;
  body.accelY = accelY;

  // Jerk = (currentAccel - previousAccel) / dt
  body.jerkX = (accelX - body.prevAccelX) * invDt;
  body.jerkY = (accelY - body.prevAccelY) * invDt;
  body.jerkMagnitude = Math.hypot(body.jerkX, body.jerkY);

  // --- Filtered derivatives for rendering (EMA) ---
  // Raw accel/jerk from Verlet differentiation contains constraint impulse noise.
  // Smooth with exponential moving average so HUD arrows don't glitch.
  const filterAlpha = 1.0 - Math.exp(-dt / 0.08); // 80ms time constant
  const fb = state.filteredBody;
  fb.accelX += (accelX - fb.accelX) * filterAlpha;
  fb.accelY += (accelY - fb.accelY) * filterAlpha;
  const jerkFilterAlpha = 1.0 - Math.exp(-dt / 0.12); // 120ms for jerk (noisier)
  fb.jerkX += (body.jerkX - fb.jerkX) * jerkFilterAlpha;
  fb.jerkY += (body.jerkY - fb.jerkY) * jerkFilterAlpha;
  fb.jerkMagnitude = Math.hypot(fb.jerkX, fb.jerkY);

  // Project world-space acceleration onto car-forward and car-right axes.
  const forwardX = Math.sin(body.heading);  // car forward vector
  const forwardY = -Math.cos(body.heading);
  const rightX   = Math.cos(body.heading);  // car right vector (perpendicular)
  const rightY   = Math.sin(body.heading);

  body.longitudinalAccel = dot(accelX, accelY, forwardX, forwardY);
  body.lateralAccel      = dot(accelX, accelY, rightX,   rightY);
}


// =============================================================
// WEIGHT TRANSFER
// =============================================================

// Computes the normal load (Newtons, pixel-scaled) on each of the four tyres
// based on the car's static weight distribution plus dynamic transfer from
// longitudinal (fore-aft) and lateral (left-right) acceleration.
//
// These loads scale the peak grip force in the Pacejka tire model.
// More load on a tyre → more grip, but with diminishing returns
// (Pacejka's D parameter scales linearly, so doubling load doubles peak force).
//
// Weight transfer requires CoG height: a higher CoG transfers more load
// for the same acceleration. That's why SUVs feel more tippy than sports cars.
export function computeWeightTransfer() {
  const body      = state.body;
  const loads     = state.wheelLoads;
  const params    = state.params;

  const massKg       = params.carMassKg;
  const gravity      = GRAVITY;
  const cogHeight    = params.cogHeight;
  const wheelbase    = CAR_HALF_LENGTH * 2;  // FL↔RL distance
  const trackWidth   = CAR_HALF_WIDTH  * 2;  // FL↔FR distance

  // Total weight equally split front/rear (assumed 50/50 CoG position).
  const totalWeight    = massKg * gravity;
  const halfWeight     = totalWeight * 0.5;

  // Longitudinal transfer: braking shifts load forward; acceleration shifts it rearward.
  // Transfer = mass × longitudinal_accel × CoG_height / wheelbase
  // Clamp to ±2 g to prevent constraint-solver transients from causing runaway
  // weight transfer that would amplify tire forces on the next step.
  const clampedLongAccel = clamp(body.longitudinalAccel, -2 * GRAVITY, 2 * GRAVITY);
  const longitudinalTransfer = massKg * clampedLongAccel * cogHeight / wheelbase;

  // Lateral transfer: cornering shifts load to the outside wheels.
  // Transfer = mass × lateral_accel × CoG_height / trackWidth
  const clampedLatAccel = clamp(body.lateralAccel, -2 * GRAVITY, 2 * GRAVITY);
  const lateralTransfer = massKg * clampedLatAccel * cogHeight / trackWidth;

  // Each axle gets half the total weight, then longitudinal transfer shifts
  // weight between front and rear axles. Within each axle, lateral transfer
  // shifts weight between left and right.
  //
  // Sign convention:
  //   longitudinalAccel > 0 (accelerating forward) → weight shifts rearward
  //   lateralAccel > 0 (rightward cornering force) → weight shifts to right wheels
  const frontAxleLoad = halfWeight - longitudinalTransfer;
  const rearAxleLoad  = halfWeight + longitudinalTransfer;

  loads.frontLeft  = Math.max(0, frontAxleLoad * 0.5 - lateralTransfer);
  loads.frontRight = Math.max(0, frontAxleLoad * 0.5 + lateralTransfer);
  loads.rearLeft   = Math.max(0, rearAxleLoad  * 0.5 - lateralTransfer);
  loads.rearRight  = Math.max(0, rearAxleLoad  * 0.5 + lateralTransfer);
}


// =============================================================
// ENGINE TORQUE CURVE
// =============================================================

// Returns normalised torque [0, 1] at a given RPM using a parabolic curve.
// Peak (1.0) occurs at TORQUE_PEAK_RPM.
// The falloff is intentionally gentle — the engine is still producing ~30%
// torque at idle and ~45% at redline, which keeps the car driveable in all gears.
// A sharper curve would reward staying near the torque peak more aggressively.
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
    const riseRate = throttleAmount > 0.01 ? 6.0 : 3.0;
    engine.rpm += (freeRevTarget - engine.rpm) * riseRate * dt;
    engine.rpm  = clamp(engine.rpm, idleRpm, redlineRpm);

  } else if (engine.clutchEngagement > 0.99) {
    // CASE B: Clutch fully engaged → rigid mechanical coupling.
    const vehicleSpeed       = body.speed;
    const wheelRpm           = (vehicleSpeed * 60) / (TAU * wheelRad);
    const engineRpmFromWheel = wheelRpm * Math.abs(gearRatio) * finalDrive;

    const idleHoldRpm = idleRpm * params.stallResistance;
    engine.rpm = Math.max(engineRpmFromWheel, idleHoldRpm);

    if (engine.rpm > redlineRpm) {
      engine.rpm = redlineRpm;
    }

    const effectiveStallRpm = stallRpm * (1.0 - params.stallResistance * 0.8);
    if (engineRpmFromWheel < effectiveStallRpm && vehicleSpeed < 0.5 && throttleAmount < 0.05) {
      engine.isStalled = true;
      engine.rpm = 0;
      return;
    }

  } else {
    // CASE C: Clutch in slip/bite zone → blend free-rev with wheel demand.
    const vehicleSpeed     = body.speed;
    const wheelRpm         = (vehicleSpeed * 60) / (TAU * wheelRad);
    const wheelDemandedRpm = wheelRpm * Math.abs(gearRatio) * finalDrive;

    const freeRevTarget = idleRpm + throttleAmount * (redlineRpm - idleRpm);
    const riseRate      = throttleAmount > 0.01 ? 6.0 : 3.0;
    const freeRpm       = engine.rpm + (freeRevTarget - engine.rpm) * riseRate * dt;

    engine.rpm = freeRpm * (1 - engine.clutchEngagement) +
                 wheelDemandedRpm * engine.clutchEngagement;

    engine.rpm = clamp(engine.rpm, 0, redlineRpm);

    const stallThreshold = stallRpm * (1.0 - params.stallResistance * 0.6);
    if (engine.rpm < stallThreshold &&
        engine.clutchEngagement > 0.4 &&
        vehicleSpeed < 0.5) {
      engine.isStalled = true;
      engine.rpm = 0;
    }
  }
}


// =============================================================
// TIRE FORCES
// =============================================================

// Computes the lateral and longitudinal force for a single wheel
// using the simplified Pacejka "Magic Formula" (E=0 variant).
//
// The formula is: F = normalLoad × frictionCoeff × sin(C × atan(B × normalisedSlip))
//
// normalised_slip maps the actual slip value so that 1.0 corresponds to
// the peak grip point (TIRE_PEAK_SLIP_ANGLE_DEG or TIRE_PEAK_SLIP_RATIO).
// Beyond the peak, grip falls off — this is what makes drifting possible.
// The peak prevents infinite lateral force, which is what would happen with
// a linear friction model.
function pacejkaForce(normalLoad, frictionCoeff, slipValue, peakSlipValue, B, C) {
  if (peakSlipValue < 0.0001) return 0;
  const normalisedSlip = slipValue / peakSlipValue;
  // Normalise so that at normalisedSlip = 1.0 (peak grip), the output equals
  // exactly normalLoad × frictionCoeff.  Without this, sin(C × atan(B)) < 1
  // means the tyre produces far less grip than the friction coefficient implies.
  // peakNorm = sin(C × atan(B)) evaluated at normalisedSlip = 1.0.
  const peakNorm = Math.sin(C * Math.atan(B));
  if (peakNorm < 0.0001) return 0;
  return (normalLoad * frictionCoeff / peakNorm) *
         Math.sin(C * Math.atan(B * normalisedSlip));
}


// Computes per-wheel tire forces and returns the net body force and net torque.
// The car is rear-wheel-drive: engine torque goes only to rear wheels.
// All four wheels contribute lateral forces (from slip angles).
//
// Returns: { forceX, forceY, torque }
//   forceX, forceY: net force in world space (px/s² when divided by mass)
//   torque: net moment around the body centre of mass (for angular acceleration)
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
  const speedMagnitude    = Math.max(0.05, body.speed); // avoid division by zero (m/s)

  // Compute available drive force from engine torque.
  // Only transmitted to rear wheels (rear-wheel-drive assumption).
  let driveForce = 0;
  if (gearRatio !== 0 && engine.clutchEngagement > 0 && !engine.isStalled) {
    const torqueNormalized = torqueCurveNormalized(engine.rpm, params.idleRpm, params.redlineRpm);
    let throttleAmount = 0;
    if (state.input.mouseThrottleActive) {
      throttleAmount = state.input.mouseThrottleAmount;
    } else if (state.input.throttleKeyHeld) {
      throttleAmount = 1.0;
    }

    const engineTorque = params.peakEngineTorqueNm * torqueNormalized * throttleAmount;
    const wheelTorque  = engineTorque * Math.abs(gearRatio) * params.finalDriveRatio
                         * engine.clutchEngagement;
    driveForce = wheelTorque / params.wheelRadius;

    // Reverse: flip the direction.
    if (gearRatio < 0) driveForce = -driveForce;

    // Idle creep: small force at idle in a low gear even without throttle.
    // 3 m/s ≈ 10 km/h — only creep at very low speed
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

  const peakSlipAngleRad = params.peakSlipAngleDeg * DEG_TO_RAD;

  let netForceX = 0;
  let netForceY = 0;
  let netTorque = 0;

  // Per-wheel lateral force magnitudes — stored for SAT computation after the loop.
  const perWheelLateralForce = {};

  // Process all four wheels.
  const wheelNames = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];

  for (const name of wheelNames) {
    const wheelPos    = wheelPositions[name];
    const normalLoad  = loads[name];
    const isFront     = name === 'frontLeft' || name === 'frontRight';
    const isRear      = !isFront;

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

    // Project wheel velocity onto its own axes.
    const wheelLongitudinalSpeed = dot(wheelVelX, wheelVelY, wheelForwardX, wheelForwardY);
    const wheelLateralSpeed      = dot(wheelVelX, wheelVelY, wheelRightX,   wheelRightY);

    // Slip angle: angle between where the wheel is pointed and where it is going.
    // === PHASE 3b: SLIP SUPPRESSION FIX ===
    // OLD APPROACH: Suppressed slip angles below 0.1 m/s speed threshold, preventing
    // low-speed lateral forces that would help car settle from residual spin.
    // NEW APPROACH: Denominator clamping (production SDK pattern). Always compute slip
    // angle, but clamp the longitudinal speed denominator to avoid singularities and
    // ensure meaningful slip model across all speeds.
    const vLong = wheelLongitudinalSpeed;
    const vLat = wheelLateralSpeed;
    const minSlipDenom = 0.5;  // m/s — ensures slip angle defined even at standstill
    const slipDenom = Math.max(Math.abs(vLong), minSlipDenom);
    const slipAngle = Math.atan2(vLat, slipDenom);

    // Lateral force (perpendicular to wheel heading): Pacejka.
    // Opposes the lateral velocity — this is what steers the car.
    const lateralForceMag = pacejkaForce(normalLoad, frictionCoeff,
                                          Math.abs(slipAngle), peakSlipAngleRad,
                                          params.pacejkaB, params.pacejkaC);
    // Sign: opposes lateral drift direction.
    const lateralForceSign = wheelLateralSpeed > 0 ? -1 : 1;

    // Longitudinal force (along wheel heading): computed via slip ratio model.
    // The slip ratio measures how much the driven wheel is spinning relative to
    // the ground. At zero slip the wheel rolls freely; at high slip it's spinning
    // (burnout) or locked (braking). The Pacejka model converts slip ratio into
    // a force that peaks at TIRE_PEAK_SLIP_RATIO then falls off — this falloff
    // is what enables throttle-initiated oversteer (power slides).
    //
    // slipRatio = (driveSpeed - groundSpeed) / max(|groundSpeed|, epsilon)
    //   driveSpeed = angular velocity that the engine demands × wheel radius
    //   groundSpeed = actual longitudinal wheel velocity from Verlet state
    //
    // For non-driven (front) wheels, slip ratio = 0 → no longitudinal force.
    let longitudinalForceMag = 0;
    let slipRatio = 0;

    if (isRear && Math.abs(driveForce) > 0.01) {
      const tractionLimit = normalLoad * frictionCoeff;
      if (tractionLimit > 0.01) {
        const perWheelDrive = driveForce * 0.5;
        const driveRatio = perWheelDrive / tractionLimit;
        slipRatio = driveRatio * params.peakSlipRatio;
        longitudinalForceMag = pacejkaForce(normalLoad, frictionCoeff,
                                             Math.abs(slipRatio), params.peakSlipRatio,
                                             params.pacejkaB, params.pacejkaC);
        if (driveForce < 0) longitudinalForceMag = -longitudinalForceMag;
      }
    }

    // --- PER-WHEEL BRAKING inside the traction circle ---
    // S key = FRONT AXLE ONLY (like a real front-biased brake system).
    // Competing with lateral grip through the friction ellipse: locked front
    // wheels lose steering authority (understeer under braking).
    if (!isRear && state.input.brakeKeyHeld && body.speed > 0.05) {
      const perWheelBrake   = params.brakeForce * 0.4;   // front gets 80% total (0.4 per wheel × 2)
      const frictionBudget  = normalLoad * frictionCoeff;
      const brakeSlipInput  = Math.min(perWheelBrake / Math.max(frictionBudget, 1.0), 2.0);
      const brakeLongForce  = pacejkaForce(normalLoad, frictionCoeff,
                                            brakeSlipInput * params.peakSlipRatio,
                                            params.peakSlipRatio,
                                            params.pacejkaB, params.pacejkaC);
      const brakeSign = wheelLongitudinalSpeed >= 0 ? -1 : 1;
      longitudinalForceMag += brakeLongForce * brakeSign;
    }

    // F key = HANDBRAKE — rear axle only, progressive.
    // Ramps up to full lock while held. Rear slip competes with lateral grip
    // → rears lose traction → oversteer / drift initiation.
    if (isRear && state.input.handbrakeKeyHeld && body.speed > 0.05) {
      // Progressive: handbrakeValue ramps 0→1 over ~0.3s while held
      const hbVal          = state.input.handbrakeValue || 0;
      const perWheelHB     = params.brakeForce * 0.5 * hbVal;  // full rear lock at hbVal=1
      const frictionBudget = normalLoad * frictionCoeff;
      const hbSlipInput    = Math.min(perWheelHB / Math.max(frictionBudget, 1.0), 3.0);
      const hbLongForce    = pacejkaForce(normalLoad, frictionCoeff,
                                           hbSlipInput * params.peakSlipRatio,
                                           params.peakSlipRatio,
                                           params.pacejkaB, params.pacejkaC);
      const brakeSign = wheelLongitudinalSpeed >= 0 ? -1 : 1;
      longitudinalForceMag += hbLongForce * brakeSign;
    }

    // Friction ellipse: combined lateral and longitudinal force cannot exceed
    // the tyre's grip circle (normalLoad × frictionCoeff).
    // If we exceed it, scale both forces down proportionally.
    const frictionLimit  = normalLoad * frictionCoeff;
    const combinedMag    = Math.hypot(lateralForceMag, longitudinalForceMag);
    let frictionScale    = 1.0;
    if (combinedMag > frictionLimit && combinedMag > 0) {
      frictionScale = frictionLimit / combinedMag;
    }

    const scaledLateral      = lateralForceMag      * frictionScale * lateralForceSign;
    const scaledLongitudinal = longitudinalForceMag * frictionScale;

    // --- TIRE FORCE RELAXATION ---
    // Correct model: tires build force over a fixed DISTANCE (relaxation length λ),
    // not a fixed time. λ = v × τ, so τ = λ / v.
    // A constant τ = 0.06s at 30 m/s means λ = 1.8m — absurd (should be ~0.3m).
    // Fix: τ(v) = λ / max(|v_long|, ε)
    // This makes force build over the correct physical distance regardless of speed.
    const relaxationLength = params.tireRelaxationLength !== undefined
      ? params.tireRelaxationLength : 0.3; // metres — typical road tire value
    const vLongAbs = Math.max(Math.abs(wheelLongitudinalSpeed), 0.5); // ε = 0.5 m/s
    const tireRelaxTau = relaxationLength / vLongAbs; // speed-dependent time constant
    const tireRelaxAlpha = 1.0 - Math.exp(-dt / tireRelaxTau);
    const prev = state.prevTireForce[name];
    const relaxedLat = prev.lat + (scaledLateral - prev.lat) * tireRelaxAlpha;
    const relaxedLon = prev.lon + (scaledLongitudinal - prev.lon) * tireRelaxAlpha;
    prev.lat = relaxedLat;
    prev.lon = relaxedLon;

    // Per-wheel grip: how much of the LATERAL friction budget is still free.
    // A car sitting still with idle torque should show near-full lateral grip.
    // We use lateral force saturation (not combined), so engine torque alone
    // doesn't falsely show "no grip" when the car isn't sliding sideways.
    const lateralSaturation = frictionLimit > 0
      ? Math.abs(scaledLateral) / frictionLimit
      : 0;
    const simplifiedGrip = clamp01(1.0 - lateralSaturation);
    state.wheelGrip[name] = simplifiedGrip;

    // For the grip state machine, use combined saturation (more accurate slip detection)
    const gripRatio = frictionLimit > 0
      ? clamp01(1.0 - combinedMag / frictionLimit)
      : 0;

    // --- HYSTERETIC GRIP STATE MACHINE ---
    // Prevents frame-to-frame oscillation between stable/slipping states.
    const gws = state.wheelGripState[name];
    const GRIP_LOSS_THRESHOLD     = params.gripLossThreshold     !== undefined ? params.gripLossThreshold     : 0.70;
    const GRIP_RECOVERY_THRESHOLD = params.gripRecoveryThreshold !== undefined ? params.gripRecoveryThreshold : 0.85;

    if (gws.state === 'stable') {
      if (gripRatio < GRIP_LOSS_THRESHOLD) {
        gws.state = 'slipping';
      }
    } else if (gws.state === 'slipping') {
      if (gripRatio > GRIP_RECOVERY_THRESHOLD) {
        gws.state = 'recovering';
      }
    } else {
      if (gripRatio > 0.95) {
        gws.state = 'stable';
      } else if (gripRatio < GRIP_LOSS_THRESHOLD) {
        gws.state = 'slipping';
      }
    }
    const emaAlpha = gws.state === 'stable'
      ? (params.gripEmaStable   !== undefined ? params.gripEmaStable   : 0.15)
      : (params.gripEmaSlipping !== undefined ? params.gripEmaSlipping : 0.35);
    gws.smoothedGrip = gws.smoothedGrip + (gripRatio - gws.smoothedGrip) * emaAlpha;

    // Store lateral force magnitude for SAT computation (front wheels only).
    // Use the RELAXED force so SAT doesn't glitch from constraint noise.
    perWheelLateralForce[name] = relaxedLat;

    // Resolve forces into world space using the wheel's heading.
    const wheelForceX = relaxedLon * wheelForwardX + relaxedLat * wheelRightX;
    const wheelForceY = relaxedLon * wheelForwardY + relaxedLat * wheelRightY;

    netForceX += wheelForceX;
    netForceY += wheelForceY;

    // Torque contribution: 2D cross product of arm and force vectors.
    // τ = armX × forceY - armY × forceX (Z component only).
    netTorque += armX * wheelForceY - armY * wheelForceX;

    // (Diagnostic logging removed — was firing every wheel every step, ~240 logs/sec)
  }

  // Track traction loss state for sound and skid marks.
  // A wheel is slipping if its lateral speed exceeds the traction threshold.
  // We store the maximum lateral wheel speed for sound intensity scaling.
  // Also store per-wheel lateral speed for independent skid marks and sparks.
  let maxLateralWheelSpeed = 0;
  let anyWheelSlipping     = false;

  for (const name of wheelNames) {
    const wheelPos  = wheelPositions[name];
    const isFront   = name === 'frontLeft' || name === 'frontRight';
    const steerAngle = isFront ? state.steering.frontWheelAngle : 0;

    const wheelForwardX  = Math.sin(body.heading + steerAngle);
    const wheelForwardY  = -Math.cos(body.heading + steerAngle);
    const wheelRightX    =  Math.cos(body.heading + steerAngle);
    const wheelRightY    =  Math.sin(body.heading + steerAngle);

    const armX = wheelPos.x - body.centerX;
    const armY = wheelPos.y - body.centerY;
    const wheelVelX = body.velocityX + (-body.angularVelocity * armY);
    const wheelVelY = body.velocityY + ( body.angularVelocity * armX);
    const lateralSpeed = Math.abs(
      wheelVelX * wheelRightX + wheelVelY * wheelRightY
    );

    // Store per-wheel lateral speed for per-wheel skid marks and spark generation.
    state.wheelLateralSpeed[name] = lateralSpeed;

    if (lateralSpeed > maxLateralWheelSpeed) maxLateralWheelSpeed = lateralSpeed;
    if (lateralSpeed > 1.8) anyWheelSlipping = true;
  }

  state.tractionState.prevSlipping  = state.tractionState.isSlipping;
  state.tractionState.isSlipping    = anyWheelSlipping;
  state.tractionState.lateralSpeed  = maxLateralWheelSpeed;

  // --- DRIFT INTENSITY — aggregated [0..1] score ---
  // Combines: max lateral wheel speed, angular velocity, slip angles.
  // Used to drive tire sound, paint transfer, motion blur.
  const lateralComponent = clamp01(maxLateralWheelSpeed / 12.0);   // saturates at 12 m/s
  const angularComponent = clamp01(Math.abs(body.angularVelocity) / 3.0); // saturates at 3 rad/s
  const slipAngle = Math.abs(Math.atan2(
    body.velocityX * Math.cos(body.heading) - body.velocityY * Math.sin(body.heading),
    body.velocityX * Math.sin(body.heading) + body.velocityY * Math.cos(body.heading)
  ));
  const slipAngleComponent = clamp01(slipAngle / (Math.PI / 4)); // saturates at 45°
  const rawDrift = lateralComponent * 0.55 + angularComponent * 0.25 + slipAngleComponent * 0.20;
  // EMA smoothing: fast attack, slow release for cinematic feel
  const driftAlpha = rawDrift > state.driftIntensity ? 0.25 : 0.05;
  state.driftIntensity = state.driftIntensity + (rawDrift - state.driftIntensity) * driftAlpha;

  // --- Self-Aligning Torque (SAT) for steering feedback ---
  // Pneumatic trail tp(α) = t₀ × exp(-|α| / α₀)
  // At small slip angles, trail is full → strong centering feel.
  // At high slip angles (drift), trail collapses → steering no longer fights the skid.
  // This is the critical fix: constant trail kept SAT strong through deep slides,
  // making the wheel fight countersteer instead of wanting to self-steer into it.
  const t0   = state.params.pneumaticTrail;              // base trail (m), slider-controlled
  const alpha0 = Math.PI / 12;  // ~15° — slip angle at which trail halves

  // Use per-wheel slip angles for trail calculation
  // We need the front wheel slip angles — compute from stored lateral forces and loads
  const frontLoad = (loads.frontLeft + loads.frontRight) * 0.5 || 1;
  const frontLateralFL = Math.abs(perWheelLateralForce.frontLeft  || 0);
  const frontLateralFR = Math.abs(perWheelLateralForce.frontRight || 0);
  // Approximate front slip angle from lateral force magnitude and Pacejka peak
  const peakLateralForce = frontLoad * frictionCoeff;
  const slipFractionFL = peakLateralForce > 0 ? frontLateralFL / peakLateralForce : 0;
  const slipFractionFR = peakLateralForce > 0 ? frontLateralFR / peakLateralForce : 0;
  // Map fraction [0,1] to approximate slip angle using Pacejka peak angle
  const peakSlipAngleRad2 = params.peakSlipAngleDeg * DEG_TO_RAD;
  const approxSlipFL = slipFractionFL * peakSlipAngleRad2 * 2.5; // extrapolate beyond peak
  const approxSlipFR = slipFractionFR * peakSlipAngleRad2 * 2.5;

  // Slip-dependent trail per wheel
  const trailFL = t0 * Math.exp(-approxSlipFL / alpha0);
  const trailFR = t0 * Math.exp(-approxSlipFR / alpha0);

  const satFL = (perWheelLateralForce.frontLeft  || 0) * trailFL;
  const satFR = (perWheelLateralForce.frontRight || 0) * trailFR;
  const rawSAT = satFL + satFR;

  // Clamp SAT to prevent extreme values from constraint transients.
  // ±50 N·m is the realistic range for a road car steering column.
  const clampedSAT = clamp(rawSAT, -50, 50);

  // EMA filter on SAT: smooth out high-frequency noise while preserving
  // the direction and magnitude of genuine tire feedback.
  const satFilterAlpha = 1.0 - Math.exp(-dt / 0.05); // 50ms time constant
  const prevSAT = state.steering.selfAligningTorque;
  state.steering.selfAligningTorque = prevSAT + (clampedSAT - prevSAT) * satFilterAlpha;

  return { forceX: netForceX, forceY: netForceY, torque: netTorque };
}


// =============================================================
// DRAG FORCES
// =============================================================

// Computes rolling resistance and aerodynamic drag opposing the car's velocity.
// These are always active and scale with speed and normal load respectively.
//
// Rolling resistance: constant deceleration force, proportional to weight.
// Aerodynamic drag: scales with velocity squared (doubles at double speed = 4× drag).
//
// Returns: { forceX, forceY }
// === PHASE 3b: DRAG CUTOFF FIX ===
// REMOVED: The `body.speed < 0.05` cutoff that created a dead zone where
// the car would coast to 0.049 m/s and stick there forever. The low-speed
// dead zone prevented settling. Now we always compute drag with safe
// division-by-zero handling.
export function computeDragForces() {
  const body   = state.body;
  const params = state.params;

  const normalForce         = params.carMassKg * GRAVITY;
  const rollingResistance   = params.rollingResistanceCoeff * normalForce;
  const aeroDrag            = params.aeroDragCoeff * body.speed * body.speed;
  const totalDragMagnitude  = rollingResistance + aeroDrag;

  // Direction: opposite to velocity. Clamp speed to avoid division by zero.
  if (body.speed > 0.001) {
    const invSpeed = 1 / body.speed;
    return {
      forceX: -body.velocityX * invSpeed * totalDragMagnitude,
      forceY: -body.velocityY * invSpeed * totalDragMagnitude,
    };
  }
  return { forceX: 0, forceY: 0 };
}


// =============================================================
// BRAKE FORCE
// =============================================================

// Returns a braking force opposing the car's velocity when the brake pedal is held.
// This is a simplified model: fixed deceleration independent of tyre load.
// A more realistic model would compute per-wheel brake torque and run it
// through the Pacejka model, but this is sufficient for the clutch-feel goal.
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


// =============================================================
// VERLET INTEGRATION
// =============================================================

// Applies linear and rotational acceleration to all four wheel particles.
//
// The Verlet integrator does not store velocity explicitly.
// Instead, velocity is encoded in the gap between current and previous positions:
//   new_position = current + (current - previous) + acceleration × dt²
//
// Linear acceleration (netAccelX, netAccelY) is the same for all four particles
// because the body is rigid — every point translates identically.
//
// Rotational acceleration (netAngularAccel) adds an additional displacement
// to each point proportional to its distance from the centre and perpendicular
// to the arm vector. This is the 2D rotation applied as a linear perturbation.
export function verletIntegrateAllPoints(dt, netAccelX, netAccelY, netAngularAccel) {
  const body = state.body;
  const dtSquared = dt * dt;

  for (const wheel of Object.values(state.wheels)) {
    // Arm vector from body centre to this wheel.
    const armX = wheel.x - body.centerX;
    const armY = wheel.y - body.centerY;

    // Rotational displacement: ω × arm, where 2D cross = (-ω·armY, ω·armX).
    // This is the linearised rotation: for small angles dθ in dt², it's exact.
    const rotDeltaX = -netAngularAccel * armY * dtSquared;
    const rotDeltaY =  netAngularAccel * armX * dtSquared;

    const newX = wheel.x + (wheel.x - wheel.prevX) + (netAccelX * dtSquared) + rotDeltaX;
    const newY = wheel.y + (wheel.y - wheel.prevY) + (netAccelY * dtSquared) + rotDeltaY;

    wheel.prevX = wheel.x;
    wheel.prevY = wheel.y;
    wheel.x = newX;
    wheel.y = newY;
  }
}


// =============================================================
// RIGID BODY CONSTRAINTS (Jakobsen method)
// =============================================================

// Enforces the fixed rest distance between a pair of Verlet particles.
// If the current distance differs from the rest distance, each particle is
// moved by half the error (equal mass assumption) to correct it.
//
// Jakobsen's insight: you do not need to compute velocity — moving the position
// and leaving prevPosition unchanged automatically encodes a velocity impulse.
// CONSTRAINT_DAMPING_FACTOR: fraction of positional correction also applied
// to prevX/prevY. This drains the "phantom velocity" that pure Jakobsen
// constraints inject, preventing the jitter/energy-injection feedback loop.
// 0.0 = original (no damping, maximum jitter), 1.0 = fully damped (sluggish).
// 0.5 is a good balance: kills oscillation without making the body feel dead.
const CONSTRAINT_DAMPING_FACTOR = 0.5;

function enforceDistanceConstraint(particleA, particleB, restDistance) {
  const deltaX = particleB.x - particleA.x;
  const deltaY = particleB.y - particleA.y;
  const currentDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (currentDistance < 0.0001) return; // degenerate; skip

  // Fraction of the error each particle should move (half each for equal mass).
  const correctionScale = (currentDistance - restDistance) / currentDistance * 0.5;

  const corrAX = deltaX * correctionScale;
  const corrAY = deltaY * correctionScale;

  particleA.x += corrAX;
  particleA.y += corrAY;
  particleB.x -= corrAX;
  particleB.y -= corrAY;

  // Damping: also shift prevX/prevY by a fraction of the correction.
  // This prevents the constraint from injecting velocity impulses that
  // the Verlet integrator amplifies on the next step.
  particleA.prevX += corrAX * CONSTRAINT_DAMPING_FACTOR;
  particleA.prevY += corrAY * CONSTRAINT_DAMPING_FACTOR;
  particleB.prevX -= corrAX * CONSTRAINT_DAMPING_FACTOR;
  particleB.prevY -= corrAY * CONSTRAINT_DAMPING_FACTOR;
}

// Runs CONSTRAINT_ITERATIONS passes of all six rigid distance constraints.
// Multiple iterations converge the body toward rigidity. After 6 iterations
// the constraint error is typically below 0.01 px for reasonable forces.
//
// The six constraints are the edges of the quadrilateral: four sides and
// two diagonals. The diagonals prevent the rectangle from shearing into a
// parallelogram, which would happen with only four side constraints.
export function solveRigidBodyConstraints() {
  const wh     = state.wheels;
  const iters  = state.params.constraintIterations;

  for (let iteration = 0; iteration < iters; iteration++) {
    // Four edges: front axle, rear axle, left side, right side.
    enforceDistanceConstraint(wh.frontLeft,  wh.frontRight, CONSTRAINT_AXLE_WIDTH);
    enforceDistanceConstraint(wh.rearLeft,   wh.rearRight,  CONSTRAINT_AXLE_WIDTH);
    enforceDistanceConstraint(wh.frontLeft,  wh.rearLeft,   CONSTRAINT_SIDE_LENGTH);
    enforceDistanceConstraint(wh.frontRight, wh.rearRight,  CONSTRAINT_SIDE_LENGTH);
    // Two diagonals: prevents shear.
    enforceDistanceConstraint(wh.frontLeft,  wh.rearRight,  CONSTRAINT_DIAGONAL);
    enforceDistanceConstraint(wh.frontRight, wh.rearLeft,   CONSTRAINT_DIAGONAL);
  }
}


// =============================================================
// BOUNDARY COLLISIONS
// =============================================================

// Resolves collisions between each wheel particle and the map boundary.
// Uses coefficient of restitution (bounciness) to reflect the velocity
// component normal to the wall.
//
// Strategy: clamp each particle independently, then run the constraint
// solver again (in main.js) to restore body rigidity.
export function handleBoundaryCollisions() {
  const params = state.params;
  const bounciness = params.bounciness;

  const maxX = params.mapWidth;
  const maxY = params.mapHeight;

  for (const wheel of Object.values(state.wheels)) {
    // --- Left wall (x = 0) ---
    if (wheel.x < 0) {
      const velocityX = wheel.x - wheel.prevX;
      wheel.prevX = wheel.x; // place prevX at current position
      wheel.x = 0;
      wheel.prevX = wheel.x - (-velocityX * bounciness); // reflect velocity
    }

    // --- Right wall (x = mapWidth) ---
    if (wheel.x > maxX) {
      const velocityX = wheel.x - wheel.prevX;
      wheel.prevX = wheel.x;
      wheel.x = maxX;
      wheel.prevX = wheel.x - (-velocityX * bounciness);
    }

    // --- Top wall (y = 0) ---
    if (wheel.y < 0) {
      const velocityY = wheel.y - wheel.prevY;
      wheel.prevY = wheel.y;
      wheel.y = 0;
      wheel.prevY = wheel.y - (-velocityY * bounciness);
    }

    // --- Bottom wall (y = mapHeight) ---
    if (wheel.y > maxY) {
      const velocityY = wheel.y - wheel.prevY;
      wheel.prevY = wheel.y;
      wheel.y = maxY;
      wheel.prevY = wheel.y - (-velocityY * bounciness);
    }
  }
}


// =============================================================
// ANTI-TUNNELLING
// =============================================================

// Clamps each wheel particle's displacement in a single sub-step to prevent
// tunnelling through walls at high speeds. If a particle moved more than
// MAX_DISPLACEMENT_PER_STEP, its previous position is adjusted so the
// effective velocity is limited. The Verlet integrator will still apply
// acceleration correctly next step.
export function clampParticleDisplacements() {
  for (const wheel of Object.values(state.wheels)) {
    const displacementX = wheel.x - wheel.prevX;
    const displacementY = wheel.y - wheel.prevY;
    const displacementMagnitude = Math.hypot(displacementX, displacementY);

    if (displacementMagnitude > MAX_DISPLACEMENT_PER_STEP) {
      const scale = MAX_DISPLACEMENT_PER_STEP / displacementMagnitude;
      // Adjust prevX/Y so that the stored velocity is clamped.
      wheel.prevX = wheel.x - displacementX * scale;
      wheel.prevY = wheel.y - displacementY * scale;
    }
  }
}


// =============================================================
// STEERING
// =============================================================

// Visual wheel angle range (radians). The HUD steering wheel rotates through
// this range (≈1.25 full rotations) to give arcade-style steering feel.
// Must be defined here and match the value in input.js line 52.
const MAX_VISUAL_WHEEL_ANGLE_RAD = Math.PI * 2.5;

// Maps the visual steering wheel angle (large arcade range) to the actual
// front wheel lock angle (physics range). When not dragging, self-aligning
// torque (SAT) from the front tires drives the steering back toward centre.
//
// The steering column is modelled as a rotational spring-damper:
//   - Driver input sets a target angle (when dragging)
//   - SAT from previous step's tire forces opposes the current angle
//   - Viscous damping opposes angular velocity (smooth feel)
//   - Coulomb friction provides a constant resistance threshold
//
// During a drift, the front tires' lateral force creates SAT that pulls
// the steering INTO the counter-steer direction, giving the driver natural
// feedback. The steering wheel visibly turns toward counter-steer.
export function updateSteering(dt) {
  const steering = state.steering;
  const params   = state.params;

  // Store previous angular velocity for derivative chain.
  steering.prevAngularVelocity = steering.angularVelocity;

  if (steering.isDragging) {
    // --- DRIVER INPUT MODE ---
    // When dragging, the visual wheel angle is set directly by the mouse.
    // Map to physical front wheel angle immediately (driver has authority).
    const normalisedSteering = clamp(
      steering.wheelAngle / MAX_VISUAL_WHEEL_ANGLE_RAD,
      -1, 1
    );
    const targetPhysical = normalisedSteering * params.maxFrontWheelAngle;

    // Track angular velocity of the front wheel angle for the derivative chain.
    const prevAngle = steering.frontWheelAngle;
    steering.frontWheelAngle = targetPhysical;
    steering.angularVelocity = (steering.frontWheelAngle - prevAngle) / dt;

  } else {
    // --- SAT-DRIVEN RETURN MODE ---
    // When not dragging, the steering column is a free rotational system
    // driven by self-aligning torque from the tires.
    //
    // Equation of motion:
    //   I × α = SAT - viscousDamping × ω - coulombFriction × sign(ω)
    //         + springReturn (fallback for very low speed)
    //
    // SAT from computeTireForces() (previous step): stored in state.
    // Sign convention: SAT opposes the current steering angle.

    const I       = params.steeringColumnInertia;
    const visc    = params.steeringViscousDamping;
    const coulomb = params.steeringCoulombFriction;
    const sat     = steering.selfAligningTorque;

    // SAT acts to return steering to centre: it's computed as lateral_force × trail,
    // where lateral force opposes slip. The sign already works correctly.
    // We need to map it to the front wheel angle's coordinate:
    // SAT > 0 means force pushes right, which for a negative (left) steer angle
    // means returning to centre. We use it directly as a torque on the column.
    let netTorque = sat;

    // Low-speed fallback spring: at very low speed, SAT is negligible
    // (no lateral force), so add a gentle spring to return to centre.
    // This prevents the steering from staying stuck at lock when stationary.
    const speedFactor = clamp01(state.body.speed / 3.0); // ramps 0→1 over 0→3 m/s
    const fallbackSpring = -steering.frontWheelAngle * params.steeringSelfCenterRate * (1.0 - speedFactor) * I;
    netTorque += fallbackSpring;

    // Viscous damping: opposes angular velocity.
    netTorque -= visc * steering.angularVelocity;

    // Coulomb friction: constant magnitude, opposes motion direction.
    // Only apply if angular velocity is meaningful — don't block oscillation around zero.
    // Also: only apply Coulomb if it doesn't exceed net torque (otherwise it stalls the return).
    if (Math.abs(steering.angularVelocity) > 0.01) {
      const coulombForce = coulomb * Math.sign(steering.angularVelocity);
      // Only apply if it doesn't reverse the net torque direction (prevents stall)
      if (Math.sign(coulombForce) !== Math.sign(netTorque) || Math.abs(netTorque) > Math.abs(coulombForce) * 2) {
        netTorque -= coulombForce;
      }
    }

    // Integrate: α = τ / I, then Euler step for ω and θ.
    const angularAccel = netTorque / I;
    steering.angularVelocity += angularAccel * dt;
    steering.frontWheelAngle += steering.angularVelocity * dt;

    // Clamp to physical limits.
    const maxAngle = params.maxFrontWheelAngle;
    if (steering.frontWheelAngle > maxAngle) {
      steering.frontWheelAngle = maxAngle;
      if (steering.angularVelocity > 0) steering.angularVelocity = 0;
    } else if (steering.frontWheelAngle < -maxAngle) {
      steering.frontWheelAngle = -maxAngle;
      if (steering.angularVelocity < 0) steering.angularVelocity = 0;
    }

    // Update visual wheel angle to match physics (so HUD reflects SAT return).
    steering.wheelAngle = (steering.frontWheelAngle / params.maxFrontWheelAngle) * MAX_VISUAL_WHEEL_ANGLE_RAD;
  }

  // --- Steering derivative chain ---
  steering.angularAcceleration = (steering.angularVelocity - steering.prevAngularVelocity) / dt;
  // Jerk is noisy at this level; smooth it slightly.
  const rawJerk = (steering.angularAcceleration) / dt; // simplified — could store prevAccel for proper chain
  steering.angularJerk = steering.angularJerk * 0.7 + rawJerk * 0.3; // EMA smoothing
}


// =============================================================
// CAMERA
// =============================================================

// Verlet-integrated spring-damper camera that follows the car's centre of mass.
// The camera has its own position history (camX/prevX), which means its
// "velocity" (and therefore momentum) is implicit in the position pair.
// Spring force pulls camera toward the car; exponential damping kills overshoot.
//
// Zoom is speed-dependent: the faster the car goes, the further the camera
// pulls back to give more view of the road ahead.
export function updateCamera(dt) {
  const cam    = state.camera;
  const body   = state.body;
  const params = state.params;

  // Decay the jerk offset exponentially each physics step.
  // The decay rate of 12/s means the offset halves roughly every 60ms —
  // fast enough to feel snappy, slow enough for the spring to chase visibly.
  const JERK_DECAY_RATE = 12.0;
  cam.jerkOffsetX *= Math.exp(-JERK_DECAY_RATE * dt);
  cam.jerkOffsetY *= Math.exp(-JERK_DECAY_RATE * dt);

  // Spring target is body centre plus the decaying jerk offset.
  // The camera spring chases this moving target naturally.
  const targetX = body.centerX + cam.jerkOffsetX;
  const targetY = body.centerY + cam.jerkOffsetY;

  // Spring force pulling camera toward the (offset) target.
  const springForceX = (targetX - cam.x) * params.cameraStiffness;
  const springForceY = (targetY - cam.y) * params.cameraStiffness;

  // Exponential damping: each step the camera's velocity is multiplied by this.
  // Derived from: dampingFactor = e^(-damping × dt).
  const dampingFactor = Math.exp(-params.cameraDamping * dt);

  // Verlet integration: new position from current, previous, and spring force.
  const newCamX = cam.x + (cam.x - cam.prevX) * dampingFactor + springForceX * dt * dt;
  const newCamY = cam.y + (cam.y - cam.prevY) * dampingFactor + springForceY * dt * dt;

  cam.prevX = cam.x;
  cam.prevY = cam.y;
  cam.x     = newCamX;
  cam.y     = newCamY;

  // Zoom out as speed increases.
  const speedKph = body.speed / KPH_TO_MPS;
  const speedAboveThreshold = Math.max(0, speedKph - CAMERA_ZOOM_SPEED_THRESHOLD_KPH);
  cam.targetZoom = Math.max(
    CAMERA_MIN_ZOOM,
    CAMERA_MAX_ZOOM - speedAboveThreshold * params.cameraZoomSensitivity * 0.01
  );

  // Smooth zoom transitions.
  cam.zoom += (cam.targetZoom - cam.zoom) * 2.0 * dt;
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