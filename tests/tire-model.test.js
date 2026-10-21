import { describe, it, expect } from 'vitest';
import { steadyContactTarget, tireForceFraction, validateTireParameters } from '../js/physics/tire-model.js';
import { migrateTireSettings } from '../js/physics/tire-config.js';
import { tireGripLimit } from '../js/physics/tire-load.js';
const defaults = { tireFrictionCoeff: 1, peakSlipAngleDeg: 8, peakSlipRatio: .12,
  tireSlidingFrictionRatio: .85, tireLoadSensitivity: .12, tireRelaxationLength: .3 };
const target = options => steadyContactTarget({ vLong: 20, vLat: 0, omega: 20/.35,
  radius: .35, limit: 2943, peakAngle: 8*Math.PI/180, peakRatio: .12, slidingRatio: .85, ...options });

describe('peak-normalized empirical tire contract', () => {
  it.each([2,8,20])('verifies lateral peak and dimensional cornering stiffness at %s degrees', degrees => {
    const peak=degrees*Math.PI/180, eps=1e-6;
    const force=alpha=>target({peakAngle:peak,vLat:Math.tan(alpha)*Math.hypot(20,.5)});
    expect(-force(peak).lat).toBeCloseTo(2943,8);
    const stiffness=-force(eps*peak).lat/(eps*peak);
    expect(Math.abs(stiffness/(3*2943/peak)-1)).toBeLessThan(2e-6);
    for(const fraction of [.1,.5,.75,.95,1.1,1.5,2,5])expect(Math.abs(force(peak*fraction).lat)).toBeLessThan(2943);
  });
  it.each([.05,.12,.3])('verifies pure longitudinal peak at ratio %s', peakRatio => {
    const f=kappa=>target({peakRatio,omega:20/(1-kappa)/.35});
    expect(f(peakRatio).lon).toBeCloseTo(2943,8);
    expect(f(.75*peakRatio).lon).toBeLessThan(2943*.99);
    expect(f(1.5*peakRatio).lon).toBeLessThan(2943*.99);
    const eps=1e-6*peakRatio;
    expect(Math.abs(f(eps).lon/eps/(3*2943/peakRatio)-1)).toBeLessThan(2e-6);
  });
  it.each([.5,.85,1])('has one increasing branch and a C1 peak/tail for sliding ratio %s', ratio => {
    let last=0;for(let i=0;i<=100;i++){const y=tireForceFraction(i/100,ratio);expect(y).toBeGreaterThanOrEqual(last-1e-14);last=y;}
    last=1;for(let i=101;i<1000;i++){const y=tireForceFraction(i/100,ratio);expect(y).toBeLessThanOrEqual(last+1e-14);expect(y).toBeGreaterThanOrEqual(ratio);last=y;}
    expect(tireForceFraction(100,ratio)).toBe(ratio);
    for(const sign of [-1,1])expect(Math.abs((tireForceFraction(1+sign*1e-6,ratio)-1)/1e-6)).toBeLessThan(1e-5);
  });
  it('bounds combined forces and opposes actual patch slip across a deterministic domain grid', () => {
    for(const vLong of [-30,-.1,0,.1,30])for(const vLat of [-20,-.01,0,.01,20])
    for(const omega of [-300,0,300])for(const peakAngle of [2,20])for(const peakRatio of [.05,.3])for(const ratio of [.5,1]) {
      const f=target({vLong,vLat,omega,peakAngle:peakAngle*Math.PI/180,peakRatio,slidingRatio:ratio});
      expect(Number.isFinite(f.lon+f.lat)).toBe(true);
      expect(Math.hypot(f.lon,f.lat)).toBeLessThanOrEqual(2943+1e-8);
      expect(f.lon*f.slipLong+f.lat*f.slipLat).toBeLessThanOrEqual(1e-8);
      expect(f.trailFraction).toBeGreaterThanOrEqual(0);expect(f.trailFraction).toBeLessThanOrEqual(1);
    }
  });
  it('uses exact kinetic direction for locked wheels and opposite wheel rotation', () => {
    for(const vLong of [-20,20])for(const vLat of [-10,0,10]) {
      const f=target({vLong,vLat,omega:0});const speed=Math.hypot(vLong,vLat);
      expect(f.lon).toBeCloseTo(-.85*2943*vLong/speed,7);
      expect(f.lat).toBeCloseTo(-.85*2943*vLat/speed,7);
      expect(f.trailFraction).toBe(0);
    }
    expect(target({omega:-20/.35}).kappa).toBe(-2);
  });
  it('has continuous reversal and no force at true no-slip rest', () => {
    expect(target({vLong:0,vLat:0,omega:0})).toMatchObject({lon:0,lat:0});
    for(const v of [1e-9,-1e-9])expect(Math.hypot(...['lon','lat'].map(k=>target({vLong:0,vLat:v,omega:0})[k]))).toBeLessThan(.001);
  });
  it('keeps load capacity monotone, bounded, and exactly unsupported at zero load', () => {
    for(const sensitivity of [0,.12,.3]) {
      let previous=0;
      for(const load of [0,1e-9,1,100,1000,2943,6000,12000]) {
        const D=tireGripLimit(load,1,2943,sensitivity);
        expect(D).toBeGreaterThanOrEqual(previous);expect(D).toBeLessThanOrEqual(1.5*load);previous=D;
      }
    }
    expect(target({limit:0,vLat:10})).toMatchObject({lon:0,lat:0});
  });
  it.each(Object.keys(defaults))('rejects invalid %s instead of silently inverting or disabling its curve', key => {
    for(const value of [NaN,Infinity,-1])expect(()=>validateTireParameters({...defaults,[key]:value})).toThrow();
    expect(()=>validateTireParameters(defaults)).not.toThrow();
  });
});

describe('explicit tire configuration migration', () => {
  it('preserves labeled user intent and declares a legacy force-behavior change', () => {
    const old={version:1,params:{...defaults,pacejkaB:10,pacejkaC:3},soundParams:{}};
    const snapshot=structuredClone(old), migrated=migrateTireSettings(old);
    expect(old).toEqual(snapshot);
    expect(migrated.data).toMatchObject({version:2,tireModelVersion:2,params:defaults});
    expect(migrated.data.params).not.toHaveProperty('pacejkaB');
    expect(migrated.notice).toMatch(/not preserved/);
  });
  it('round-trips the v2 semantics and rejects unsupported model identities', () => {
    const current={version:2,tireModelVersion:2,params:defaults,soundParams:{}};
    expect(migrateTireSettings(current)).toEqual({data:current,notice:''});
    expect(()=>migrateTireSettings({...current,params:{...defaults,pacejkaB:10}})).toThrow();
    expect(()=>migrateTireSettings({...current,tireModelVersion:3})).toThrow();
    expect(()=>migrateTireSettings({...current,version:3})).toThrow();
    expect(()=>migrateTireSettings({version:1,params:{pacejkaC:NaN}})).toThrow();
  });
});
