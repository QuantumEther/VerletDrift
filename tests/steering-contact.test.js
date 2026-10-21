import {it,expect} from 'vitest';
import {resetTire,state} from './helpers/tire-probe.js';
import {computeTireForces} from '../js/physics/tires.js';
it('removes unsupported front aligning moments without clearing column state, then rebuilds on contact',()=>{
  resetTire({longitudinal:8,lateral:.02,frozen:true});
  state.steering.angularVelocity=.01;state.steering.frontWheelAngle=.01;
  state.steering.selfAligningTorque=200;
  state.wheelLoads.frontLeft=state.wheelLoads.frontRight=0;
  computeTireForces(.005,{coupledSteering:true,prescribedBody:true});
  expect(state.steering.selfAligningTorque).toBe(0);expect(state.steering.frontWheelAngle).not.toBe(0);
  expect(state.steering.ledger.tireWork).toBe(0);expect(state.prevTireForce.frontLeft.lat).toBe(0);
  state.wheelLoads.frontLeft=state.wheelLoads.frontRight=2943;
  computeTireForces(.005,{coupledSteering:true,prescribedBody:true});
  expect(Number.isFinite(state.steering.angularVelocity)).toBe(true);expect(Math.abs(state.steering.ledger.residual)).toBeLessThan(1e-11);
  expect(Math.abs(state.steering.selfAligningTorque)).toBeGreaterThan(0);
},30000);
