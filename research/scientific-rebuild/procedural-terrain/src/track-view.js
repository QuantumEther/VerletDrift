import * as THREE from '../../tire-road-observatory-prototype/vendor/three.module.js';
import {DEPOSITION} from './tracks.js';
import {terrainSampler} from './application-vehicle.js';
// World-anchored marks sample the same analytic terrain as contact. The
// bounded display mesh interpolates those elevations between its vertices.
export function displayedRoadHeight(x,bump,y=0){return terrainSampler().sample(x,y).height;}
export function createTrackView(scene,capacity=1024){
 const positions=new Float32Array(4*capacity*18),colors=new Float32Array(4*capacity*24),uvs=new Float32Array(4*capacity*12);
 for(let n=0;n<4*capacity;n++)uvs.set([0,0,1,0,0,1,0,1,1,0,1,1],n*12);
 const occupied=new Uint8Array(4*capacity),indices=4*capacity*6<65536?new Uint16Array(4*capacity*6):new Uint32Array(4*capacity*6);let activeCount=0;
 const index=new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage);
 const geometry=new THREE.BufferGeometry(),pos=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage),color=new THREE.BufferAttribute(colors,4).setUsage(THREE.DynamicDrawUsage);
 geometry.setIndex(index);geometry.setDrawRange(0,0);geometry.setAttribute('position',pos);geometry.setAttribute('shade',color);geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
 const roadCenter=new THREE.Vector2();
 const material=new THREE.ShaderMaterial({uniforms:{roadCenter:{value:roadCenter}},transparent:true,depthWrite:false,side:THREE.DoubleSide,
 vertexShader:'attribute vec4 shade; varying vec4 vShade; varying vec2 vUv; varying vec2 groundXY; void main(){groundXY=(modelMatrix*vec4(position,1.)).xy;vShade=shade;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec2 roadCenter; varying vec4 vShade; varying vec2 vUv; varying vec2 groundXY; void main(){if(any(greaterThan(abs(groundXY-roadCenter),vec2(20.))))discard;float edge=smoothstep(0.,.1,vUv.x)*smoothstep(0.,.1,1.-vUv.x); gl_FragColor=vec4(vShade.rgb,vShade.a*edge);}' });
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=2;scene.add(mesh);
 let source,last=-1,generation=-1,bump,originX=0,originY=0,updates=0,uploadedVertices=0;
 function write(slot,record){
  if(!record){positions.fill(0,slot*18,slot*18+18);colors.fill(0,slot*24,slot*24+24);return;}
  const {a,b,na,nb,alpha}=record,r=DEPOSITION.width/2;
  const corners=[[a.x+na.x*r,a.y+na.y*r],[a.x-na.x*r,a.y-na.y*r],[b.x+nb.x*r,b.y+nb.y*r],[b.x-nb.x*r,b.y-nb.y*r]];
  const order=[0,1,2,2,1,3];order.forEach((n,i)=>{const [x,y]=corners[n];positions.set([x-originX,y-originY,displayedRoadHeight(x,bump,y)+.006],slot*18+i*3);colors.set([.035,.028,.020,alpha],slot*24+i*4);});
 }
 function draw(state,observatory,visible){
  if(!observatory||!visible){mesh.visible=false;return;}
  if(observatory.capacity!==capacity)throw Error('Track renderer/history budget mismatch');
  const ox=Math.round(state.planar.x/1000)*1000,oy=Math.round(state.planar.y/1000)*1000;
  const full=source!==observatory||generation!==observatory.generation||bump!==state.bump||ox!==originX||oy!==originY;
  const reset=source!==observatory||generation!==observatory.generation;if(reset){occupied.fill(0);activeCount=0;}
  bump=state.bump;originX=ox;originY=oy;const changed=full?null:observatory.changesSince(last);
  const slots=changed===null?Array.from({length:4*capacity},(_,i)=>i):changed;
  const oldActive=activeCount;
  for(const slot of slots){const record=observatory.marks[Math.floor(slot/capacity)].items[slot%capacity];write(slot,record);if(record&&!occupied[slot]){occupied[slot]=1;for(let j=0;j<6;j++)indices[activeCount*6+j]=slot*6+j;activeCount++;}}
  if(activeCount!==oldActive||reset){index.clearUpdateRanges();index.addUpdateRange(oldActive*6,(activeCount-oldActive)*6);index.needsUpdate=true;geometry.setDrawRange(0,activeCount*6);}
  if(slots.length){pos.clearUpdateRanges();color.clearUpdateRanges();
   // Only dirty vertices upload in steady state; rare clear/terrain/origin changes
   // rebuild the fixed buffer once. Coalesce ranges to bound driver calls.
   const sorted=[...slots].sort((a,b)=>a-b);let lo=sorted[0],hi=lo;
   const range=()=>{pos.addUpdateRange(lo*18,(hi-lo+1)*18);color.addUpdateRange(lo*24,(hi-lo+1)*24);};
   for(let i=1;i<sorted.length;i++){if(sorted[i]<=hi+1)hi=sorted[i];else{range();lo=hi=sorted[i];}}range();pos.needsUpdate=color.needsUpdate=true;updates++;uploadedVertices+=slots.length*6;
  }
  source=observatory;last=observatory.revision;generation=observatory.generation;roadCenter.set(Math.floor(state.planar.x)-state.planar.x,Math.floor(state.planar.y)-state.planar.y);mesh.position.set(originX-state.planar.x,originY-state.planar.y,0);mesh.visible=visible&&observatory.marks.some(r=>r.count>0);
 }
 return {draw,info:()=>({updates,uploadedVertices,bytes:positions.byteLength+colors.byteLength+uvs.byteLength+indices.byteLength+occupied.byteLength,activePrimitives:activeCount,maxPrimitives:4*capacity,maxVertices:4*capacity*6,visible:mesh.visible,origin:[originX,originY]}),geometry,material};
}

