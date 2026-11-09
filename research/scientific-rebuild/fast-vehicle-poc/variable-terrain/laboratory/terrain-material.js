// Render-only, world-anchored material detail; no displacement or contact changes.
import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';
import {surfaceNames,surfacePalette} from './surface-palette.js';
export function terrainMaterial(ground,mapPreset=''){
 let enabled=false;
 const palette=surfacePalette(mapPreset);
 const uniforms={surfaceColors:{value:surfaceNames.map(name=>new THREE.Color(palette[name]))},detailEnabled:{value:0},terrainOrigin:{value:new THREE.Vector2()},authoredKind:{value:({mountain:1,yard:2,rally:3})[mapPreset]??0}};
 ground.geometry.setAttribute('surfaceKind',new THREE.BufferAttribute(new Float32Array(ground.geometry.attributes.position.count),1));
 for(const name of ['surfaceA','surfaceB'])ground.geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(ground.geometry.attributes.position.count*3),3));
 ground.geometry.setAttribute('roadDistance',new THREE.BufferAttribute(new Float32Array(ground.geometry.attributes.position.count),1));
 ground.geometry.setAttribute('roadWidth',new THREE.BufferAttribute(new Float32Array(ground.geometry.attributes.position.count),1));
 ground.material.onBeforeCompile=s=>{if(!enabled)return;Object.assign(s.uniforms,uniforms);s.vertexShader='attribute vec3 surfaceA; attribute vec3 surfaceB; varying vec3 vSurfaceA; varying vec3 vSurfaceB; attribute float roadDistance; attribute float roadWidth; varying float vRoadDistance; varying float vRoadWidth; attribute float surfaceKind; varying float vSurfaceKind; varying vec2 vTerrainXY; uniform vec2 terrainOrigin;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vSurfaceA=surfaceA; vSurfaceB=surfaceB; vRoadDistance=roadDistance; vRoadWidth=roadWidth; vSurfaceKind=surfaceKind; vTerrainXY=position.xy+terrainOrigin;');
 s.fragmentShader=`varying vec3 vSurfaceA; varying vec3 vSurfaceB; varying float vRoadDistance; varying float vRoadWidth; uniform float authoredKind; uniform vec3 surfaceColors[6]; varying float vSurfaceKind; varying vec2 vTerrainXY; uniform float detailEnabled;
 float gritHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float grain(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gritHash(i),gritHash(i+vec2(1,0)),f.x),mix(gritHash(i+vec2(0,1)),gritHash(i+vec2(1)),f.x),f.y);}
 `+s.fragmentShader;
 s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float closeDetail=1.-smoothstep(.15,1.,max(fwidth(vTerrainXY.x),fwidth(vTerrainXY.y))*35.);
 float aggregate=grain(vTerrainXY*35.);float broad=grain(vTerrainXY*.65);
 float gravel=vSurfaceA.y,dirt=vSurfaceA.z,grass=vSurfaceB.x,concrete=vSurfaceB.y,rock=vSurfaceB.z;
 float pebbles=grain(vTerrainXY*17.);float strata=sin(vTerrainXY.x*3.+vTerrainXY.y*7.+broad*5.);
 vec2 joint=abs(fract(vTerrainXY/4.)-.5);float seam=smoothstep(.497,.4995,max(joint.x,joint.y));
 float fibres=sin(vTerrainXY.x*90.+grain(vTerrainXY*2.)*8.);
 float tonal=(aggregate-.5)*.15*closeDetail+(broad-.5)*.12+dirt*(broad-.5)*.1+grass*fibres*.025*closeDetail-concrete*seam*.10*sqrt(closeDetail);
 tonal+=gravel*(pebbles-.5)*.3*closeDetail+rock*strata*.065*closeDetail+dirt*(grain(vTerrainXY*vec2(.7,9.))-.5)*.08*closeDetail;
 if(authoredKind>.5){
  diffuseColor.rgb=vSurfaceA.x*surfaceColors[0]+vSurfaceA.y*surfaceColors[1]+vSurfaceA.z*surfaceColors[2]+vSurfaceB.x*surfaceColors[3]+vSurfaceB.y*surfaceColors[4]+vSurfaceB.z*surfaceColors[5];
  float dist=abs(vRoadDistance),width=vRoadWidth*.5,aa=max(fwidth(vRoadDistance),.015),onRoad=1.-smoothstep(width-aa,width+aa,dist);
  vec3 base=authoredKind<1.5?vec3(.0529,.0612,.0648):authoredKind<2.5?vec3(.1845,.1981,.1845):vec3(.2502,.1301,.0578);
  float roadBlend=onRoad*(1.-smoothstep(width-.02,width+.02,dist));
  diffuseColor.rgb=mix(diffuseColor.rgb,base,roadBlend);
  float edgeOffset=authoredKind<1.5?.24:authoredKind<2.5?.28:.2;
  float halfLine=authoredKind<2.5?.16:.12;
  float edge=1.-smoothstep(halfLine-aa,halfLine+aa,abs(dist-(width-edgeOffset)));
  float period=authoredKind<1.5?8.:10.,dashLength=authoredKind<1.5?4.2:5.;
  float along=mod(vTerrainXY.x,period),ax=max(fwidth(vTerrainXY.x),.015);
  float dash=smoothstep(0.,ax,along)*(1.-smoothstep(dashLength-ax,dashLength+ax,along));
  float center=(1.-smoothstep(.12-aa,.12+aa,dist))*dash;
  float marks=max(edge,center);
  if(authoredKind>2.5)marks=edge*(1.-smoothstep(1.1-ax,1.1+ax,mod(vTerrainXY.x,10.)));
  if(authoredKind>1.5&&authoredKind<2.5){float jointX=mod(vTerrainXY.x,18.);marks=max(marks,(1.-smoothstep(.17-ax,.17+ax,jointX))*(1.-smoothstep(width-.5-aa,width-.5+aa,dist)));}
  vec3 ink=authoredKind<1.5?vec3(.701,.644,.423):authoredKind<2.5?vec3(.617,.462,.086):vec3(.479,.347,.184);
  diffuseColor.rgb=mix(diffuseColor.rgb,ink,marks*onRoad);
 }
 diffuseColor.rgb*=1.+tonal*detailEnabled;
 `);
 s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);vec3 r1=cross(sy,normal),r2=cross(normal,sx);float determinant=dot(sx,r1);float relief=(aggregate*.001+broad*.002+gravel*pebbles*.004+rock*strata*.003)*detailEnabled*closeDetail;vec3 gradient=r1*dFdx(relief)+r2*dFdy(relief);normal=normalize(abs(determinant)*normal-sign(determinant)*gradient);
 `);
 s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,dot(vSurfaceA,vec3(.87,.99,.98))+dot(vSurfaceB,vec3(1.,.94,.97)),detailEnabled);');
 };
 ground.material.customProgramCacheKey=()=> 'world-terrain-detail-1-'+enabled;
 return {setPreset(p){const next=p==='balanced'||p==='cinematic';if(next!==enabled){enabled=next;ground.material.needsUpdate=true;}uniforms.detailEnabled.value=enabled?1:0;},origin(x,y){uniforms.terrainOrigin.value.set(x,y);},classify(index,surface,sample=null){ground.geometry.attributes.roadDistance.setX(index,sample?.road?.distance??0);ground.geometry.attributes.roadWidth.setX(index,sample?.road?.width??0);const kind=({asphalt:0,gravel:1,dirt:2,grass:3,concrete:4,rock:5})[surface]??3;ground.geometry.attributes.surfaceKind.setX(index,kind);ground.geometry.attributes.surfaceA.setXYZ(index,kind===0?1:0,kind===1?1:0,kind===2?1:0);ground.geometry.attributes.surfaceB.setXYZ(index,kind===3?1:0,kind===4?1:0,kind===5?1:0);},finish(){ground.geometry.attributes.surfaceA.needsUpdate=ground.geometry.attributes.surfaceB.needsUpdate=true;ground.geometry.attributes.roadDistance.needsUpdate=ground.geometry.attributes.roadWidth.needsUpdate=true;ground.geometry.attributes.surfaceKind.needsUpdate=true;}};
}
