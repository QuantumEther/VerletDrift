import * as THREE from '../vendor/three.module.js';
import {MODULE} from './mechanical-layout.js';

// Approximate 20-degree involute outline, sampled once when building the scene.
// Decorative manufacturing geometry; it does not participate in dog collision.
export function gearGeometry(teeth,width=.055) {
  const pitch=teeth*MODULE/2,base=pitch*Math.cos(Math.PI/9),root=pitch-1.25*MODULE,tip=pitch+MODULE;
  const inv=a=>Math.tan(a)-a,half=r=>Math.PI/(2*teeth)+inv(Math.PI/9)-inv(Math.acos(Math.min(1,base/r)));
  const shape=new THREE.Shape();let first=true;
  const point=(r,a)=>{const x=r*Math.cos(a),y=r*Math.sin(a);if(first){shape.moveTo(x,y);first=false;}else shape.lineTo(x,y);};
  for(let i=0;i<teeth;i++) {
    const angle=i*2*Math.PI/teeth,low=Math.max(root,base),rootHalf=half(low);
    point(root,angle-rootHalf);
    for(let k=0;k<4;k++){const r=low+(tip-low)*k/3;point(r,angle-half(r));}
    point(tip,angle+half(tip));
    for(let k=3;k>=0;k--){const r=low+(tip-low)*k/3;point(r,angle+half(r));}
    point(root,angle+rootHalf);
  }
  shape.closePath();const hole=new THREE.Path();hole.absarc(0,0,.027,0,2*Math.PI,true);shape.holes.push(hole);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,curveSegments:24,steps:1});
  // Native XY outline / Z extrusion -> YZ outline / X extrusion, right-handed.
  geometry.translate(0,0,-width/2);geometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1));
  geometry.computeVertexNormals();return geometry;
}
export function dogGeometry(inner,outer,span,depth) {
  const shape=new THREE.Shape();shape.absarc(0,0,outer,-span/2,span/2,false);shape.absarc(0,0,inner,span/2,-span/2,true);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:6});geometry.translate(0,0,-depth/2);
  geometry.applyMatrix4(new THREE.Matrix4().set(0,0,1,0,1,0,0,0,0,1,0,0,0,0,0,1));return geometry;
}
