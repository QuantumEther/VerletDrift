// Visual settings only. The standard control registry supplies reset/export/import.
export const DUST_CONTROLS = [
 ['dustEnabled','Atmospheric dust',true,0,1,1,''],
 ['dustDensity','Ambient dust density',.48,0,1, .01,''],
 ['dustVisibility','Wake visibility',1.15,0,2,.05,''],
 ['dustDisturbance','Vehicle disturbance',1,0,2,.05,''],
 ['dustPersistence','Wake persistence',4,.5,8,.1,'s'],
 ['dustWind','Ambient wind speed',.12,0,1.5,.02,'m/s'],
 ['dustWindDirection','Wind direction',25,0,360,1,'°'],
].map(([id,label,value,min,max,step,unit])=>({id,label,value,min,max,step,unit,
 type:typeof value==='boolean'?'checkbox':'range',subsystem:'Rendering',section:'Atmosphere',
 group:'Rendering / Atmospheric Dust',groupLabel:'Atmospheric Dust'}));
export const DUST_DEFAULTS=Object.freeze(Object.fromEntries(DUST_CONTROLS.map(c=>[c.id,c.value])));

// Appearance only: neither preset changes airflow, persistence, wind or physics.
export const DUST_PRESETS=Object.freeze({
 subtle:Object.freeze({dustDensity:.30,dustVisibility:.45}),
 cinematic:Object.freeze({dustDensity:.48,dustVisibility:1.15}),
});
