// =============================================================
// PHYSICS / INTEGRATOR
// Verlet position integration for all four wheel particles.
// =============================================================
//
// INVARIANT — do not alter this formula:
//   new_position = current + (current - previous) + acceleration × dt²
//
// Rotational acceleration is applied as a linearised perturbation:
//   rotDeltaX = -netAngularAccel × armY × dt²
//   rotDeltaY =  netAngularAccel × armX × dt²
// This is only exact for small angular steps (which 100Hz guarantees).

import { physicsState as state } from '../state.js';


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
