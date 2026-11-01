import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../tire-road-observatory-prototype/vendor/three.module.js';
import {batchRigidChildren} from '../src/render-batching.js';
import {solveContacts} from '../src/contact-solver.js';
import {fixture} from '../tools/tire-ab-fixtures.mjs';
import {stepTerrainVehicle} from '../src/vehicle.js';
test('optimized contact arithmetic and operators preserve complete dense-solver state and iterations',()=>{
 for(const id of ['reference','speed-normalized-anisotropic'])for(const h of [.001,.002,.004])for(const scenario of ['acceleration','braking','steering','combined','recovery','drift-recovery','recontact']){
  const a=fixture(id,.5,scenario,.1),b=fixture(id,.5,scenario,.1);a.v.contactKernel='dense';a.v.disableOperatorCache=true;b.v.contactKernel='isolated';
  for(let i=0;i<20;i++){stepTerrainVehicle(a.v,a.inputs(i*h),h);stepTerrainVehicle(b.v,b.inputs(i*h),h);assert.deepEqual(b.v.state,a.v.state);assert.deepEqual(b.v.contacts,a.v.contacts);}
 }
});
test('isolated loop preserves fixed, interval, scalar, disc and general groups',()=>{
 const n=9,inverse=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0)),rows=inverse.map(j=>({j}));
 const groups=[{indices:[0],fixed:-0},{indices:[1],lower:-.1,upper:.2,limit:1},{indices:[2],limit:0},{indices:[3,4],limit:.2},{indices:[5,6,7],limit:.1},{indices:[8],limit:.5}];
 for(const sign of [-1,1]){const free=Array(n).fill(sign),a=solveContacts(inverse,free,rows,groups,.001,{kernel:'dense'}),b=solveContacts(inverse,free,rows,groups,.001,{kernel:'isolated'});assert.deepEqual(b,a);}
});
test('rigid visual batching preserves transformed vertices, materials, shadows and dynamic parents',()=>{
 const parent=new THREE.Group(),opaque=new THREE.MeshStandardMaterial(),transparent=new THREE.MeshStandardMaterial({transparent:true}),resources=new Set(),original=[];
 for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),opaque);m.position.set(i,2*i,3*i);m.rotation.z=.2*i;m.castShadow=true;parent.add(m);m.updateMatrix();original.push(...m.geometry.toNonIndexed().applyMatrix4(m.matrix).attributes.position.array);}
 const glass=new THREE.Mesh(new THREE.BoxGeometry(),transparent);parent.add(glass);const moving=new THREE.Group();parent.add(moving);
 const result=batchRigidChildren(parent,resources);assert.deepEqual(result,{removed:3,added:1});assert.ok(parent.children.includes(glass)&&parent.children.includes(moving));
 const merged=parent.children.find(o=>o.name==='Rigid visual batch');assert.deepEqual([...merged.geometry.attributes.position.array],original);assert.equal(merged.material,opaque);assert.equal(merged.castShadow,true);assert.equal(resources.size,1);
 parent.rotation.z=1;assert.equal(merged.parent,parent);
});
test('interior certificate matches original disc projection at signed zero, boundaries and scales',()=>{
 for(const limit of [0,1e-12,.01,1,1e6])for(const factor of [0,.499999999999,.5,.500000000001,Math.SQRT1_2,1,2])for(const sign of [-1,1]){
  const inverse=[[1,0],[0,1]],rows=[{j:[1,0]},{j:[0,1]}],groups=[{indices:[0,1],limit}],free=[sign*limit*factor,-sign*limit*factor];
  const a=solveContacts(inverse,free,rows,groups,.001,{kernel:'dense'}),b=solveContacts(inverse,free,rows,groups,.001,{kernel:'isolated'});assert.deepEqual(b,a);
 }
});
test('rigid instance baking preserves all instances and excludes mutable-transparent paint',()=>{
 const parent=new THREE.Group(),mat=new THREE.MeshStandardMaterial(),paint=new THREE.MeshStandardMaterial(),geo=new THREE.BoxGeometry();
 const instance=new THREE.InstancedMesh(geo,mat,2),matrix=new THREE.Matrix4();instance.setMatrixAt(0,matrix.makeTranslation(1,2,3));instance.setMatrixAt(1,matrix.makeTranslation(-1,-2,-3));parent.add(instance);
 parent.add(new THREE.Mesh(geo,mat));const mutable=new THREE.Mesh(geo,paint);parent.add(mutable);
 const resources=new Set();batchRigidChildren(parent,resources,[paint]);assert.ok(parent.children.includes(mutable));const merged=parent.children.find(o=>o.name==='Rigid visual batch');assert.equal(merged.geometry.attributes.position.count,36*3);paint.transparent=true;assert.equal(mutable.material,paint);
});
test('operator workspace never crosses timestep, mass, inertia or differential changes',()=>{
 for(const mode of ['independent','open','locked']){
  const a=fixture('reference',.5,'recontact',.1),b=fixture('reference',.5,'recontact',.1);a.v.contactKernel='dense';a.v.disableOperatorCache=true;
  for(let i=0;i<9;i++){
   for(const {v} of [a,b]){v.state.drivetrain.mode=mode;v.state.drivetrain.carrierInertia=mode==='independent'?0:.4;v.state.flywheel.inertia=.2+.01*i;v.state.vertical.mass=80+i;v.state.wheels[2].inertia=1+.01*i;}
   const h=[.001,.002,.004][i%3];stepTerrainVehicle(a.v,a.inputs(i*h),h);stepTerrainVehicle(b.v,b.inputs(i*h),h);assert.deepEqual(b.v.state,a.v.state);
  }
 }
});
