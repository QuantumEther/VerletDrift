import { describe, it, expect } from 'vitest';
import { LabClock, settingsFrom, makeSheetMesh, makeStrandMesh, DURATION, QUALITY, DEFAULTS, MATERIAL_PRESETS } from '../experiments/splash-lab/scene.js';
describe('isolated splash laboratory',()=>{
 it('replays on elapsed time independently of frame subdivision and pauses without time jumps',()=>{
  const fine=new LabClock(),coarse=new LabClock();fine.tick(0);coarse.tick(0);
  for(let i=1;i<=60;i++)fine.tick(i*1000/60);
  coarse.tick(1000);expect(fine.time).toBeCloseTo(coarse.time,10);
  fine.toggle();fine.tick(6000);expect(fine.time).toBeCloseTo(1,10);
  fine.toggle();fine.tick(10000);fine.tick(10100);expect(fine.time).toBeCloseTo(1.1,10);
  fine.replay();fine.tick(0);fine.tick(1000);expect(fine.time).toBeCloseTo(1,10);
 });
 it('supports reproducible seeking, slow motion, bounds and endpoint playback',()=>{
  const clock=new LabClock();clock.rate=.25;clock.tick(0);clock.tick(1000);expect(clock.time).toBe(.25);
  clock.seek(2.25);expect(clock.playing).toBe(false);clock.tick(3000);expect(clock.time).toBe(2.25);
  clock.seek(Infinity);expect(clock.time).toBe(0);clock.seek(DURATION+1);expect(clock.time).toBe(DURATION);
  clock.toggle();expect(clock.time).toBe(0);expect(clock.playing).toBe(true);
 });
 it('plays an accelerated lifecycle through the extended timeline',()=>{
  const clock=new LabClock();clock.rate=8;clock.tick(0);clock.tick(1000);expect(clock.time).toBe(8);
  clock.seek(DURATION);expect(clock.time).toBe(DURATION);
 });
 it('clamps untrusted URL/control values without introducing random state',()=>{
  const a=settingsFrom({speed:'100',volume:-8,breakup:NaN,concentration:'bad',seed:1337.8,quality:'unknown'});
  expect(a).toMatchObject({speed:45,volume:3,breakup:1.1,concentration:1.35,seed:1338,quality:'balanced',membraneThickness:1,roughness:1,dryingEnabled:true});
  expect(settingsFrom({seed:7})).toEqual(settingsFrom({seed:7}));
 });
 it('keeps the reference look as the default and clamps drying controls deterministically',()=>{
  expect(DEFAULTS).toMatchObject({membraneThickness:1,filamentLength:1,dropScale:1,roughness:1,reflections:1,puddleDepth:1,dryingEnabled:true});
  expect(settingsFrom({dryingEnabled:'false',dryingDuration:99,dryingIrregularity:-1,surfaceAbsorption:2,dyeResidue:.4})).toMatchObject({dryingEnabled:false,dryingDuration:24,dryingIrregularity:0,surfaceAbsorption:1,dyeResidue:.4});
  expect(settingsFrom({preset:'deep-pool'})).toEqual(settingsFrom({preset:'deep-pool'}));
  expect(Object.keys(MATERIAL_PRESETS)).toEqual(['reference','thin-film','deep-pool']);
  expect(DURATION).toBeGreaterThan(6+DEFAULTS.dryingDuration*1.8);
 });
 it('clamps vehicle-local interaction controls and preserves default references',()=>{
  expect(settingsFrom({vehicleInteraction:'false',bodyWetness:99,bodyRunoff:-3,hoodDeflection:NaN,bodyDryingDuration:99,bodyResidue:-1})).toMatchObject({vehicleInteraction:false,bodyWetness:2,bodyRunoff:0,hoodDeflection:1,bodyDryingDuration:30,bodyResidue:0});
  expect(settingsFrom()).toMatchObject({vehicleInteraction:true,bodyWetness:1,bodyRunoff:1,hoodDeflection:1,bodyDryingDuration:22,bodyResidue:.18});
 });
 it('builds closed parameterized sheets and indexed strips within allocated geometry',()=>{
  const sheet=makeSheetMesh(24,8),strand=makeStrandMesh(12);
  expect(sheet.indices.length).toBe(24*8*6);expect(strand.indices.length).toBe(12*6);
  for(const mesh of [sheet,strand])expect(Math.max(...mesh.indices)).toBeLessThan(mesh.vertices.length/2);
  expect([...sheet.vertices.slice(0,2)]).toEqual([0,0]);
  expect([...sheet.vertices.slice(-2)]).toEqual([1,1]);
  for(const q of Object.values(QUALITY)){expect(q.strands%3).toBe(0);expect(q.maxPixels).toBeLessThanOrEqual(4000000);}
 });
});

it('bounds residue controls and covers the complete weathering endpoint',()=>{
 expect(settingsFrom()).toMatchObject({residueAging:true,residueLifetime:60,residueIrregularity:.65,residuePersistence:.55});
 expect(settingsFrom({residueAging:'false',residueLifetime:999,residueIrregularity:-1,residuePersistence:2})).toMatchObject({residueAging:false,residueLifetime:100,residueIrregularity:0,residuePersistence:1});
 expect(DURATION).toBeGreaterThan(270);
});
