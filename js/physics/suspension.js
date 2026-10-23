// Flat-road, small-angle sprung-body model. Planar wheel particles stay rigid.
// Positive heave is down, pitch is rear-down, roll is right-down. SI units.
import { physicsState as state } from '../state.js';
import { GRAVITY } from '../constants.js';
import { computeWeightTransfer } from './weight.js';
import { physicalGeometry } from './vehicle-geometry.js';

const cornerData = () => {
  const { coordinates } = physicalGeometry(state.physicalGeometry);
  const sprungCenterY = configuration().sprungCenterY;
  return [
    ['frontLeft', coordinates.frontLeft.y - sprungCenterY, coordinates.frontLeft.x, 'Front'],
    ['frontRight', coordinates.frontRight.y - sprungCenterY, coordinates.frontRight.x, 'Front'],
    ['rearLeft', coordinates.rearLeft.y - sprungCenterY, coordinates.rearLeft.x, 'Rear'],
    ['rearRight', coordinates.rearRight.y - sprungCenterY, coordinates.rearRight.x, 'Rear'],
  ];
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function configuration() {
  const p = state.params;
  const geometry = physicalGeometry(state.physicalGeometry);
  const mass = Math.max(100, p.carMassKg);
  const wheelMass = clamp(p.unsprungMassPerWheel, 0, mass / 8);
  const sprungMass = mass - 4 * wheelMass;
  // cogHeight describes the whole vehicle. Remove the wheel-mass moment
  // to obtain the sprung-body height, preserving total m*a*h at equilibrium.
  const height = Math.max(0.05, (mass * p.cogHeight
    - 4 * wheelMass * p.wheelRadius) / sprungMass);
  const frontRC = clamp(p.rollCenterFront, 0, height);
  const rearRC = clamp(p.rollCenterRear, 0, height);
  const frontFraction = geometry.frontStaticLoadFraction;
  const rearFraction = geometry.rearStaticLoadFraction;
  const frontSprungMass = Math.max(0, mass * frontFraction - 2 * wheelMass);
  const rearSprungMass = Math.max(0, mass * rearFraction - 2 * wheelMass);
  if (frontSprungMass === 0 || rearSprungMass === 0) {
    throw new RangeError('This COM offset requires axle-specific unsprung mass support');
  }
  const sprungCenterY = (frontSprungMass * (-geometry.wheelbase / 2 - geometry.centerOfMassOffset)
    + rearSprungMass * (geometry.wheelbase / 2 - geometry.centerOfMassOffset)) / sprungMass;
  return {
    mass, wheelMass, sprungMass, height, frontRC, rearRC, sprungCenterY,
    pitchInertia: sprungMass * (geometry.wheelbase ** 2 / 4 + 0.25 ** 2) / 3
      - sprungMass * (geometry.centerOfMassOffset + sprungCenterY) ** 2,
    rollInertia: sprungMass * (((geometry.frontTrack + geometry.rearTrack) / 4) ** 2 + 0.25 ** 2) / 3,
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
  computeWeightTransfer();
  for (const [name, , , axle] of cornerData()) {
    const k = Math.max(1000, state.params['springRate' + axle]);
    const unsprung = c.wheelMass * GRAVITY;
    s.compression[name] = Math.max(0, (state.wheelLoads[name] - unsprung) / k);
    s.contact[name] = true;
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
  const geometry = physicalGeometry(state.physicalGeometry);
  const corners = cornerData();
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
      const halfTrack = axle === 'Front' ? geometry.frontTrack / 2 : geometry.rearTrack / 2;
      const bar = Math.max(0, p['antiRollStiffness' + axle]); // axle torque/radian
      const rc = axle === 'Front' ? c.frontRC : c.rearRC;
      const staticAxleFraction = axle === 'Front'
        ? geometry.frontStaticLoadFraction : geometry.rearStaticLoadFraction;
      const sprungStaticAxleLoad = (c.mass * staticAxleFraction - 2 * c.wheelMass) * GRAVITY / 2;
      const restCompression = sprungStaticAxleLoad / k;
      const displacement = s.heave + x * s.pitch + y * s.roll;
      const velocity = s.heaveVelocity + x * s.pitchVelocity + y * s.rollVelocity;
      // Progressive bump stop after configured compression from ride height.
      const bump = Math.max(0, displacement - p.suspensionBumpTravel);
      const droop = Math.min(0, displacement + p.suspensionDroopTravel);
      const elastic = sprungStaticAxleLoad + k * displacement
        + damping * velocity + 4 * k * (bump + droop)
        + bar * s.roll * y / (2 * halfTrack * halfTrack);
      // Immediate geometric transfer and unsprung transfer. Roll moments use
      // the full sprung CoG height; geometric reaction subtracts its own share.
      const geometric = -c.sprungMass * ay * rc * y / (4 * halfTrack * halfTrack);
      const unsprung = c.wheelMass * GRAVITY
        + c.wheelMass * ax * p.wheelRadius * x / (geometry.wheelbase ** 2 / 4)
        - c.wheelMass * ay * p.wheelRadius * y / (halfTrack ** 2);
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
