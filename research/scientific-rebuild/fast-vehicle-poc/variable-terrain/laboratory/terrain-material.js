// Render-only, world-anchored material detail; no displacement or contact changes.
import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';
export function terrainMaterial(ground){
 let enabled=false;
 const uniforms={detailEnabled:{value:0},terrainOrigin:{value:new THREE.Vector2()}};
 ground.geometry.setAttribute('surfaceKind',new THREE.BufferAttribute(new Float32Array(ground.geometry.attributes.position.count),1));
 ground.material.onBeforeCompile=s=>{if(!enabled)return;Object.assign(s.uniforms,uniforms);s.vertexShader='attribute float surfaceKind; varying float vSurfaceKind; varying vec2 vTerrainXY; uniform vec2 terrainOrigin;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vSurfaceKind=surfaceKind; vTerrainXY=position.xy+terrainOrigin;');
 s.fragmentShader=`varying float vSurfaceKind; varying vec2 vTerrainXY; uniform float detailEnabled;
 float gritHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float grain(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gritHash(i),gritHash(i+vec2(1,0)),f.x),mix(gritHash(i+vec2(0,1)),gritHash(i+vec2(1)),f.x),f.y);}
 `+s.fragmentShader;
 s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float closeDetail=1.-smoothstep(.15,1.,max(fwidth(vTerrainXY.x),fwidth(vTerrainXY.y))*35.);
 float aggregate=grain(vTerrainXY*35.);float broad=grain(vTerrainXY*.65);
 float dirt=smoothstep(.6,1.6,vSurfaceKind)*(1.-smoothstep(1.6,2.5,vSurfaceKind));
 float grass=smoothstep(2.,3.,vSurfaceKind);float concrete=smoothstep(3.5,4.,vSurfaceKind);
 vec2 joint=abs(fract(vTerrainXY/4.)-.5);float seam=smoothstep(.497,.4995,max(joint.x,joint.y));
 float fibres=sin(vTerrainXY.x*90.+grain(vTerrainXY*2.)*8.);
 float tonal=(aggregate-.5)*.15*closeDetail+(broad-.5)*.12+dirt*(broad-.5)*.1+grass*fibres*.025*closeDetail-concrete*seam*.10*sqrt(closeDetail);
 diffuseColor.rgb*=1.+tonal*detailEnabled;
 `);
 s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);vec3 r1=cross(sy,normal),r2=cross(normal,sx);float determinant=dot(sx,r1);float relief=(aggregate*.001+broad*.002)*detailEnabled*closeDetail;vec3 gradient=r1*dFdx(relief)+r2*dFdy(relief);normal=normalize(abs(determinant)*normal-sign(determinant)*gradient);
 `);
 s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,mix(.87,.99,clamp(vSurfaceKind/3.,0.,1.)),detailEnabled);');
 };
 ground.material.customProgramCacheKey=()=> 'world-terrain-detail-1-'+enabled;
 return {setPreset(p){const next=p==='balanced'||p==='cinematic';if(next!==enabled){enabled=next;ground.material.needsUpdate=true;}uniforms.detailEnabled.value=enabled?1:0;},origin(x,y){uniforms.terrainOrigin.value.set(x,y);},classify(index,surface){ground.geometry.attributes.surfaceKind.setX(index,({asphalt:0,gravel:1,dirt:2,grass:3,concrete:4,rock:1.5})[surface]??3);},finish(){ground.geometry.attributes.surfaceKind.needsUpdate=true;}};
}
