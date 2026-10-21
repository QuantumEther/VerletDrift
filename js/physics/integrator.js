// =============================================================
// PHYSICS / INTEGRATOR — rigid planar kick-drift
// =============================================================
// The public name is retained for callers, but independent Cartesian Verlet
// extrapolation is inappropriate for a constrained rotating rectangle: chords
// stretch it, and subsequent projection dissipates angular momentum.
// Instead integrate its three generalized coordinates (X, Y, heading).
// Kick: v' = v + a dt; omega' = omega + alpha dt.
// Drift: X' = X + v' dt; heading' = heading + omega' dt.
// Rotate corner arms exactly; no constraint impulse or energy compensation is
// needed for free rigid motion. This is first-order symplectic Euler under
// applied loads and exact free SE(2) drift in real arithmetic.
import { physicsState as state } from '../state.js';
import { readPlanarMotion } from './planar-motion.js';

export function verletIntegrateAllPoints(dt, netAccelX, netAccelY, netAngularAccel) {
  const motion = readPlanarMotion(dt);
  const deltaX = (motion.velocityX + netAccelX * dt) * dt;
  const deltaY = (motion.velocityY + netAccelY * dt) * dt;
  const angle = (motion.angularVelocity + netAngularAccel * dt) * dt;
  if (Math.abs(angle) >= Math.PI) {
    throw new RangeError('Rigid pose history requires |omega * dt| < pi; subdivide the mechanical step');
  }
  const c = Math.cos(angle), s = Math.sin(angle);
  for (const wheel of Object.values(state.wheels)) {
    const armX = wheel.x - motion.centerX;
    const armY = wheel.y - motion.centerY;
    wheel.prevX = wheel.x;
    wheel.prevY = wheel.y;
    wheel.x = motion.centerX + deltaX + c * armX - s * armY;
    wheel.y = motion.centerY + deltaY + s * armX + c * armY;
  }
  state.body.historyDt = dt;
}
