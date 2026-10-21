export const SMOKE_MATERIAL_CONTROLS=[
 ['smokeShadingMode','Smoke shading',2,0,2,1,['Original billboards','Local lighting','Shared volume']],
 ['smokeOpticalDensity','Smoke optical density',1,.25,3,.05],
 ['smokeScattering','Light scattering',1,0,2,.05],
 ['smokeInternalShadow','Internal shadowing',.8,0,2,.05],
].map(([id,label,value,min,max,step,labels])=>({id,label,value,min,max,step,labels,type:'range',unit:'',subsystem:'Rendering',section:'💨 Tire Smoke',group:'Rendering / Smoke material',groupLabel:'Smoke material'}));
export const SMOKE_MATERIAL_DEFAULTS=Object.freeze(Object.fromEntries(SMOKE_MATERIAL_CONTROLS.map(c=>[c.id,c.value])));
