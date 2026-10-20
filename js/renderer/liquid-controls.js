// A single numeric/boolean registry serves state, UI, validation and GPU uniforms.
import {DEFAULTS,liquidParam,MATERIAL_PRESETS} from './liquid-settings.js';
const entries=[
 ['Enabled','Procedural liquid',true,0,1,1,'Splash Dynamics'],
 ['Intensity','Impact intensity',1,.25,2,.05,'Splash Dynamics'],
 ['Volume','Liquid volume scale',1,.2,2,.05,'Splash Dynamics'],
 ['MembraneThickness','Membrane thickness',DEFAULTS.membraneThickness,.45,1.8,.01,'Splash Dynamics'],
 ['Breakup','Stretch & breakup',DEFAULTS.breakup,.25,2,.01,'Splash Dynamics'],
 ['FilamentLength','Filament length',DEFAULTS.filamentLength,.45,1.8,.01,'Splash Dynamics'],
 ['DropScale','Droplet size',DEFAULTS.dropScale,.45,1.8,.01,'Splash Dynamics'],
 ['Concentration','Dye concentration',DEFAULTS.concentration,.2,2.5,.01,'Liquid Appearance'],
 ['Roughness','Liquid roughness',DEFAULTS.roughness,.45,1.8,.01,'Liquid Appearance'],
 ['Reflections','Liquid reflections',DEFAULTS.reflections,0,1.8,.01,'Liquid Appearance'],
 ['PuddleDepth','Puddle depth',DEFAULTS.puddleDepth,.45,1.8,.01,'Liquid Appearance'],
 ['VehicleInteraction','Vehicle liquid contact',true,0,1,1,'Vehicle Interaction'],
 ['BodyWetness','Body wetness',DEFAULTS.bodyWetness,0,2,.01,'Vehicle Interaction'],
 ['BodyRunoff','Body streaking / runoff',DEFAULTS.bodyRunoff,0,2,.01,'Vehicle Interaction'],
 ['HoodDeflection','Hood deflection',DEFAULTS.hoodDeflection,0,2,.01,'Vehicle Interaction'],
 ['BodyDryingDuration','Body drying duration',DEFAULTS.bodyDryingDuration,8,30,1,'Vehicle Interaction','s'],
 ['BodyResidue','Body dye residue',DEFAULTS.bodyResidue,0,1,.01,'Vehicle Interaction'],
 ['DryingEnabled','Liquid drying',true,0,1,1,'Ground Drying and Residue'],
 ['DryingDuration','Puddle drying duration',DEFAULTS.dryingDuration,8,24,1,'Ground Drying and Residue','s'],
 ['DryingIrregularity','Drying irregularity',DEFAULTS.dryingIrregularity,0,1,.01,'Ground Drying and Residue'],
 ['SurfaceAbsorption','Surface absorption',DEFAULTS.surfaceAbsorption,0,1,.01,'Ground Drying and Residue'],
 ['DyeResidue','Residual ground dye',DEFAULTS.dyeResidue,0,1,.01,'Ground Drying and Residue'],
 ['ResidueAging','Dye degradation',true,0,1,1,'Ground Drying and Residue'],
 ['ResidueLifetime','Residue lifetime',DEFAULTS.residueLifetime,20,100,1,'Ground Drying and Residue','s'],
 ['ResidueIrregularity','Residue erosion irregularity',DEFAULTS.residueIrregularity,0,1,.01,'Ground Drying and Residue'],
 ['ResiduePersistence','Protected dye retention',DEFAULTS.residuePersistence,0,1,.01,'Ground Drying and Residue'],
];
export const LIQUID_CONTROLS=entries.map(([suffix,label,value,min,max,step,groupLabel,unit=''])=>({
 id:`liquid${suffix}`,type:typeof value==='boolean'?'checkbox':'range',label,value,min,max,step,unit,
 subsystem:'Rendering',section:'Liquid effects',group:`Rendering / ${groupLabel}`,groupLabel,
}));
LIQUID_CONTROLS.push({id:'liquidQuality',type:'range',label:'Liquid detail preset',value:0,min:0,max:3,step:1,unit:'',labels:['Follow renderer','Performance','Balanced','High'],subsystem:'Rendering',section:'Liquid effects',group:'Rendering / Liquid Appearance',groupLabel:'Liquid Appearance'});
// Numeric quality selector is persisted/imported like all existing parameters.
export const LIQUID_DEFAULTS=Object.freeze({...Object.fromEntries(LIQUID_CONTROLS.map(c=>[c.id,c.value])),liquidQuality:0});
export function liquidSettings(params){
 return {...DEFAULTS,...Object.fromEntries(Object.keys(DEFAULTS).filter(k=>Object.hasOwn(params,liquidParam(k))).map(k=>[k,params[liquidParam(k)]]))};
}
export function liquidPreset(name){return Object.fromEntries(Object.entries(MATERIAL_PRESETS[name]??{}).map(([k,v])=>[liquidParam(k),v]));}
// A conservative bound on all supported water+ground-dye lifetimes. Body residue
// can be indefinite, matching the lab, and is tracked separately by the renderer.
export const GROUND_LIFETIME=300;

// Conservative bound from the shared damped launch + ballistic landing model:
// radial irregularity <=1.05, travel <=.60 s, plus shedding/secondary footprints.
// Expand coverage at extreme controls without allocating a larger texture.
export function liquidExtent(speed,volume){
 const pressure=Math.hypot(10.8,speed*.16)*Math.cbrt(volume/18);
 return Math.max(16,(pressure*1.06+speed*.18)*.60+3);
}
