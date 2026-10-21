import { describe, it, expect, vi } from 'vitest';
vi.hoisted(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} }; });
import { resetTire, settleTire, lateralProbe, state, computeTireForces } from './helpers/tire-probe.js';
import { tireGripLimit } from '../js/physics/tire-load.js';
const magnitude = () => Math.hypot(state.wheelForces.frontLeft.fx, state.wheelForces.frontLeft.fy);
const bound = () => tireGripLimit(state.wheelLoads.frontLeft, state.params.tireFrictionCoeff,
  state.params.carMassKg * 9.81 / 4, state.params.tireLoadSensitivity);

describe('Mission 02 tire/contact recovery contracts', () => {
  it('builds progressive lateral force up to the configured peak, rather than clipping near zero angle', () => {
    const small = Math.abs(lateralProbe(.15).wheel.fx);
    const middle = Math.abs(lateralProbe(2).wheel.fx);
    const peak = Math.abs(lateralProbe(8).wheel.fx);
    expect(small / peak).toBeLessThan(.1);
    expect(middle / peak).toBeGreaterThan(.3);
    expect(middle / peak).toBeLessThan(.8);
    expect(peak).toBeCloseTo(2943, 1);
  });
  it.each([2, 5, 8, 15, 20])('places the pure lateral peak at its configured %s degrees', peak => {
    const left = Math.abs(lateralProbe(peak * .75, { peakSlipAngleDeg: peak }).wheel.fx);
    const at = Math.abs(lateralProbe(peak, { peakSlipAngleDeg: peak }).wheel.fx);
    const right = Math.abs(lateralProbe(peak * 1.5, { peakSlipAngleDeg: peak }).wheel.fx);
    expect(at).toBeGreaterThan(left * 1.005);
    expect(at).toBeGreaterThan(right * 1.005);
  });
  it('gives sliding grip a lateral as well as longitudinal meaning', () => {
    const low = Math.abs(lateralProbe(80, { tireSlidingFrictionRatio: .5 }).wheel.fx);
    const high = Math.abs(lateralProbe(80, { tireSlidingFrictionRatio: 1 }).wheel.fx);
    expect(low / high).toBeCloseTo(.5, 5);
  });
  it.each([2.2, 3])('does not let retired C=%s silently disable contact', pacejkaC => {
    expect(Math.abs(lateralProbe(8, { pacejkaC }).wheel.fx)).toBeGreaterThan(2000);
  });
  it('resists pure yaw using local patch motion even with zero center speed', () => {
    resetTire({ longitudinal: 0, yaw: 2, frozen: true });
    const out = settleTire();
    expect(out.torque).toBeLessThan(-100);
    for (const [name, f] of Object.entries(state.wheelForces)) {
      const v = state.wheelKinematics[name];
      expect(f.fx * v.wheelVelX + f.fy * v.wheelVelY).toBeLessThan(0);
    }
  });
  it('bases a wheel force on its local motion, independent of the center/yaw decomposition', () => {
    resetTire({ longitudinal: 0, yaw: 2, frozen: true }); settleTire();
    const k = state.wheelKinematics.frontLeft;
    const v = { x: k.wheelVelX, y: k.wheelVelY }, original = { ...state.wheelForces.frontLeft };
    resetTire({ longitudinal: -v.y, lateral: v.x, frozen: true }); settleTire();
    expect(state.wheelForces.frontLeft.fx).toBeCloseTo(original.fx, 6);
    expect(state.wheelForces.frontLeft.fy).toBeCloseTo(original.fy, 6);
  });
  it('clears tire-generated SAT when both front wheels unload', () => {
    lateralProbe(3); expect(Math.abs(state.steering.selfAligningTorque)).toBeGreaterThan(1);
    state.wheelLoads.frontLeft = state.wheelLoads.frontRight = 0;
    computeTireForces(.01);
    expect(state.steering.selfAligningTorque).toBe(0);
  });
  it('does not carry force memory that performs positive frictional work on a reversed lateral slip', () => {
    lateralProbe(3);
    state.body.velocityX *= -1;
    computeTireForces(.01);
    const f = state.wheelForces.frontLeft, v = state.wheelKinematics.frontLeft;
    expect(f.fx * v.wheelVelX + f.fy * v.wheelVelY).toBeLessThanOrEqual(1e-8);
  });
  it('does not retain several tire lags in the lateral step response', () => {
    resetTire({ lateral: 2, frozen: true });
    computeTireForces(.001);
    expect(state.wheelSlipAngle.frontLeft).toBeCloseTo(Math.atan2(2, Math.hypot(20, .5)), 5);
  });
  it.each([1e-6, 1, 100, 2943, 10000])('retains bounded support and dissipative steady forces at load %s N', load => {
    resetTire({ lateral: 8, load, omega: 100, frozen: true }); settleTire();
    expect(magnitude()).toBeLessThanOrEqual(bound() + 1e-7);
    expect(magnitude()).toBeGreaterThan(0);
    expect(state.wheelForces.frontLeft.fx).toBeLessThan(0);
  });
  it('does not generate unsupported forces from carried history at zero load', () => {
    resetTire({ lateral: 5, load: 0 });
    state.prevTireForce.frontLeft = { lon: 1000, lat: -2000 };
    computeTireForces(.02);
    expect(magnitude()).toBe(0);
  });
  it.each([0, .01, -1, 20, -20])('pure longitudinal rolling is force-free at %s m/s', v => {
    resetTire({ longitudinal: v }); const out = settleTire();
    expect(Math.hypot(out.forceX, out.forceY, out.torque)).toBeLessThan(1e-7);
  });
});
