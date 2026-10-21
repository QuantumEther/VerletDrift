import { describe, it, expect } from 'vitest';
import { reset, state } from './helpers/numerical-chassis.js';
import { updateSteering } from '../js/physics/steering.js';
import { applySleepIfNeeded } from '../js/physics/engine.js';
const rates=[50,100,200,400];
function setup(params={}) { reset({params}); return state.steering; }
function energy() {const s=state.steering,p=state.params;return .5*p.steeringColumnInertia*(s.angularVelocity**2+p.steeringSelfCenterRate*s.frontWheelAngle**2);}
function tick(dt,torque=0) {state.steering.selfAligningTorque=-torque;updateSteering(dt);}
describe('Mission 03 steering mechanics contract (established before fixes)',()=>{
  it.each(rates)('holds the historical subthreshold spring at %s Hz for ten seconds',hz=>{
    const s=setup({steeringCoulombFriction:2,steeringViscousDamping:.1});s.frontWheelAngle=.3;
    for(let i=0;i<10*hz;i++)tick(1/hz);
    expect(s.frontWheelAngle).toBe(.3);expect(s.angularVelocity).toBe(0);
  });
  it.each(rates)('sticks under applied subthreshold torque and breaks away at %s Hz',hz=>{
    const s=setup({steeringSelfCenterRate:0,steeringCoulombFriction:2,steeringViscousDamping:0});
    for(let i=0;i<hz;i++)tick(1/hz,1.9);
    expect(s.angularVelocity).toBe(0);tick(1/hz,2.1);
    expect(s.angularVelocity).toBeCloseTo(.1/state.params.steeringColumnInertia/hz,12);
  });
  it.each(rates)('friction stops without velocity reversal or energy increase at %s Hz',hz=>{
    const s=setup({steeringSelfCenterRate:0,steeringCoulombFriction:2,steeringViscousDamping:0});s.angularVelocity=.1;
    let last=energy();for(let i=0;i<hz;i++){tick(1/hz);expect(s.angularVelocity).toBeGreaterThanOrEqual(0);expect(energy()).toBeLessThanOrEqual(last+1e-13);last=energy();}
    expect(s.angularVelocity).toBe(0);
  });
  it('has a stationary spring with no speed controlled potential-energy source',()=>{
    const angles=[];for(const speed of [0,1,10]){const s=setup({steeringCoulombFriction:0});s.frontWheelAngle=.2;state.body.speed=speed;tick(.01);angles.push(s.frontWheelAngle);}
    expect(angles[0]).toBe(angles[1]);expect(angles[1]).toBe(angles[2]);
  });
  it.each([0,.4,1,2,5])('dissipates mechanical energy at damping ratio %s with a closed ledger',zeta=>{
    const I=.08,k=4,b=2*zeta*Math.sqrt(I*k);const s=setup({steeringColumnInertia:I,steeringSelfCenterRate:k/I,steeringViscousDamping:b,steeringCoulombFriction:0});s.frontWheelAngle=.2;
    let last=energy();for(let i=0;i<400;i++){tick(.005);expect(energy()).toBeLessThanOrEqual(last+1e-12);last=energy();const l=s.ledger;expect(l).toBeDefined();expect(Math.abs(l.residual)).toBeLessThan(1e-12);expect(l.viscousWork).toBeLessThanOrEqual(0);expect(l.numericalWork).toBeLessThanOrEqual(0);}
  });
  it.each([-1,1])('accounts for a stop impact and permits inward departure (side %s)',sign=>{
    const s=setup({steeringSelfCenterRate:0,steeringViscousDamping:0,steeringCoulombFriction:0});s.frontWheelAngle=sign*.51;s.angularVelocity=sign*5;tick(.02);
    expect(s.frontWheelAngle).toBe(sign*.52);expect(s.angularVelocity).toBe(0);expect(s.ledger.stopWork).toBeCloseTo(-1,11);expect(Math.abs(s.ledger.residual)).toBeLessThan(1e-11);
    tick(.01,-sign);expect(sign*s.angularVelocity).toBeLessThan(0);
  });
  it('moves through finite mechanical actuation and transfers its state on release',()=>{
    const s=setup({steeringSelfCenterRate:0,steeringCoulombFriction:0,steeringViscousDamping:0});s.isDragging=true;s.wheelAngle=Math.PI*2.5;
    updateSteering(.01);expect(s.frontWheelAngle).toBeGreaterThan(0);expect(s.frontWheelAngle).toBeLessThan(.52);expect(s.ledger.driverWork).toBeGreaterThan(0);
    const rate=s.angularVelocity;s.isDragging=false;tick(.01);expect(s.angularVelocity).toBeCloseTo(rate,12);expect(Math.abs(s.ledger.residual)).toBeLessThan(1e-12);
  });
  it('keeps body caches consistent with sleep histories while preserving steering and force memory',()=>{
    reset({vx:.01,omega:.01});const s=state.steering;s.angularVelocity=.4;s.frontWheelAngle=.2;s.selfAligningTorque=1;state.prevTireForce.frontLeft.lat=2;
    applySleepIfNeeded();expect(state.body.velocityX).toBe(0);expect(state.body.angularVelocity).toBe(0);expect(state.body.speed).toBe(0);expect(s.selfAligningTorque).toBe(0);expect(s.angularVelocity).toBe(.4);expect(s.frontWheelAngle).toBe(.2);expect(state.prevTireForce.frontLeft.lat).toBe(2);
  });
});
