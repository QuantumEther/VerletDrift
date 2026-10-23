// Reproduce the exact old static fixture, then supply the same physical
// combustion/drag law to the explicit-state research kernel.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { default: state } = await import('../../js/state.js');
const { updateEngine, synchronizeEngineWithWheels } = await import('../../js/physics/engine.js');
const { computeTireForces } = await import('../../js/physics/tires.js');
const { createCoupledSolver } = await import('./coupled-solver.mjs');
const initial = structuredClone(state);
for (const hz of [50, 100, 200, 400]) {
  Object.assign(state, structuredClone(initial));
  state.params.tireFrictionCoeff = 0;
  state.params.gearRatio1 = state.params.finalDriveRatio = 1;
  const omega = 800 * 2 * Math.PI / 60;
  Object.assign(state.engine, { mode: 'running', omega, inputOmega: omega,
    currentGear: '1', requestedGear: '1', clutchPedalPosition: 1 });
  state.wheelOmega.rearLeft = state.wheelOmega.rearRight = omega;
  state.input.clutchKeyHeld = false; state.input.throttleKeyHeld = true;
  updateEngine(1 / hz);
  const combustionTorque = state.engine.combustionTorqueNm, p = state.params;
  computeTireForces(1 / hz); synchronizeEngineWithWheels(1 / hz);
  const result = createCoupledSolver({ engineInertia: p.engineInertiaKgM2,
    inputInertia: p.gearboxInputInertiaKgM2, leftInertia: p.wheelInertia,
    rightInertia: p.wheelInertia, gearRatio: 1 }).step({ crank: omega, input: omega,
    left: omega, right: omega, forceLeft: 0, forceRight: 0 },
  { combustionTorque, dragTorque: -p.peakEngineTorqueNm * .035,
    viscousDrag: .01, clutchCapacity: p.clutchCapacityNm }, 1 / hz);
  console.log(JSON.stringify({ hz, splitHeat: state.engine.clutchHeatJ,
    coupledHeat: result.work.clutchHeat, splitCrank: state.engine.omega,
    coupledCrank: result.state.crank, coupledWork: result.work,
    combustionTorque, clutchTorque: result.clutchTorque }));
}
