// =============================================================
// STEERING — SAT-driven steering column model
// =============================================================
// Exports: updateSteering
//
// When dragging: visual wheel angle (set by input.js) maps directly to
// physical front wheel angle.
// When not dragging: self-aligning torque from tires drives the column
// back toward centre using semi-implicit Euler integration.

import { physicsState as state } from '../state.js';


// =============================================================
// CONSTANTS
// =============================================================

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Visual wheel angle range (radians). The HUD steering wheel rotates through
// this range (≈1.25 full rotations) to give arcade-style steering feel.
// Must match the value in input.js line 52.
const MAX_VISUAL_WHEEL_ANGLE_RAD = Math.PI * 2.5;


// =============================================================
// STEERING UPDATE
// =============================================================

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

    // SAT sign convention fix:
    // relaxedLat sign = opposes lateral wheel speed. wheelRightX = cos(heading+steer).
    // If car steers left (negative steerAngle), front wheels generate rightward lateral
    // force (positive relaxedLat) to resist the turn. That positive lateral force
    // times positive trail gives positive SAT — but we need NEGATIVE torque on the
    // column (returning left-steered wheel back toward center means reducing the angle).
    // Therefore: negate SAT before applying as column torque.
    let netTorque = -sat;

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

    // --- Semi-implicit (symplectic) Euler integration ---
    // Standard Euler ω += α·dt is unstable when α >> damping/dt.
    // With SAT ~278 N·m and I=0.08: α_max=3475 rad/s². At 100Hz dt=0.01s,
    // Δω_max=34.75 rad/s per step → column swings full lock in ~1 step → oscillation.
    //
    // Semi-implicit treats viscous damping implicitly (solved at ω_new rather than ω_old):
    //   I·ω_new = I·ω_old + (explicitForces)·dt - visc·ω_new·dt
    //   ω_new·(I + visc·dt) = I·ω_old + (explicitForces)·dt
    //   ω_new = (ω_old + explicitForces/I·dt) / (1 + visc·dt/I)
    //
    // netTorque currently already has (-visc·ω_old) baked in.
    // We need the non-viscous part: add visc·ω_old back to recover explicit terms.
    const explicitTorque    = netTorque + visc * steering.angularVelocity;
    const viscImplicitDenom = 1.0 + (visc * dt) / I;
    steering.angularVelocity = (steering.angularVelocity + (explicitTorque / I) * dt) / viscImplicitDenom;
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
  // Jerk = d(angularAcceleration)/dt — needs previous acceleration value.
  // The old formula (angularAcceleration / dt) was wrong: it doubled the derivative
  // order, producing d²ω/dt² * (1/dt) instead of d³θ/dt³. At 100Hz this inflated
  // the value by 100×, making it useless for any downstream use.
  if (steering.prevAngularAcceleration !== undefined) {
    steering.angularJerk = (steering.angularAcceleration - steering.prevAngularAcceleration) / dt;
  }
  steering.prevAngularAcceleration = steering.angularAcceleration;
}
