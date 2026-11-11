import {createSplashSheets} from './splash-sheets.js';
// Artistic momentum transfer, bounded by impact speed. Not a fluid simulation.
export function droplet(e,index,age){
 const a=index*2.39996323,spread=e.r*(1.8+Math.min(35,e.speed)*.12),radial=spread*(.6+(index%7)/10),transfer=.1;
 return {x:e.x+(Math.cos(a)*radial+(e.velocity?.[0]??0)*transfer)*age,y:e.y+(Math.sin(a)*radial+(e.velocity?.[1]??0)*transfer)*age,z:e.z+(2.4+(index%5)*.35)*Math.sqrt(e.r)*age-4.905*age*age,r:e.r*(.045+.008*(index%4))};
}
export function wetness(age,persistence){return Math.exp(-Math.max(0,age)/Math.max(1,persistence));}
export function landing(e,index,terrain){
 let previous=0; // First crossing, including uneven terrain. Bounded 60 brackets.
 for(let t=.05;t<=3.00001;t+=.05){const d=droplet(e,index,t);if(d.z<=terrain.sample(d.x,d.y).height){let lo=previous,hi=t;for(let k=0;k<14;k++){const mid=(lo+hi)/2,v=droplet(e,index,mid);if(v.z>terrain.sample(v.x,v.y).height)lo=mid;else hi=mid;}return {...droplet(e,index,hi),flight:hi};}previous=t;}return null;
}
export function createLiquid(T,scene,terrain,materials){
 const sheets=createSplashSheets(T,scene,materials),root=new T.Group();scene.add(root);
 const sphere=new T.SphereGeometry(1,8,6),dropMat=materials?.drop??new T.MeshPhysicalMaterial({color:0xa00b30,roughness:.12,clearcoat:1});
 const drops=new T.InstancedMesh(sphere,dropMat,2048);drops.renderOrder=4;drops.frustumCulled=false;root.add(drops);
 const capacity=4096,grid=4,per=25,positions=new Float32Array(capacity*per*3),normals=new Float32Array(capacity*per*3),uv=new Float32Array(capacity*per*2),colors=new Float32Array(capacity*per*3),born=new Float32Array(capacity*per),indices=new Uint32Array(capacity*grid*grid*6);
 for(let k=0;k<capacity;k++){for(let j=0;j<per;j++){uv[(k*per+j)*2]=(j%5)/4;uv[(k*per+j)*2+1]=Math.floor(j/5)/4;}let n=k*96;for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){const a=k*per+y*5+x;indices.set([a,a+1,a+5,a+1,a+6,a+5],n);n+=6;}}
 const geometry=new T.BufferGeometry(),positionAttribute=new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage),colorAttribute=new T.BufferAttribute(colors,3).setUsage(T.DynamicDrawUsage),bornAttribute=new T.BufferAttribute(born,1).setUsage(T.DynamicDrawUsage);
 const normalAttribute=new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage);geometry.setAttribute('normal',normalAttribute);geometry.setAttribute('position',positionAttribute);geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometry.setAttribute('color',colorAttribute);geometry.setAttribute('liquidBorn',bornAttribute);geometry.setIndex(new T.BufferAttribute(indices,1));geometry.setDrawRange(0,0);
 const patchMat=materials?.patch??new T.MeshPhysicalMaterial({color:0x8b1031,roughness:.15,clearcoat:1,vertexColors:true,transparent:true,opacity:.7,depthWrite:false,side:T.DoubleSide});
 const patches=new T.Mesh(geometry,patchMat);patches.renderOrder=2.5;patches.frustumCulled=false;root.add(patches);
 const matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),q=new T.Quaternion();let cache=new WeakMap(),intensity=1,persistence=90,count=0,cursor=0,lastTime=-Infinity,terrainSamples=0;let counts={droplets:0,patches:0,sheets:0};
 function addPatch(e,index,hit){const slot=cursor++%capacity;count=Math.min(capacity,count+1);const radius=e.r*(index===16?1.8:.32+(index%4)*.12)*intensity,angle=index*2.39996,c=Math.cos(angle),s=Math.sin(angle),tint=.8+(index%7)*.025;
  for(let j=0;j<per;j++){const u=(j%5)/2-1,v=Math.floor(j/5)/2-1,x=hit.x+radius*(c*u-s*v*.75),y=hit.y+radius*(s*u+c*v*.75),g=terrain.sample(x,y);terrainSamples++;const gx=g.gradient?.[0]??0,gy=g.gradient?.[1]??0,mag=Math.hypot(gx,gy,1);normals.set([-gx/mag,-gy/mag,1/mag],(slot*per+j)*3);positions.set([x,y,g.height+.008],(slot*per+j)*3);colors.set([tint,tint,tint],(slot*per+j)*3);born[slot*per+j]=e.time+hit.flight;}
  normalAttribute.addUpdateRange(slot*per*3,per*3);positionAttribute.addUpdateRange(slot*per*3,per*3);colorAttribute.addUpdateRange(slot*per*3,per*3);bornAttribute.addUpdateRange(slot*per,per);
 }
 function draw(p,events){if(p.time<lastTime)clear();lastTime=p.time;sheets.draw(p,events);let nd=0,dirty=false;
  for(const e of events){const age=p.time-e.time;if(age<0)continue;let cached=cache.get(e);if(!cached){cached=Array.from({length:16},(_,i)=>({hit:landing(e,i,terrain),deposited:false}));const h=terrain.sample(e.x,e.y).height;cached.push({hit:{x:e.x,y:e.y,flight:Math.sqrt(Math.max(0,2*(e.z-h)/9.81))},deposited:false});cache.set(e,cached);}
   for(let i=0;i<cached.length;i++){const record=cached[i];if(!record.hit)continue;if(age<record.hit.flight&&i<16&&nd<2048){const d=droplet(e,i,age);position.set(d.x-p.planar.x,d.y-p.planar.y,d.z);scale.set(d.r*intensity,d.r*intensity,d.r*intensity*(1+Math.min(1,age)));matrix.compose(position,q,scale);drops.setMatrixAt(nd++,matrix);}else if(age>=record.hit.flight&&!record.deposited){addPatch(e,i,record.hit);record.deposited=true;dirty=true;}}
  }
  drops.count=nd;if(nd)drops.instanceMatrix.needsUpdate=true;patches.position.set(-p.planar.x,-p.planar.y,0);if(dirty){normalAttribute.needsUpdate=positionAttribute.needsUpdate=colorAttribute.needsUpdate=bornAttribute.needsUpdate=true;geometry.setDrawRange(0,count*96);}
  patchMat.userData.update?.(p.time,persistence);counts={droplets:nd,patches:count,sheets:sheets.info().active,terrainVertexSamples:terrainSamples,maxPatches:capacity,drawCalls:(nd?1:0)+(count?1:0)+(sheets.info().active?2:0)};
 }
 function clear(){cache=new WeakMap();count=cursor=0;geometry.setDrawRange(0,0);drops.count=0;}
 return {draw,clear,configure(v){intensity=Math.max(.1,Math.min(3,Number(v.intensity)||1));persistence=Math.max(1,Math.min(600,Number(v.persistence)||90));clear();},info:()=>counts,dispose(){sheets.dispose();sphere.dispose();geometry.dispose();if(!materials){dropMat.dispose();patchMat.dispose();}root.removeFromParent();}};
}
