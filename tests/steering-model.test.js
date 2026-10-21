import { describe,it,expect } from 'vitest';
import { integrateSteering } from '../js/physics/steering-model.js';
import { reset,state } from './helpers/numerical-chassis.js';
import { updateSteering } from '../js/physics/steering.js';
const base={angle:0,rate:0,dt:.01,inertia:.08,damping:0,friction:0,stiffness:0,limit:100};
describe('steering analytical response, passivity, and supported domain',()=>{
  it.each([-1,1])('has exact isolated constant-torque impulse with sign %s',sign=>{
    const r=integrateSteering({...base,externalTorque:sign*.1});
    expect(r.rate).toBeCloseTo(sign*.0125,14);expect(Math.abs(r.ledger.residual)).toBeLessThan(1e-16);
  });
  it.each([.001,.01,.1])('does not overshoot a friction stop with step %s',dt=>{
    const r=integrateSteering({...base,dt,rate:.01,friction:2});expect(r.rate).toBe(0);
    expect(Math.abs(r.ledger.frictionImpulse)).toBeLessThanOrEqual(dt*2);expect(r.ledger.frictionWork).toBe(0);
    // Endpoint friction work is zero for a stopped step; kinetic loss is the
    // explicitly separated BE work defect, not exact continuous friction heat.
    expect(r.ledger.numericalWork).toBeCloseTo(-.5*.08*.01**2,16);
  });
  it('converges to the analytical viscous decay without calling numerical loss heat',()=>{
    const errors=[];for(const hz of [50,100,200,400]) {let a=.0,w=1;for(let n=0;n<hz;n++){const r=integrateSteering({...base,angle:a,rate:w,dt:1/hz,damping:.08});a=r.angle;w=r.rate;}errors.push(Math.abs(w-Math.exp(-1)));}
    for(let i=1;i<errors.length;i++)expect(errors[i]/errors[i-1]).toBeGreaterThan(.49),expect(errors[i]/errors[i-1]).toBeLessThan(.51);
  });
  it.each([.2,1,2])('converges to the analytic spring release for damping ratio %s',zeta=>{
    const wn=5,I=.08,k=I*wn**2,b=2*zeta*I*wn,t=.4;
    let exact,velocity;if(zeta<1){const wd=wn*Math.sqrt(1-zeta*zeta);exact=.2*Math.exp(-zeta*wn*t)*(Math.cos(wd*t)+zeta*wn/wd*Math.sin(wd*t));velocity=-.2*wn**2/wd*Math.exp(-zeta*wn*t)*Math.sin(wd*t);}
    else if(zeta===1){exact=.2*(1+wn*t)*Math.exp(-wn*t);velocity=-.2*wn**2*t*Math.exp(-wn*t);}
    else {const r1=-wn*(zeta-Math.sqrt(zeta*zeta-1)),r2=-wn*(zeta+Math.sqrt(zeta*zeta-1));exact=.2*(r2*Math.exp(r1*t)-r1*Math.exp(r2*t))/(r2-r1);velocity=.2*r1*r2*(Math.exp(r1*t)-Math.exp(r2*t))/(r2-r1);}
    const errors=[];for(const hz of [50,100,200,400]){let angle=.2,rate=0;for(let i=0;i<t*hz;i++){const r=integrateSteering({...base,angle,rate,dt:1/hz,stiffness:k,damping:b});angle=r.angle;rate=r.rate;}errors.push(Math.abs(angle-exact));}
    // BE modified equation A_eff=A+h*A²/2 predicts leading position
    // error h*t*theta_double_dot(t)/2. Check that coefficient independently.
    const leading=Math.abs(.5*t*(-2*zeta*wn*velocity-wn**2*exact));
    expect(errors[3]*400/leading).toBeGreaterThan(.95);expect(errors[3]*400/leading).toBeLessThan(1.05);for(let i=1;i<errors.length;i++)expect(errors[i]).toBeLessThan(errors[i-1]*.6);
  });
  it('opposes sliding through a driven torque reversal and balances every work term',()=>{
    let angle=0,rate=.5;for(let i=0;i<300;i++){
      const r=integrateSteering({...base,angle,rate,friction:.2,externalTorque:-.3});
      expect(r.ledger.frictionWork).toBeLessThanOrEqual(0);expect(Math.abs(r.ledger.residual)).toBeLessThan(1e-13);
      angle=r.angle;rate=r.rate;
    }expect(rate).toBeLessThan(0);
  });
  it('covers the supported inertia, damping, spring, friction and lock extremes passively',()=>{
    for(const I of [.01,.08,1])for(const damping of [0,5.5,10])for(const friction of [0,.05,2])for(const rateRatio of [0,5,30])for(const limit of [.1,1.2]){
      let angle=.9*limit,rate=3;for(let i=0;i<10;i++){
        const r=integrateSteering({...base,angle,rate,dt:.1,inertia:I,damping,friction,stiffness:I*rateRatio,limit});
        expect(Math.abs(r.angle)).toBeLessThanOrEqual(limit);expect(r.ledger.finalEnergy).toBeLessThanOrEqual(r.ledger.initialEnergy+1e-11);
        expect(r.ledger.frictionWork).toBeLessThanOrEqual(1e-14);expect(Math.abs(r.ledger.residual)).toBeLessThan(1e-10);angle=r.angle;rate=r.rate;
      }
    }
  });
  it('tracks an input target separately from HUD interpolation and preserves input on repeat ticks',()=>{
    reset();const s=state.steering;s.isDragging=true;s.targetWheelAngle=2;s.wheelAngle=-5;
    updateSteering(.01);const a=s.frontWheelAngle;s.wheelAngle=-5;updateSteering(.01);
    expect(s.targetWheelAngle).toBe(2);expect(s.frontWheelAngle).toBeGreaterThan(a);
  });
  it('accounts explicitly for live inertia, stiffness and lock edits',()=>{
    reset();const s=state.steering;s.frontWheelAngle=.4;s.angularVelocity=.3;updateSteering(.01);
    state.params.steeringColumnInertia=.5;state.params.steeringSelfCenterRate=10;state.params.maxFrontWheelAngle=.1;
    updateSteering(.01);expect(s.ledger.configurationWork).not.toBe(0);expect(Math.abs(s.frontWheelAngle)).toBeLessThanOrEqual(.1);expect(Math.abs(s.ledger.residual)).toBeLessThan(1e-12);
  });
  it('does not reinterpret steering rate across timestep changes',()=>{
    reset({params:{steeringViscousDamping:0,steeringCoulombFriction:0,steeringSelfCenterRate:0}});state.steering.angularVelocity=.1;
    for(const dt of [.01,.02,.005,.1,.0025]){updateSteering(dt);expect(state.steering.angularVelocity).toBe(.1);expect(Math.abs(state.steering.ledger.residual)).toBeLessThan(1e-14);}
  });
});
it('keeps exact-rest steering unchanged for ten seconds at every validation rate',()=>{
  for(const hz of [50,100,200,400]){
    reset();for(let i=0;i<10*hz;i++)updateSteering(1/hz);
    expect(state.steering.frontWheelAngle).toBe(0);expect(state.steering.angularVelocity).toBe(0);expect(state.steering.ledger.residual).toBe(0);
  }
});
it('converges to the analytical Coulomb stopping distance and dissipation',()=>{
  for(const hz of [50,100,200,400]){
    let angle=0,rate=1,frictionWork=0,numericalWork=0;
    for(let i=0;i<.6*hz;i++){
      const r=integrateSteering({...base,angle,rate,dt:1/hz,friction:.2});angle=r.angle;rate=r.rate;frictionWork+=r.ledger.frictionWork;numericalWork+=r.ledger.numericalWork;
    }
    expect(rate).toBe(0);
    // Exact stopping time .4 s; BE under-travels by omega0*h/2 on this
    // integer grid. Check the derived discretization error, not a tuned bound.
    expect(.2-angle).toBeCloseTo(.5/hz,12);
    expect(frictionWork).toBeCloseTo(-.04+.1/hz,12);expect(numericalWork).toBeCloseTo(-.1/hz,12);
  }
});
it('identifies undamped spring energy loss as the exact BE defect and refines it',()=>{
  let previous=Infinity;
  for(const hz of [50,100,200,400]){
    let angle=.2,rate=0,work=0;
    for(let i=0;i<2*hz;i++){const r=integrateSteering({...base,angle,rate,dt:1/hz,stiffness:2});angle=r.angle;rate=r.rate;work+=r.ledger.numericalWork;}
    const energy=.04*rate**2+angle**2,exactDiscrete=.04*(1+25/hz**2)**(-2*hz);
    expect(energy).toBeCloseTo(exactDiscrete,12);expect(energy-.04).toBeCloseTo(work,12);
    expect(.04-energy).toBeLessThan(previous);previous=.04-energy;
  }
});
