// Render-only lighting controller; no simulation imports or additional clock.
import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';
import {EXRLoader} from './vendor/EXRLoader.js';
import {RGBELoader} from './vendor/RGBELoader.js';
// Bounded CPU decode cache; GPU PMREM targets remain renderer/context-owned.
const decodedMaps=new Map();
async function decodedEnvironment(url,Loader){let promise=decodedMaps.get(url);if(!promise){promise=new Loader().loadAsync(url);decodedMaps.set(url,promise);promise.catch(()=>{if(decodedMaps.get(url)===promise)decodedMaps.delete(url);});if(decodedMaps.size>2){const key=decodedMaps.keys().next().value,old=decodedMaps.get(key);decodedMaps.delete(key);old.then(t=>t.dispose(),()=>{});}}const texture=(await promise).clone();texture.needsUpdate=true;return texture;}
export function createGraphics(renderer,scene,sun,hemisphere,ground,NodePMREM=null){
 const skyData=new Uint8Array(256*128*4),horizon=new THREE.Color(0x9cabb8),zenith=new THREE.Color(0x386c9c),skyColor=new THREE.Color();for(let y=0;y<128;y++){for(let x=0;x<256;x++){const up=Math.sin(((y+.5)/128-.5)*Math.PI);skyColor.copy(horizon).lerp(zenith,Math.pow(Math.max(0,up),.65));const i=(y*256+x)*4;skyData[i]=Math.round(skyColor.r*255);skyData[i+1]=Math.round(skyColor.g*255);skyData[i+2]=Math.round(skyColor.b*255);skyData[i+3]=255;}}const sky=new THREE.DataTexture(skyData,256,128);sky.mapping=THREE.EquirectangularReflectionMapping;sky.magFilter=THREE.LinearFilter;sky.minFilter=THREE.LinearFilter;sky.needsUpdate=true;
 const original={background:scene.background,fog:scene.fog},generator=new (NodePMREM??THREE.PMREMGenerator)(renderer);let request=0,disposed=false,source=null,target=null,status='loading',error='',preset='baseline',exposure=1,intensity=1,sunlight=3,background=false,timing=null,yaw=0,pitch=0,roll=0;
 const sizes={baseline:0,performance:512,balanced:1024,cinematic:2048};
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;sun.shadow.camera.left=sun.shadow.camera.bottom=-8;sun.shadow.camera.right=sun.shadow.camera.top=8;sun.shadow.camera.near=.1;sun.shadow.camera.far=30;sun.shadow.bias=-.00015;sun.shadow.normalBias=.015;sun.shadow.camera.updateProjectionMatrix();
 const degrees=Math.PI/180,frame=new THREE.Quaternion(),orientation=new THREE.Quaternion(),assetUp=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
 const sourceDirection=new THREE.Matrix3(),inverse=new THREE.Matrix4();
 function alignEnvironment(){
  frame.setFromEuler(new THREE.Euler(roll*degrees,pitch*degrees,yaw*degrees,'ZYX'));
  orientation.copy(frame).multiply(assetUp);
  scene.environmentRotation.setFromQuaternion(orientation);
  scene.backgroundRotation.copy(scene.environmentRotation);
  sourceDirection.setFromMatrix4(inverse.makeRotationFromQuaternion(orientation).invert());
  // The EXR's dominant sun direction is not calibrated. Rotate the key light
  // with the user-controlled environment frame from its authored offset.
  sun.position.set(3,-4,7).applyQuaternion(frame);
  sun.shadow.needsUpdate=true;
 }
 function apply(settings={}){({preset=preset,exposure=exposure,intensity=intensity,sunlight=sunlight,background=background,yaw=yaw,pitch=pitch,roll=roll}=settings);alignEnvironment();if(!(preset in sizes))throw Error('Unknown graphics preset');
 const active=preset!=='baseline',size=sizes[preset];renderer.toneMappingExposure=exposure;renderer.shadowMap.enabled=active;sun.castShadow=active;sun.intensity=active?sunlight:3;hemisphere.intensity=active?.5:2;
 if(size&&sun.shadow.mapSize.x!==size){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapSize.set(size,size);}scene.environment=active&&target?target.texture:null;scene.background=active?(background&&source?source:sky):original.background;scene.fog=active?new THREE.Fog(0x9cabb8,35,95):original.fog;
 scene.traverse(o=>{if(o.isMesh){o.castShadow=active&&o!==ground&&!o.userData.noShadow;o.receiveShadow=active;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&'envMapIntensity'in m)m.envMapIntensity=intensity;}});renderer.shadowMap.needsUpdate=true;
 }
 async function loadEnvironment(path='./german_town_street_2k.exr'){
  const started=performance.now();var id=++request;status='loading';error='';try{const url=new URL(path,import.meta.url),Loader=url.pathname.toLowerCase().endsWith('.hdr')?RGBELoader:EXRLoader,texture=await decodedEnvironment(url.href,Loader);if(disposed||id!==request){texture.dispose();return;}const decodedAt=performance.now();texture.mapping=THREE.EquirectangularReflectionMapping;const next=generator.fromEquirectangular(texture);timing={loadAndDecodeMs:decodedAt-started,pmremCpuSubmissionMs:performance.now()-decodedAt,sourceDecodedBytes:texture.image?.data?.byteLength??null,note:'CPU wall time, including cache and network where applicable; PMREM time is not measured GPU execution or total VRAM.'};source?.dispose();target?.dispose();source=texture;target=next;status='ready';apply();}catch(e){if(!disposed&&id===request){status='error';error=e.message;apply();}}
 }
 loadEnvironment();
 return {environmentTexture:()=>source,environmentDirection:()=>sourceDirection,apply,loadEnvironment,info:()=>({timing,preset,status,error,exposure,intensity,sunlight,background,yaw,pitch,roll,shadowSize:sizes[preset],environment:!!scene.environment}),dispose(){disposed=true;sky.dispose();sun.shadow.dispose();source?.dispose();target?.dispose();generator.dispose();}};
}
