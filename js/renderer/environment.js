// Appearance only. World axes are x right, y down; azimuth points toward the sun.
export const SCENE_CONTROLS=[
 ['sceneLightingEnabled','Coherent lighting',true,0,1,1,'Environment Lighting'],
 ['sceneLightAzimuth','Light azimuth',254,0,360,1,'Environment Lighting','°'],
 ['sceneLightElevation','Light elevation',50,15,85,1,'Environment Lighting','°'],
 ['sceneLightIntensity','Direct light',.85,0,2,.05,'Environment Lighting'],
 ['sceneAmbient','Ambient illumination',.55,.1,1.5,.05,'Environment Lighting'],
 ['sceneShadowSoftness','Shadow softness',.5,0,1,.05,'Environment Lighting'],
 ['sceneLightTemperature','Light temperature',6500,3500,9000,100,'Environment Lighting','K'],
 ['balloonAppearance','Balloon colour preset',0,0,2,1,'Balloon Appearance'],
 ['balloonCrimsonRatio','Mixed crimson proportion',.35,0,1,.05,'Balloon Appearance'],
].map(([id,label,value,min,max,step,groupLabel,unit=''])=>({id,label,value,min,max,step,unit,type:typeof value==='boolean'?'checkbox':'range',subsystem:'Rendering',section:'Environment',group:`Rendering / ${groupLabel}`,groupLabel,...(id==='balloonAppearance'?{labels:['Colorful','Crimson','Mixed']}:{})}));
export const SCENE_DEFAULTS=Object.freeze(Object.fromEntries(SCENE_CONTROLS.map(c=>[c.id,c.value])));
export const LIGHT_PRESETS=Object.freeze({
 daylight:{sceneLightAzimuth:254,sceneLightElevation:50,sceneLightIntensity:.85,sceneAmbient:.55,sceneShadowSoftness:.5,sceneLightTemperature:6500},
 overcast:{sceneLightAzimuth:254,sceneLightElevation:70,sceneLightIntensity:.3,sceneAmbient:.9,sceneShadowSoftness:.9,sceneLightTemperature:7500},
 sunset:{sceneLightAzimuth:225,sceneLightElevation:24,sceneLightIntensity:1.1,sceneAmbient:.4,sceneShadowSoftness:.35,sceneLightTemperature:4500},
});
export function lighting(params=SCENE_DEFAULTS,out=new Float32Array(8)){
 const angle=(params.sceneLightAzimuth??254)*Math.PI/180,elevation=(params.sceneLightElevation??50)*Math.PI/180;
 out.set([Math.cos(angle)*Math.cos(elevation),Math.sin(angle)*Math.cos(elevation),Math.sin(elevation),params.sceneLightIntensity??.85,params.sceneAmbient??.55,params.sceneShadowSoftness??.5,((params.sceneLightTemperature??6500)-6500)/2500,params.sceneLightingEnabled===false?0:1]);
 return out;
}
export function lightColor(temperature){return temperature<0?[1,1+temperature*.16,1+temperature*.30]:[1-temperature*.12,1-temperature*.05,1];}
// Stable hue-only selection: no consumption or alteration of the physics RNG.
// The same source balloon gets the same mixed-palette decision in both renderers.
export function balloonHue(source,params){
 if(params.balloonAppearance===1)return 350;
 if(params.balloonAppearance!==2)return source;
 let n=(Math.imul(Math.round(source*1000),2246822519)^0x62d97b31)>>>0;n=Math.imul(n^(n>>>13),3266489917)>>>0;
 return (n>>>8)/16777216 < params.balloonCrimsonRatio?350:source;
}
