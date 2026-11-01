import * as THREE from '../../tire-road-observatory-prototype/vendor/three.module.js';
// Only explicitly selected, rigid, opaque leaf meshes are eligible. Moving
// mechanism nodes, transparent surfaces, pick targets and colored instances stay intact.
// Materials and shadow flags are shared unchanged; no visual detail is removed.
export function batchRigidChildren(parent,resources,excludedMaterials=[]){
 const buckets=new Map();
 for(const child of parent.children){
  if(!child.isMesh||(child.isInstancedMesh&&child.instanceColor)||child.children.length||Array.isArray(child.material)||child.material.transparent||excludedMaterials.includes(child.material)||!child.visible)continue;
  const g=child.geometry;if(!g.attributes.position||g.morphAttributes.position||Object.keys(g.attributes).some(k=>!['position','normal','uv'].includes(k)))continue;
  const key=[child.material.uuid,child.castShadow,child.receiveShadow,...Object.keys(g.attributes).sort()].join(':');
  const list=buckets.get(key)||[];list.push(child);buckets.set(key,list);
 }
 let removed=0,added=0;
 for(const list of buckets.values()){
  if(list.length<2)continue;
  const parts=[];
  for(const o of list){
   o.updateMatrix();const count=o.isInstancedMesh?o.count:1;
   for(let i=0;i<count;i++){
    const transform=o.matrix.clone();if(o.isInstancedMesh){const instance=new THREE.Matrix4();o.getMatrixAt(i,instance);transform.multiply(instance);}
    const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();parts.push(g.applyMatrix4(transform));
   }
  }
  const merged=new THREE.BufferGeometry();
  for(const name of Object.keys(parts[0].attributes)){
   const size=parts[0].attributes[name].itemSize,length=parts.reduce((n,g)=>n+g.attributes[name].array.length,0),array=new Float32Array(length);let offset=0;
   for(const g of parts){array.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
   merged.setAttribute(name,new THREE.BufferAttribute(array,size));
  }
  const first=list[0],mesh=new THREE.Mesh(merged,first.material);mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.name='Rigid visual batch';
  parent.add(mesh);for(const o of list){parent.remove(o);if(o.isInstancedMesh)o.dispose();}for(const g of parts)g.dispose();resources.add(merged);removed+=list.length;added++;
 }
 return {removed,added};
}
