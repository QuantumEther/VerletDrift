// Faithful rotational/contact ordering from the repair branch, with prescribed
// torques rather than combustion mode/pedal/UI state. This is a timing reference,
// not a new production method or an oracle for mechanical correctness.
import { integrateWheelContact } from '../../js/physics/wheel.js';
import { rearMobility, clutchBrakeImpulse, clutchImpulse } from '../../js/physics/drivetrain-rotation.js';

export function splitReference(s, f, p, contacts, dt) {
  const g = p.gearRatio;
  if (g === 0 || p.leftInertia !== p.rightInertia) throw Error('Split benchmark requires engaged equal wheel inertias');
  const m = rearMobility(p.leftInertia, p.inputInertia, g);
  const engine = (s.crank + dt * ((f.combustionTorque ?? 0) + (f.starterTorque ?? 0)
    + (f.dragTorque ?? 0)) / p.engineInertia) / (1 + dt * (f.viscousDrag ?? 0) / p.engineInertia);
  function contact(index, omega, previousForce) {
    const c = contacts[index];
    return integrateWheelContact({ omega, inertia: 1 / m.diagonal, radius: c.radius, dt,
      driveTorque: 0, brakeCapacity: 0, previousForce, targetForce: c.targetForce,
      frictionLimit: c.limit, relaxationTime: c.relaxationTime });
  }
  const left = contact(0, s.left, s.forceLeft);
  const rightBefore = s.right + m.offDiagonal / m.diagonal * (left.omega - s.left);
  const right = contact(1, rightBefore, s.forceRight);
  const l = left.omega + m.offDiagonal / m.diagonal * (right.omega - rightBefore), r = right.omega;
  const input = g * (l + r) / 2;
  let result, leftNew, rightNew;
  if ((f.brakeLeft ?? 0) > 0 || (f.brakeRight ?? 0) > 0) {
    result = clutchBrakeImpulse(engine, l, r, p.engineInertia, p.inputInertia, p.leftInertia,
      g, f.clutchCapacity ?? 0, f.brakeLeft ?? 0, f.brakeRight ?? 0, dt);
    leftNew = result.left; rightNew = result.right;
  } else {
    result = clutchImpulse(engine, input, p.engineInertia,
      p.inputInertia + 2 * p.leftInertia / (g * g), f.clutchCapacity ?? 0, dt);
    const change = (result.input - input) / g;
    leftNew = l + change; rightNew = r + change;
  }
  return { state: { crank: result.crank, input: g * (leftNew + rightNew) / 2,
    left: leftNew, right: rightNew, forceLeft: left.force, forceRight: right.force },
  projectionHeat: result.heat, roadImpulses: [left.contactImpulse, right.contactImpulse] };
}