export function drawTracks2D(ctx,observatory,p,{marks=true,center=true,paths=false,slips=false}={},scale=85,width=1000,height=590){
 const screen=a=>[width/2+(a.x-p.x)*scale,height/2-(a.y-p.y)*scale];
 if(marks){for(const ring of observatory.marks)for(const r of ring.values()){
  const a=screen(r.a),b=screen(r.b);if((a[0]<-50&&b[0]<-50)||(a[0]>width+50&&b[0]>width+50)||(a[1]<-50&&b[1]<-50)||(a[1]>height+50&&b[1]>height+50))continue;
  const k=DEPOSITION.width/2*scale;ctx.fillStyle=`rgba(7,6,4,${r.alpha})`;ctx.beginPath();ctx.moveTo(a[0]+r.na.x*k,a[1]-r.na.y*k);ctx.lineTo(a[0]-r.na.x*k,a[1]+r.na.y*k);ctx.lineTo(b[0]-r.nb.x*k,b[1]+r.nb.y*k);ctx.lineTo(b[0]+r.nb.x*k,b[1]-r.nb.y*k);ctx.closePath();ctx.fill();
 }}
 const path=(ring,color)=>{ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();let first=true;for(const a of ring.values()){const [x,y]=screen(a);if(first||a.breakBefore)ctx.moveTo(x,y);else ctx.lineTo(x,y);first=false;}ctx.stroke();};
 if(center)path(observatory.center,'#d5ba78');if(paths)observatory.paths.forEach((r,i)=>path(r,['#a3c8c0','#839ed2','#c49170','#ad88b2'][i]));
 if(slips)for(const c of observatory.latest){if(!c.supported)continue;const a=screen(c.position),co=Math.cos(c.forceHeading),si=Math.sin(c.forceHeading);ctx.strokeStyle='#adcdc2';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(a[0]+(co*c.sx-si*c.sy)*8,a[1]-(si*c.sx+co*c.sy)*8);ctx.stroke();}
}
