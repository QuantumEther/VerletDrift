// Infinite-inertia wheel fixtures prescribe contact kinematics for force curves;
// coupled motion experiments use ordinary wheel inertia, never this fixture.
import state from '../../js/state.js';
import { initializeCarBody, computeBodyDerivedState } from '../../js/physics/kinematics.js';
import { computeTireForces as productionTireForces } from '../../js/physics/tires.js';
const initial = structuredClone(state);
let prescribedBody = false;
function computeTireForces(dt) { return productionTireForces(dt, { prescribedBody }); }
export function resetTire({ longitudinal = 20, lateral = 0, yaw = 0, omega, load, params = {}, frozen = false, prescribed = frozen } = {}) {
  Object.assign(state, structuredClone(initial));
  Object.assign(state.params, params, { mapWidth: 100000, mapHeight: 100000 });
  prescribedBody = prescribed;
  if (frozen) state.params.wheelInertia = 1e12;
  initializeCarBody(100, 100); computeBodyDerivedState(.01);
  state.engine.currentGear = 'N'; state.engine.clutchEngagement = 0;
  Object.assign(state.body, { velocityX: lateral, velocityY: -longitudinal,
    angularVelocity: yaw, speed: Math.hypot(longitudinal, lateral) });
  for (const name of Object.keys(state.wheels)) {
    const w = state.wheels[name];
    const vx = lateral - yaw * (w.y - 100), vy = -longitudinal + yaw * (w.x - 100);
    state.wheelOmega[name] = omega ?? -vy / state.params.wheelRadius;
    state.wheelLoads[name] = load ?? state.params.carMassKg * 9.81 / 4;
  }
  return state;
}
export function settleTire(dt = .02, duration = .8) {
  let result;
  for (let i = 0; i < Math.round(duration / dt); i++) result = computeTireForces(dt);
  return { ...result, wheel: { ...state.wheelForces.frontLeft },
    alpha: state.wheelSlipAngle.frontLeft, kappa: state.wheelSlipRatio.frontLeft,
    sat: state.steering.selfAligningTorque };
}
export function lateralProbe(degrees, params = {}, load) {
  // Match each model's actual diagnostic angle rather than assume vLong's
  // regularization is negligible. High-speed geometric differences are tiny.
  resetTire({ lateral: 20 * Math.tan(degrees * Math.PI / 180), params, load, frozen: true });
  return settleTire();
}
export { state, computeTireForces };
