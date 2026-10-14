// Flat-road, small-angle sprung-body model. Planar wheel particles stay rigid.
// Positive heave is down, pitch is rear-down, roll is right-down. SI units.
import { physicsState as state } from '../state.js';
import { GRAVITY, CAR_HALF_LENGTH as L, CAR_HALF_WIDTH as W } from '../constants.js';
import { computeWeightTransfer } from './weight.js';

const corners = [
  ['frontLeft', -L, -W, 'Front'], ['frontRight', -L, W, 'Front'],
  ['rearLeft', L, -W, 'Rear'], ['rearRight', L, W, 'Rear'],
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function configuration() {
  const p = state.params;
  const mass = Math.max(100, p.carMassKg);
  const wheelMass = clamp(p.unsprungMassPerWheel, 0, mass / 8);
  const sprungMass = mass - 4 * wheelMass;
  // cogHeight describes the whole vehicle. Remove the wheel-mass moment
  // to obtain the sprung-body height, preserving total m*a*h at equilibrium.
  const height = Math.max(0.05, (mass * p.cogHeight
    - 4 * wheelMass * p.wheelRadius) / sprungMass);
  const frontRC = clamp(p.rollCenterFront, 0, height);
  const rearRC = clamp(p.rollCenterRear, 0, height);
  return {
    mass, wheelMass, sprungMass, height, frontRC, rearRC,
    pitchInertia: sprungMass * (L * L + 0.25 * 0.25) / 3,
    rollInertia: sprungMass * (W * W + 0.25 * 0.25) / 3,
  };
}

export function resetSuspension() {
  const s = state.suspension;
  s.heave = s.pitch = s.roll = 0;
  s.heaveVelocity = s.pitchVelocity = s.rollVelocity = 0;
  s.heaveAcceleration = 0;
  s.initialized = true;
  s.wasEnabled = state.params.suspensionEnabled;
  const c = configuration();
  for (const [name, , , axle] of corners) {
    const k = Math.max(1000, state.params['springRate' + axle]);
    s.compression[name] = c.sprungMass * GRAVITY / (4 * k);
    s.contact[name] = true;
    state.wheelLoads[name] = c.mass * GRAVITY / 4;
  }
}

// Previous chassis-tick accelerations drive this partitioned solve. Smaller
// internal steps resolve spring/damper dynamics; tick-average loads go to tires.
export function updateSuspension(dt) {
  const s = state.suspension;
  const p = state.params;
  if (!s.initialized || s.wasEnabled !== p.suspensionEnabled) resetSuspension();
  if (!p.suspensionEnabled) {
    computeWeightTransfer();
    return;
  }
  if (!(dt > 0)) return;
  const c = configuration();
  const ax = clamp(state.body.longitudinalAccel, -2 * GRAVITY, 2 * GRAVITY);
  const ay = clamp(state.body.lateralAccel, -2 * GRAVITY, 2 * GRAVITY);
  const steps = Math.ceil(dt / 0.001);
  const h = dt / steps;
  const totals = Object.fromEntries(corners.map(([name]) => [name, 0]));
  for (let step = 0; step < steps; step++) {
    let support = 0, pitchMoment = 0, rollMoment = 0;
    for (const [name, x, y, axle] of corners) {
      const k = Math.max(1000, p['springRate' + axle]);
      const damping = Math.max(0, p['damperRate' + axle]);
      const bar = Math.max(0, p['antiRollStiffness' + axle]); // axle torque/radian
      const rc = axle === 'Front' ? c.frontRC : c.rearRC;
      const restCompression = c.sprungMass * GRAVITY / (4 * k);
      const displacement = s.heave + x * s.pitch + y * s.roll;
      const velocity = s.heaveVelocity + x * s.pitchVelocity + y * s.rollVelocity;
      // Progressive bump stop after configured compression from ride height.
      const bump = Math.max(0, displacement - p.suspensionBumpTravel);
      const droop = Math.min(0, displacement + p.suspensionDroopTravel);
      const elastic = c.sprungMass * GRAVITY / 4 + k * displacement
        + damping * velocity + 4 * k * (bump + droop)
        + bar * s.roll * y / (2 * W * W);
      // Immediate geometric transfer and unsprung transfer. Roll moments use
      // the full sprung CoG height; geometric reaction subtracts its own share.
      const geometric = -c.sprungMass * ay * rc * y / (4 * W * W);
      const unsprung = c.wheelMass * GRAVITY
        + c.wheelMass * ax * p.wheelRadius * x / (L * L)
        - c.wheelMass * ay * p.wheelRadius * y / (W * W);
      const normal = Math.max(0, elastic + geometric + unsprung);
      const sprungSupport = normal - unsprung;
      support += sprungSupport;
      pitchMoment += sprungSupport * x;
      rollMoment += sprungSupport * y;
      totals[name] += normal / steps;
      s.compression[name] = restCompression + displacement;
      s.contact[name] = normal > 0;
    }
    s.heaveAcceleration = GRAVITY - support / c.sprungMass;
    const pitchAcceleration = (c.sprungMass * ax * c.height - pitchMoment) / c.pitchInertia;
    const rollAcceleration = (-c.sprungMass * ay * c.height - rollMoment) / c.rollInertia;
    s.heaveVelocity += s.heaveAcceleration * h;
    s.pitchVelocity += pitchAcceleration * h;
    s.rollVelocity += rollAcceleration * h;
    s.heave += s.heaveVelocity * h;
    s.pitch += s.pitchVelocity * h;
    s.roll += s.rollVelocity * h;
  }
  Object.assign(state.wheelLoads, totals);
}
