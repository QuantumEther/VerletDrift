// Isolated production chassis stages, with physical inputs expressed in SI units.
import state from '../../js/state.js';
import { CAR_HALF_LENGTH, CAR_HALF_WIDTH } from '../../js/constants.js';
import { initializeCarBody, computeBodyDerivedState } from '../../js/physics/kinematics.js';
import { verletIntegrateAllPoints } from '../../js/physics/integrator.js';
import { solveRigidBodyConstraints, clampParticleDisplacements, handleBoundaryCollisions } from '../../js/physics/constraints.js';

const initial = structuredClone(state);
export const inertia = () => state.params.carMassKg * (CAR_HALF_LENGTH ** 2 + CAR_HALF_WIDTH ** 2) / 3;
export const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
export function reset({ dt = 0.01, vx = 0, vy = 0, omega = 0, center = 100, params = {} } = {}) {
  Object.assign(state, structuredClone(initial));
  Object.assign(state.params, params, { mapWidth: 100000, mapHeight: 100000 });
  initializeCarBody(center, center);
  const c = Math.cos(-omega * dt), s = Math.sin(-omega * dt);
  for (const w of Object.values(state.wheels)) {
    const x = w.x - center, y = w.y - center;
    w.prevX = center + c * x - s * y - vx * dt;
    w.prevY = center + s * x + c * y - vy * dt;
  }
  state.body.heading = -omega * dt;
  computeBodyDerivedState(dt);
  // A prepared initial velocity is not a physical acceleration impulse.
  Object.assign(state.body, { accelX: 0, accelY: 0, prevAccelX: 0, prevAccelY: 0 });
  return observe();
}
export function step(dt, { fx = 0, fy = 0, torque = 0 } = {}) {
  verletIntegrateAllPoints(dt, fx / state.params.carMassKg, fy / state.params.carMassKg, torque / inertia());
  solveRigidBodyConstraints();
  clampParticleDisplacements();
  handleBoundaryCollisions();
  solveRigidBodyConstraints();
  computeBodyDerivedState(dt);
  return observe();
}
export function observe() {
  const b = state.body, mass = state.params.carMassKg, I = inertia();
  const pairs = Object.values(state.wheels);
  const distances = pairs.flatMap((a, i) => pairs.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.y - b.y)));
  return { x: b.centerX, y: b.centerY, heading: b.heading, vx: b.velocityX, vy: b.velocityY,
    omega: b.angularVelocity, px: mass * b.velocityX, py: mass * b.velocityY,
    angularMomentum: I * b.angularVelocity, rotationalEnergy: 0.5 * I * b.angularVelocity ** 2,
    energy: 0.5 * mass * b.speed ** 2 + 0.5 * I * b.angularVelocity ** 2,
    accelX: b.accelX, accelY: b.accelY, jerkX: b.jerkX, distances };
}
export { state };
