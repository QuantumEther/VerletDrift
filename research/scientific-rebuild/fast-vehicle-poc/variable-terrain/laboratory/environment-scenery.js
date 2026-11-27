import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';

// A world-aligned planting grid. Only the local window is submitted, and instance
// data changes on window crossings. Scenery is visual and never enters contact.
export function createEnvironmentScenery(scene,terrain){
 const preset=terrain.settings.preset,conifers=preset==="mountain"||preset==="flight";
 const capacity=256,root=new THREE.Group(),object=new THREE.Object3D();
 const bark=new THREE.MeshStandardMaterial({color:0x443d32,roughness:1});
 const foliage=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.92});
 const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.1,.19,1,6),bark,capacity);
 const crown=new THREE.InstancedMesh(conifers?new THREE.ConeGeometry(1,2,9):new THREE.IcosahedronGeometry(1,1),foliage,capacity*3);
 const color=new THREE.Color();
 for(const mesh of [trunk,crown]){mesh.userData.noShadow=true;mesh.userData.motionRecentered=true;mesh.frustumCulled=false;root.add(mesh);}
 scene.add(root);
 let previousX=NaN,previousY=NaN;
 const random=(x,y,seed)=>{const n=Math.sin(x*.129+y*.813+seed*13.17)*43758.5453;return n-Math.floor(n);};
 function place(mesh,i,x,y,z,sx,sy,sz){
  object.position.set(x,y,z);object.rotation.set(Math.PI/2,0,0);object.scale.set(sx,sy,sz);
  object.updateMatrix();mesh.setMatrixAt(i,object.matrix);
 }
 return {update(x,y,enabled){
  root.visible=enabled&&preset!=='flat';
  if(!root.visible)return;
  const ox=Math.floor(x/24)*24,oy=Math.floor(y/24)*24;
  root.position.set(ox-x,oy-y,0);
  if(ox===previousX&&oy===previousY)return;
  previousX=ox;previousY=oy;
  let n=0;
  for(let gx=ox-72;gx<=ox+72;gx+=9)for(let gy=oy-72;gy<=oy+72;gy+=9){
   if(n===capacity||random(gx,gy,2)<.46)continue;
   const wx=gx+6*random(gx,gy,3),wy=gy+6*random(gx,gy,4);
   const s=terrain.sample(wx,wy),clearance=s.road?Math.abs(s.road.distance)-s.road.width/2:Infinity;
   if(clearance<(preset==='flight'?15:4)||!['grass','rock','dirt'].includes(s.surface)&&!(preset==='yard'&&Math.abs(wy)>34)||Math.abs(wy)<(preset==='flight'?37:8))continue;
   const height=2.8+4.7*random(gx,gy,6),width=height*(preset==='mountain'?.21:.29);
   place(trunk,n,wx-ox,wy-oy,s.height+height*.37,height*.23,height*.74,height*.23);
   color.setHSL(.24+.08*random(gx,gy,7),.31+.18*random(gx,gy,8),.11+.09*random(gx,gy,9));
   for(let layer=0;layer<3;layer++){
    const shift=conifers?0:(layer-1)*width*.48;
    const radius=conifers?width*(1-layer*.23):width*(layer===1?.83:.64);
    const z=s.height+height*(conifers?.52+layer*.15:layer===1?.80:.70);
    place(crown,n*3+layer,wx-ox+shift,wy-oy+shift*.5,z,radius,height*(conifers?.25:.29),radius);
    crown.setColorAt(n*3+layer,color);
   }
   n++;
  }
  trunk.count=n;crown.count=n*3;
  trunk.instanceMatrix.needsUpdate=crown.instanceMatrix.needsUpdate=true;
  if(crown.instanceColor)crown.instanceColor.needsUpdate=true;
 },dispose(){for(const mesh of [trunk,crown]){mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();}root.removeFromParent();}};
}
