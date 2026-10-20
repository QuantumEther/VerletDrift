// Shared artistic liquid settings only. No gameplay state or random generator.
export const DEFAULTS = Object.freeze({
  speed: 22, volume: 18, breakup: 1.1, concentration: 1.35, seed: 1337, quality: 'balanced',
  preset: 'reference', membraneThickness: 1, filamentLength: 1, dropScale: 1,
  roughness: 1, reflections: 1, puddleDepth: 1,
  dryingEnabled: true, dryingDuration: 18, dryingIrregularity: .42,
  surfaceAbsorption: .55, dyeResidue: .38,
  residueAging: true, residueLifetime: 60, residueIrregularity: .65, residuePersistence: .55,
  vehicleInteraction: true, bodyWetness: 1, bodyRunoff: 1, hoodDeflection: 1,
  bodyDryingDuration: 22, bodyResidue: .18,
});
export const MATERIAL_PRESETS = Object.freeze({
  reference: Object.freeze({ membraneThickness: 1, filamentLength: 1, dropScale: 1, roughness: 1, reflections: 1, puddleDepth: 1, concentration: 1.35 }),
  'thin-film': Object.freeze({ membraneThickness: .72, filamentLength: 1.18, dropScale: .78, roughness: 1.38, reflections: .72, puddleDepth: .72, concentration: 1.05 }),
  'deep-pool': Object.freeze({ membraneThickness: 1.28, filamentLength: .88, dropScale: 1.18, roughness: .72, reflections: 1.28, puddleDepth: 1.36, concentration: 1.65 }),
});
const clamp = (v,lo,hi,fallback) => Number.isFinite(Number(v)) ? Math.min(hi,Math.max(lo,Number(v))) : fallback;
export function settingsFrom(values = {}) {
  return {
    speed: clamp(values.speed ?? DEFAULTS.speed,5,45,DEFAULTS.speed),
    volume: clamp(values.volume ?? DEFAULTS.volume,3,40,DEFAULTS.volume),
    breakup: clamp(values.breakup ?? DEFAULTS.breakup,.25,2,DEFAULTS.breakup),
    concentration: clamp(values.concentration ?? DEFAULTS.concentration,.2,2.5,DEFAULTS.concentration),
    seed: Math.round(clamp(values.seed ?? DEFAULTS.seed,0,999999,DEFAULTS.seed)),
    quality: ['performance','balanced','high'].includes(values.quality) ? values.quality : DEFAULTS.quality,
    preset: ['reference','thin-film','deep-pool','custom'].includes(values.preset) ? values.preset : DEFAULTS.preset,
    membraneThickness: clamp(values.membraneThickness ?? DEFAULTS.membraneThickness,.45,1.8,DEFAULTS.membraneThickness),
    filamentLength: clamp(values.filamentLength ?? DEFAULTS.filamentLength,.45,1.8,DEFAULTS.filamentLength),
    dropScale: clamp(values.dropScale ?? DEFAULTS.dropScale,.45,1.8,DEFAULTS.dropScale),
    roughness: clamp(values.roughness ?? DEFAULTS.roughness,.45,1.8,DEFAULTS.roughness),
    reflections: clamp(values.reflections ?? DEFAULTS.reflections,0,1.8,DEFAULTS.reflections),
    puddleDepth: clamp(values.puddleDepth ?? DEFAULTS.puddleDepth,.45,1.8,DEFAULTS.puddleDepth),
    dryingEnabled: values.dryingEnabled === undefined ? DEFAULTS.dryingEnabled : [true,1,'1','true','on'].includes(values.dryingEnabled),
    dryingDuration: clamp(values.dryingDuration ?? DEFAULTS.dryingDuration,8,24,DEFAULTS.dryingDuration),
    dryingIrregularity: clamp(values.dryingIrregularity ?? DEFAULTS.dryingIrregularity,0,1,.42),
    surfaceAbsorption: clamp(values.surfaceAbsorption ?? DEFAULTS.surfaceAbsorption,0,1,.55),
    dyeResidue: clamp(values.dyeResidue ?? DEFAULTS.dyeResidue,0,1,.38),
    residueAging: values.residueAging === undefined ? DEFAULTS.residueAging : [true,1,'1','true','on'].includes(values.residueAging),
    residueLifetime: clamp(values.residueLifetime ?? DEFAULTS.residueLifetime,20,100,60),
    residueIrregularity: clamp(values.residueIrregularity ?? DEFAULTS.residueIrregularity,0,1,.65),
    residuePersistence: clamp(values.residuePersistence ?? DEFAULTS.residuePersistence,0,1,.55),
    vehicleInteraction: values.vehicleInteraction === undefined ? DEFAULTS.vehicleInteraction : [true,1,'1','true','on'].includes(values.vehicleInteraction),
    bodyWetness: clamp(values.bodyWetness ?? DEFAULTS.bodyWetness,0,2,1),
    bodyRunoff: clamp(values.bodyRunoff ?? DEFAULTS.bodyRunoff,0,2,1),
    hoodDeflection: clamp(values.hoodDeflection ?? DEFAULTS.hoodDeflection,0,2,1),
    bodyDryingDuration: clamp(values.bodyDryingDuration ?? DEFAULTS.bodyDryingDuration,8,30,22),
    bodyResidue: clamp(values.bodyResidue ?? DEFAULTS.bodyResidue,0,1,.18),
  };
}

export const liquidParam = key => "liquid" + key[0].toUpperCase() + key.slice(1);

export const QUALITY = Object.freeze({
  performance: {resolution:.8,maxPixels:1400000,sheets:1,strands:36,drops:650,detail:2,atlas:512},
  balanced: {resolution:1,maxPixels:2400000,sheets:2,strands:54,drops:1200,detail:3,atlas:768},
  high: {resolution:1.2,maxPixels:4000000,sheets:3,strands:72,drops:2000,detail:4,atlas:1024},
});
