import {it,expect} from 'vitest';
import {integrateSteering} from '../js/physics/steering-model.js';
import {reset,state} from './helpers/numerical-chassis.js';
import {mechanicalStep} from './helpers/mechanical-step.js';
it.each([50,100,200,400])('preserves an undamped linear spring and its phase at %s Hz',hz=>{
  let angle=.2,rate=0;
  for(let i=0;i<2*hz;i++) {const r=integrateSteering({angle,rate,dt:1/hz,inertia:.08,stiffness:2,damping:0,friction:0,limit:.52});angle=r.angle;rate=r.rate;}
  expect(.04*rate**2+angle**2).toBeCloseTo(.04,12);
  expect(angle).toBeCloseTo(.2*Math.cos(10),12);expect(rate).toBeCloseTo(-Math.sin(10),12);
});
it('preserves the same undamped spring through production contact and sleep scheduling',()=>{
  reset({dt:.02,params:{steeringSelfCenterRate:25,steeringViscousDamping:0,steeringCoulombFriction:0,tireFrictionCoeff:0,yawDamping:0,rollingResistanceCoeff:0,aeroDragCoeff:0}});
  state.engine.currentGear='N';state.engine.clutchEngagement=0;state.steering.frontWheelAngle=.2;
  for(let i=0;i<100;i++)mechanicalStep(.02);
  const s=state.steering;expect(.04*s.angularVelocity**2+s.frontWheelAngle**2).toBeCloseTo(.04,11);expect(s.frontWheelAngle).toBeCloseTo(.2*Math.cos(10),11);
},30000);
