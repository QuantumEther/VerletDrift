// Render-only import adapter. Asset units remain metres; no mesh scaling.
import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
export function disposeObjects(roots){const gs=new Set(),ms=new Set(),ts=new Set();for(const root of roots)root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){ms.add(m);for(const value of Object.values(m))if(value?.isTexture)ts.add(value);}});ts.forEach(t=>t.dispose());gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
export async function loadCustomMustang(vehicle,url=new URL('./Mustang_Foundation_7_EXPORT_3.glb',import.meta.url)){
 return adaptCustomMustang(await new GLTFLoader().loadAsync(url.href),vehicle);
}
export function adaptCustomMustang(gltf,vehicle){
 const converted=new THREE.Group();converted.rotation.x=Math.PI/2;converted.add(gltf.scene);converted.updateMatrixWorld(true);
 try{
  // r160 derivative tangents can sparkle on degenerate UV patches. Generate
  // the missing tangent attribute from existing UVs; leave positions/materials intact.
  gltf.scene.traverse(o=>{if(!o.isMesh||!o.geometry.attributes.uv||o.geometry.attributes.tangent)return;const materials=Array.isArray(o.material)?o.material:[o.material];if(!materials.some(m=>m.anisotropy>0))return;o.geometry.computeTangents();const t=o.geometry.attributes.tangent,n=o.geometry.attributes.normal;if(t)for(let i=0;i<t.count;i++){const v=new THREE.Vector3(t.getX(i),t.getY(i),t.getZ(i));if(!Number.isFinite(v.lengthSq())||v.lengthSq()<1e-12){const normal=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)).normalize(),axis=Math.abs(normal.x)<.8?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);v.crossVectors(normal,axis).normalize();t.setXYZW(i,v.x,v.y,v.z,1);}}});
  const candidates=[];gltf.scene.traverse(o=>{if(/^Wheel_/.test(o.name)){const box=new THREE.Box3().setFromObject(o);candidates.push({node:o,center:box.getCenter(new THREE.Vector3()),size:box.getSize(new THREE.Vector3()),matrix:o.matrixWorld.clone()});}});
  if(candidates.length!==4)throw Error('Expected four distinct GLB wheel nodes');
  // World convention: +x front, +y left. Names are deliberately not used to assign corners.
  const sorted=candidates.sort((a,b)=>b.center.x-a.center.x),mapped=[...sorted.slice(0,2).sort((a,b)=>b.center.y-a.center.y),...sorted.slice(2).sort((a,b)=>b.center.y-a.center.y)];
  const spins=mapped.map(w=>{const g=new THREE.Group();w.node.removeFromParent();w.node.matrix.copy(new THREE.Matrix4().makeTranslation(-w.center.x,-w.center.y,-w.center.z).multiply(w.matrix));w.node.matrixAutoUpdate=false;g.add(w.node);return g;});
  const sourceMid=mapped.reduce((s,w)=>s+w.center.x,0)/4,targetMid=vehicle.vertical.corners.reduce((s,w)=>s+w[0],0)/4;
  converted.position.set(targetMid-sourceMid,0,-vehicle.physical.H); // Align axle midpoint and model ground datum to the declared COM height.
  const originals=new Map();converted.traverse(o=>{if(o.material){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of Array.isArray(o.material)?o.material:[o.material])originals.set(m,{opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite});}});
  return {body:converted,spins,mapping:mapped.map((w,i)=>({corner:['FL','FR','RL','RR'][i],sourceName:w.node.name,sourceCenter:w.center.toArray(),size:w.size.toArray()})),scale:1,conversion:'Rx(+pi/2): (x,y,z) -> (x,-z,y)',setXray(on){for(const [m,v]of originals){m.transparent=on||v.transparent;m.opacity=on?v.opacity*.18:v.opacity;m.depthWrite=on?false:v.depthWrite;m.needsUpdate=true;}},dispose(){disposeObjects([converted,...spins]);}};
 }catch(error){disposeObjects([converted]);throw error;}
}
