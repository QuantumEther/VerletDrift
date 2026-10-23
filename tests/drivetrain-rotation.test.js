import { describe, it, expect } from 'vitest';
import { clutchImpulse, rearMobility, clutchBrakeImpulse } from '../js/physics/drivetrain-rotation.js';

describe('bounded drivetrain impulses', () => {
  it.each([50,100,200,400])('joint clutch/brakes conserve accounted work and dissipate at %s Hz',hz=>{
    const Ie=.25,Ji=.02,Iw=1.2,g=14.35,e=80,l=0,r=0;
    const energy=(e,l,r)=>.5*Ie*e*e+.5*Iw*(l*l+r*r)+.5*Ji*(g*(l+r)/2)**2;
    const v=clutchBrakeImpulse(e,l,r,Ie,Ji,Iw,g,350,3000,3000,1/hz);
    expect(energy(v.crank,v.left,v.right)+v.heat).toBeCloseTo(energy(e,l,r),9);
    expect(v.heat).toBeGreaterThanOrEqual(0);
    expect(Math.abs(v.impulse)).toBeLessThanOrEqual(350/hz+1e-10);
    expect(Math.abs(v.brakeLeft)).toBeLessThanOrEqual(3000/hz+1e-10);
    expect(v.left).toBeCloseTo(0,10);expect(v.right).toBeCloseTo(0,10);
  });
  it.each([50,100,200,400])('conserves momentum and accounts clutch work at %s Hz', hz => {
    const Ie=.25, Js=2.4, initialE=.5*Ie*80**2+.5*Js*100**2;
    const r=clutchImpulse(80,100,Ie,Js,350,1/hz);
    expect(Ie*r.crank+Js*r.input).toBeCloseTo(Ie*80+Js*100,11);
    expect(.5*Ie*r.crank**2+.5*Js*r.input**2+r.heat).toBeCloseTo(initialE,9);
    expect(r.heat).toBeGreaterThanOrEqual(0);
  });
  it.each([-100,100])('allows signed lock at %s rad/s and unlocks under overload', w => {
    const r=clutchImpulse(w, w, .25, 2.4,350,.01);
    expect(r.locked).toBe(true);
    const loaded=clutchImpulse(w+50,w,.25,2.4,350,.01);
    expect(loaded.locked).toBe(false);
    expect(Math.abs(loaded.impulse)).toBe(3.5);
    expect(loaded.heat).toBeGreaterThan(0);
  });
  it('an open clutch exchanges no impulse or energy', () => {
    const r=clutchImpulse(80,0,.25,2.4,0,.01);
    expect(r.crank).toBe(80); expect(r.input).toBe(0);
    expect(r.impulse).toBe(0); expect(r.heat).toBe(0); expect(r.locked).toBe(false);
  });
  it.each([1,-14.35])('analytic rear response preserves common and differential inertia at ratio %s', g => {
    const Iw=1.2, Ie=.25, m=rearMobility(Iw,Ie,g);
    expect(m.diagonal+m.offDiagonal).toBeCloseTo(1/(Iw+Ie*g*g/2),12);
    expect(m.diagonal-m.offDiagonal).toBeCloseTo(1/Iw,12);
    // A left-wheel impulse also changes the right wheel via the shared crank.
    const dl=m.diagonal, dr=m.offDiagonal;
    expect(Iw*dr+Ie*g*g/4*(dl+dr)).toBeCloseTo(0,12);
    expect(Iw*dl+Ie*g*g/4*(dl+dr)).toBeCloseTo(1,12);
  });
});
