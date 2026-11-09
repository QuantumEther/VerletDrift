// Visual-only coarse outer terrain. The contact sampler remains authoritative.
import * as THREE from '../../../tire-road-observatory-prototype/vendor/three.module.js';
export function createLandscape(scene,terrain){
 const radii=[20,28,40,60,90,140],segments=64,ring=segments*4,positions=[],indices=[],colors=[];
 for(const radius of radii)for(let side=0;side<4;side++)for(let j=0;j<segments;j++){
  const t=-1+2*j/segments,xy=[[1,t],[-t,1],[-1,-t],[t,-1]][side];positions.push(xy[0]*radius,xy[1]*radius,0);colors.push(1,1,1);
 }
 for(let r=0;r<radii.length-1;r++)for(let j=0;j<ring;j++){const a=r*ring+j,b=r*ring+(j+1)%ring,c=a+ring,d=b+ring;indices.push(a,c,b,b,c,d);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));mesh.userData.noShadow=true;mesh.visible=false;scene.add(mesh);let ox=NaN,oy=NaN,updates=0;
 const color=new THREE.Color(),palette={asphalt:0x44494d,gravel:0x8b8172,dirt:0x756044,grass:0x547448};
 return {update(x,y,originX,originY,enabled){mesh.visible=enabled;if(!enabled)return;mesh.position.set(originX-x,originY-y,0);if(ox===originX&&oy===originY)return;ox=originX;oy=originY;const a=geometry.attributes.position,c=geometry.attributes.color;
  for(let i=0;i<a.count;i++){const wx=a.getX(i)+ox,wy=a.getY(i)+oy,s=terrain.sample(wx,wy);a.setZ(i,s.height);if(terrain.paint){const p=terrain.paint(wx,wy);color.setRGB(p[0]/255,p[1]/255,p[2]/255,THREE.SRGBColorSpace);}else color.setHex(palette[s.surface]??palette.grass);c.setXYZ(i,color.r,color.g,color.b);}a.needsUpdate=c.needsUpdate=true;geometry.computeVertexNormals();updates++;},info:()=>({visible:mesh.visible,updates,vertices:geometry.attributes.position.count,triangles:indices.length/3,outerExtent:140})};
}
