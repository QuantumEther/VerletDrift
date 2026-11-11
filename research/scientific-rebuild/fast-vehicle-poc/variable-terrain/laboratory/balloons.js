import {createLiquid} from './balloon-liquid.js';
// Presentation-only collision events. Never mutates authoritative vehicle state.
export function sweptSphere(a,b,c,r){const d=b.map((v,i)=>v-a[i]),q=a.map((v,i)=>v-c[i]);const A=d.reduce((s,v)=>s+v*v,0),B=q.reduce((s,v,i)=>s+v*d[i],0),C=q.reduce((s,v)=>s+v*v,0)-r*r;if(C<=0)return 0;if(!A)return null;const D=B*B-A*C;if(D<0)return null;const t=(-B-Math.sqrt(D))/A;return t>=0&&t<=1?t:null;}
export class BalloonEvents{
 constructor(vehicle={}){this.visual=vehicle.visual??{};this.reset();}
 reset(count=24,min=.18,max=.48){count=Number.isFinite(count)?Math.floor(count):24;min=Number.isFinite(min)?Math.max(.08,Math.min(1,min)):.18;max=Number.isFinite(max)?Math.max(min,Math.min(1,max)):.48;this.time=null;this.items=Array.from({length:Math.min(128,Math.max(0,count))},(_,i)=>({x:6+i*2.8,y:((i%3)-1)*1.1,r:min+(max-min)*(i%3)/2,alive:true}));this.events=[];this.previous=null;}
 update(p,terrain){
  // Swept unions of body-envelope spheres and independently located wheels.
  // This follows pose and wheel positions; it is not triangle-mesh collision.
  const heading=p.planar.heading??0,cs=Math.cos(heading),sn=Math.sin(heading);
  const front=this.visual.front??2.1,rear=this.visual.rear??-2.1,radius=(this.visual.width??1.6)/2;
  const local=Array.from({length:4},(_,i)=>[rear+radius+(front-rear-2*radius)*i/3,0,.2,radius]);
  const current=local.map(([x,y,z,r])=>({p:[p.planar.x+cs*x-sn*y,p.planar.y+sn*x+cs*y,p.z+z+x*(p.pitch??0)+y*(p.roll??0)],r}));
  for(const w of p.wheels??[])current.push({p:[...w.position],r:w.radius});
  const old=this.previous;this.previous=current;if(!old||p.time<this.time){this.time=p.time;return;}const dt=p.time-this.time;this.time=p.time;if(!(dt>0)||dt>.25||old.length!==current.length)return;
  for(const b of this.items){if(!b.alive)continue;const z=terrain.sample(b.x,b.y).height+b.r;let first=null,collider=-1;
   current.forEach((c,i)=>{const hit=sweptSphere(old[i].p,c.p,[b.x,b.y,z],b.r+c.r);if(hit!==null&&(first===null||hit<first)){first=hit;collider=i;}});
   if(first!==null){const c=current[collider],o=old[collider],velocity=c.p.map((v,i)=>(v-o.p[i])/dt),speed=Math.hypot(...velocity);b.alive=false;this.events.push({x:b.x,y:b.y,z,r:b.r,time:p.time-dt+first*dt,speed,velocity,volume:4*Math.PI*b.r**3/3});if(this.events.length>128)this.events.shift();}
  }
 }

}
export function createBalloons(T,scene,terrain,materials,vehicle={}){const liquid=createLiquid(T,scene,terrain,materials),state=new BalloonEvents(vehicle),group=new T.Group();scene.add(group);const geo=new T.SphereGeometry(1,20,12),mat=new T.MeshPhysicalMaterial({color:0x980c30,roughness:.19,metalness:.05,clearcoat:1});const mesh=new T.InstancedMesh(geo,mat,128),matrix=new T.Matrix4(),position=new T.Vector3(),scale=new T.Vector3(),rotation=new T.Quaternion();group.add(mesh);function draw(p){state.update(p,terrain);liquid.draw(p,state.events);let n=0;for(const b of state.items){if(!b.alive)continue;position.set(b.x-p.planar.x,b.y-p.planar.y,terrain.sample(b.x,b.y).height+b.r*1.12);scale.set(b.r,b.r,b.r*1.12);matrix.compose(position,rotation,scale);mesh.setMatrixAt(n++,matrix);}mesh.count=n;mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;}return {draw,configure:(v={})=>{state.reset(v.count??24,v.min??.18,v.max??.48);liquid.configure(v);},info:()=>({alive:state.items.filter(b=>b.alive).length,impacts:state.events.length,liquid:liquid.info(),stage:'analytic droplet and wet-patch prototype; swept body-envelope and wheel spheres'}),dispose(){liquid.dispose();materials?.dispose();geo.dispose();mat.dispose();group.removeFromParent();}};}
