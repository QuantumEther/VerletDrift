import { it,expect } from 'vitest';
import { reset,state } from './helpers/numerical-chassis.js';
import { mechanicalStep } from './helpers/mechanical-step.js';
it('resolves the moving-release feedback rather than accepting a coarse-step runaway',()=>{
  const angles=[];
  for(const hz of [50,100,200,400]){
    reset({dt:1/hz,vy:-25});state.engine.currentGear='N';state.engine.clutchEngagement=0;
    state.steering.frontWheelAngle=.08;
    for(const name of Object.keys(state.wheelOmega))state.wheelOmega[name]=25/state.params.wheelRadius;
    for(let i=0;i<3*hz;i++)mechanicalStep(1/hz);
    angles.push(state.steering.frontWheelAngle);
  }
  // Fine-grid release returns near center. Allow 5 mrad coarse/fine error,
  // 1% of default lock, not the baseline 0.2 rad growing excursion.
  expect(Math.abs(angles[0]-angles[3])).toBeLessThan(.005);
},60000);
