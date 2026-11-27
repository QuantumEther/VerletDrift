import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';
import {flightLanes} from './proving-ground.js';

// Survey paint mesh. Every vertex follows the authoritative surface and the
// whole facility stays world anchored when the road renderer shifts its origin.
export function createFacilityMarkings(scene,terrain){
 const positions=[];
 const vertex=(x,y)=>positions.push(x,y,terrain.sample(x,y).height+.022);
 function segment(ax,ay,bx,by,width){
  const length=Math.hypot(bx-ax,by-ay),dx=(by-ay)*width/(2*length),dy=(ax-bx)*width/(2*length);
  vertex(ax+dx,ay+dy);vertex(ax-dx,ay-dy);vertex(bx-dx,by-dy);
  vertex(ax+dx,ay+dy);vertex(bx-dx,by-dy);vertex(bx+dx,by+dy);
 }
 const preset=terrain.settings.preset;
 if(preset==='yard'){
  for(const radius of [5,10,17,24])for(let i=0;i<128;i++){
   const a=i*Math.PI/64,b=(i+1)*Math.PI/64;
   segment(66+radius*Math.cos(a),radius*Math.sin(a),66+radius*Math.cos(b),radius*Math.sin(b),.12);
  }
 }
 if(preset==='flight'){
  for(const lane of flightLanes){
   for(let x=36;x<151;x+=5){
    const long=x%10===6?.85:.38;
    for(const side of [-1,1])segment(x,lane.y+side*3.9,x,lane.y+side*(3.9-long),.12);
   }
   for(let offset=-3;offset<=3;offset+=.75){
    segment(lane.start,lane.y+offset,lane.start+.7,lane.y+offset,.2);
    segment(lane.start+lane.up+lane.down+14,lane.y+offset,lane.start+lane.up+lane.down+16,lane.y+offset,.18);
   }
  }
 }
 if(preset==='suspension'){
  for(const side of [-1,1])for(let x=7;x<80;x+=.14)segment(x,side*3.38,x+.14,side*3.38,.22);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:0xd7d2b8,roughness:.89,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
 const paint=new THREE.Mesh(geometry,material);
 paint.userData.noShadow=true;paint.visible=false;
 if(positions.length)scene.add(paint);
 return {update(x,y,visible){paint.visible=visible;paint.position.set(-x,-y,0);},dispose(){paint.removeFromParent();geometry.dispose();material.dispose();}};
}
