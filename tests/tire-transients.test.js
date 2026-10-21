import { describe, it, expect, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import { resetTire, state, computeTireForces } from './helpers/tire-probe.js';
import { steadyContactTarget } from '../js/physics/tire-model.js';

describe('dissipative tire buildup and wheel/contact work', () => {
  it.each([.02,.01,.005,.0025])('matches the analytical force buildup endpoint and integral at dt=%s', dt => {
    resetTire({longitudinal:1,lateral:.05,frozen:true});
    const tau=.3/Math.hypot(1,.05),time=.2;
    const target=steadyContactTarget({vLong:1,vLat:.05,omega:1/.35,radius:.35,limit:2943,
      peakAngle:8*Math.PI/180,peakRatio:.12,slidingRatio:.85});
    let impulse=0;for(let i=0;i<Math.round(time/dt);i++){computeTireForces(dt);impulse+=state.wheelForces.frontLeft.fx*dt;}
    expect(state.prevTireForce.frontLeft.lat).toBeCloseTo(target.lat*(1-Math.exp(-time/tau)),7);
    expect(impulse).toBeCloseTo(target.lat*(time-tau*(1-Math.exp(-time/tau))),7);
  });
  it('drops unsupported/stopped patch memory without a spurious release force', () => {
    resetTire({longitudinal:1,lateral:.05,frozen:true});for(let i=0;i<100;i++)computeTireForces(.01);
    state.body.velocityX=0;computeTireForces(.01);
    expect(state.wheelForces.frontLeft.fx).toBe(0);expect(state.prevTireForce.frontLeft.lat).toBe(0);
  });
  it.each([0,.1,1,20])('balances rotor work and impulses while respecting dissipative patch targets at %s m/s', speed => {
    resetTire({longitudinal:speed,lateral:.2,omega:50,prescribed:true});
    for(let i=0;i<50;i++) {
      computeTireForces(.01);
      for(const d of Object.values(state.wheelContactDiagnostics)) {
        expect(Math.abs(d.impulseResidual)).toBeLessThan(1e-7);
        expect(Math.abs(d.rotorEnergyResidual)).toBeLessThan(1e-6);
        expect(d.endpointFrictionWork).toBeLessThanOrEqual(1e-7);
        expect(d.brakeWork).toBeLessThanOrEqual(1e-9);
      }
    }
  });
  it('makes pneumatic torque follow rolling direction and vanish without longitudinal transport', () => {
    const sat=[];
    for(const speed of [20,-20,0]) {
      resetTire({longitudinal:speed,lateral:.01,frozen:true});
      for(let i=0;i<100;i++)computeTireForces(.01);
      sat.push(state.steering.selfAligningTorque);
    }
    expect(sat[0]).toBeLessThan(0);expect(sat[1]).toBeGreaterThan(0);
    expect(sat[0]).toBeCloseTo(-sat[1],6);expect(sat[2]).toBe(0);
  });

  it('accounts for brake and motor work without calling chassis kinetic energy total energy', () => {
    resetTire({longitudinal:8,omega:35,prescribed:true});
    state.engine.currentGear='1';state.engine.clutchEngagement=1;
    state.engine.transmittedTorqueNm=40;
    for(let i=0;i<30;i++) {
      state.input.brakeKeyHeld=i>=10;
      computeTireForces(.01);
      for(const d of Object.values(state.wheelContactDiagnostics)) {
        expect(Math.abs(d.rotorEnergyResidual)).toBeLessThan(1e-6);
        expect(d.endpointFrictionWork).toBeLessThanOrEqual(1e-7);
        expect(d.brakeWork).toBeLessThanOrEqual(1e-7);
      }
    }
  });
});
