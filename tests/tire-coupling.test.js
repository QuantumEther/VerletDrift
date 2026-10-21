import { describe, it, expect, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import { reset, state, inertia } from './helpers/numerical-chassis.js';
import { computeTireForces } from '../js/physics/tires.js';
import { verletIntegrateAllPoints } from '../js/physics/integrator.js';
import { solveRigidBodyConstraints } from '../js/physics/constraints.js';
import { computeBodyDerivedState } from '../js/physics/kinematics.js';
const energy=()=>.5*state.params.carMassKg*state.body.speed**2+.5*inertia()*state.body.angularVelocity**2
  +Object.values(state.wheelOmega).reduce((s,w)=>s+.5*state.params.wheelInertia*w*w,0);
function prepare(dt,spin=false) {
  reset({dt,vy:spin?0:-.1,omega:spin?2:0});
  state.engine.currentGear='N';state.engine.clutchEngagement=0;
  state.steering.frontWheelAngle=spin?0:.22;
  for(const [name,w] of Object.entries(state.wheels)) {
    const a=name.startsWith('front')?state.steering.frontWheelAngle:0;
    const vx=state.body.velocityX-state.body.angularVelocity*(w.y-state.body.centerY);
    const vy=state.body.velocityY+state.body.angularVelocity*(w.x-state.body.centerX);
    state.wheelOmega[name]=(vx*Math.sin(a)-vy*Math.cos(a))/state.params.wheelRadius;
  }
}
function advance(dt) {
  const old={vx:state.body.velocityX,vy:state.body.velocityY,yaw:state.body.angularVelocity,
    x:state.body.centerX,y:state.body.centerY};
  const arms=Object.fromEntries(Object.entries(state.wheels).map(([n,w])=>[n,{x:w.x-old.x,y:w.y-old.y}]));
  const forces=computeTireForces(dt),prediction=[...state.tireContactSolve.predictedVelocity];
  verletIntegrateAllPoints(dt,forces.forceX/state.params.carMassKg,forces.forceY/state.params.carMassKg,forces.torque/inertia());
  solveRigidBodyConstraints();computeBodyDerivedState(dt);
  let work=0;
  for(const [name,f] of Object.entries(state.wheelForces)) {
    work+=dt*(f.fx*(old.vx+state.body.velocityX)/2+f.fy*(old.vy+state.body.velocityY)/2
      +(arms[name].x*f.fy-arms[name].y*f.fx)*(old.yaw+state.body.angularVelocity)/2);
    work+=state.wheelContactDiagnostics[name].contactWork;
  }
  expect(state.body.velocityX).toBeCloseTo(prediction[0],7);
  expect(state.body.velocityY).toBeCloseTo(prediction[1],7);
  expect(state.body.angularVelocity).toBeCloseTo(prediction[2],7);
  return work;
}

describe('shared chassis/wheel contact impulses',()=>{
  for(const spin of [false,true])it.each([.1,.02,.01,.005,.0025])(`does not create body-plus-wheel kinetic energy in a passive ${spin?'pivot':'slow turn'} at dt=%s`,dt=>{
    prepare(dt,spin);
    let previous=energy();
    for(let i=0;i<Math.round(.4/dt);i++) {
      const work=advance(dt),next=energy();
      expect(next).toBeLessThanOrEqual(previous+1e-7);
      expect(Math.abs(next-previous-work)).toBeLessThan(1e-5);
      expect(state.tireContactSolve.maxBodyResidual).toBeLessThan(1e-8);
      previous=next;
    }
  });
  it.each([.1,30])('resolves the stiff valid parameter corner at speed %s m/s without changing grip',speed=>{
    reset({dt:.02,vy:-speed});
    Object.assign(state.params,{tireFrictionCoeff:2.5,peakSlipAngleDeg:2,peakSlipRatio:.05,
      tireRelaxationLength:.05,tireSlidingFrictionRatio:.5,tireLoadSensitivity:.3});
    state.engine.currentGear='N';state.engine.clutchEngagement=0;
    state.steering.frontWheelAngle=.22;
    for(const [n] of Object.entries(state.wheels))state.wheelOmega[n]=speed*Math.cos(n.startsWith('front')?.22:0)/state.params.wheelRadius;
    for(let i=0;i<5;i++) {
      advance(.02);expect(Number.isFinite(energy())).toBe(true);
      for(const [n,f]of Object.entries(state.wheelForces))expect(Math.hypot(f.fx,f.fy)).toBeLessThanOrEqual(2.5*1.5*state.wheelLoads[n]+1e-6);
    }
  });

});
