import { productionContact } from './production-contact.mjs';
export const parameters = Object.freeze({ engineInertia: .25, inputInertia: .02,
  leftInertia: 1.2, rightInertia: 1.2, gearRatio: 4 });
export function fixture(name) {
  const state = { crank: 160, input: 160, left: 40, right: 40, forceLeft: 0, forceRight: 0 };
  const forces = { combustionTorque: 100, clutchCapacity: 350 };
  let speed = 5, frictionLeft = 1, frictionRight = 1;
  if (name === 'idle') {
    Object.assign(state, { crank: 80, input: 80, left: 20, right: 20 });
    Object.assign(forces, { combustionTorque: .8, viscousDrag: .01 }); speed = 6;
  } else if (name === 'launch') {
    Object.assign(state, { crank: 85, input: 0, left: 0, right: 0 });
    Object.assign(forces, { combustionTorque: 30, clutchCapacity: 50 }); speed = 0;
  } else if (name === 'wheelspin') {
    Object.assign(state, { crank: 600, input: 600, left: 150, right: 150, forceLeft: 500, forceRight: 500 });
    forces.combustionTorque = 150; speed = 10; frictionLeft = frictionRight = .2;
  } else if (name === 'asymmetric') {
    Object.assign(state, { left: 50, right: 30, forceLeft: 1000, forceRight: 300 });
    frictionRight = .2;
  } else if (name === 'braking') {
    Object.assign(forces, { combustionTorque: 0, brakeLeft: 1000, brakeRight: 1000 }); speed = 10;
  } else if (name === 'transition') {
    Object.assign(state, { crank: 90, input: 80, left: 20, right: 20 }); speed = 5;
    forces.combustionTorque = 0;
  } else if (name === 'convergence') {
    Object.assign(state, { crank: 800, input: 800, left: 200, right: 200 });
    forces.combustionTorque = 150; frictionRight = .5;
  } else if (name === 'reversal') {
    forces.combustionTorque = 50; frictionRight = .5;
  } else if (name !== 'acceleration') throw Error(`Unknown fixture ${name}`);
  return { parameters, state, forces, contacts: [
    productionContact({ speed, friction: frictionLeft }),
    productionContact({ speed, friction: frictionRight }),
  ] };
}
