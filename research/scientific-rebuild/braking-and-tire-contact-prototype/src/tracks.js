import {captureContacts} from './contact-observation.js';
export const DEPOSITION=Object.freeze({spacing:.04,width:.18,footprint:.12,minLoad:5,minSlip:.5,minWork:.5,
 workPerArea:200,maxOpacity:.7,minOpacity:.035,maxJump:1,maxGap:.020001});
export class Ring {
 constructor(capacity){if(!(Number.isInteger(capacity)&&capacity>1))throw Error('Invalid history capacity');this.capacity=capacity;this.items=Array(capacity).fill(null);this.cursor=0;this.count=0;}
 push(item){const i=this.cursor;this.items[i]=item;this.cursor=(i+1)%this.capacity;this.count=Math.min(this.count+1,this.capacity);return i;}
 *values(){for(let n=0;n<this.count;n++)yield this.items[(this.cursor-this.count+n+this.capacity)%this.capacity];}
 clear(){this.items.fill(null);this.cursor=this.count=0;}
}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
export function depositionOpacity(work,area,load){return DEPOSITION.maxOpacity*(1-Math.exp(-Math.max(0,work)/(DEPOSITION.workPerArea*area)))*Math.min(1,Math.max(0,load)/250);}
export class TireObservatory {
 constructor({capacity=1024,pathCapacity=2048}={}){
  this.capacity=capacity;this.marks=Array.from({length:4},()=>new Ring(capacity));this.paths=Array.from({length:4},()=>new Ring(pathCapacity));this.center=new Ring(pathCapacity);
  this.events=new Uint32Array(4*capacity);this.revision=0;this.generation=0;this.latest=[];this.totalWork=[0,0,0,0];this.recent=[0,0,0,0];this.acceptedStages=0;this.acceptedTime=0;
  this.pending=Array.from({length:4},()=>({}));this.lastTime=null;this.lastCenter=null;this.capture=captureContacts;
 }
 dirty(wheel,slot){this.events[this.revision%this.events.length]=wheel*this.capacity+slot;this.revision++;}
 changesSince(revision){if(revision>this.revision||this.revision-revision>this.events.length)return null;const set=new Set();for(let n=revision;n<this.revision;n++)set.add(this.events[n%this.events.length]);return [...set];}
 breakContinuity(){this.pending=Array.from({length:4},()=>({}));this.lastTime=null;this.lastCenter=null;this.latest=[];this.recent.fill(0);}
 clear(){this.marks.forEach(r=>r.clear());this.paths.forEach(r=>r.clear());this.center.clear();this.generation++;this.revision=0;this.events.fill(0);this.pending=Array.from({length:4},()=>({}));this.lastTime=null;this.lastCenter=null;}
 accept(samples){for(const sample of samples)this.record(sample);}
 record({start,end,h}){
  if(!(h>0&&Number.isFinite(h)&&Number.isFinite(end.time)))throw Error('Invalid observational stage');
  const discontinuity=this.lastTime===null||Math.abs(start.time-this.lastTime)>1e-8||h>DEPOSITION.maxGap||dist(start.center,end.center)>DEPOSITION.maxJump||this.lastCenter&&dist(this.lastCenter,start.center)>1e-5;
  if(discontinuity){this.pending=Array.from({length:4},()=>({}));this.lastCenter=null;}
  const oldCenter=this.center.count?this.center.items[(this.center.cursor-1+this.center.capacity)%this.center.capacity]:null;
  if(!oldCenter||discontinuity||dist(oldCenter,end.center)>=.08)this.center.push({...end.center,time:end.time,breakBefore:discontinuity});
  this.acceptedStages++;this.acceptedTime+=h;
  end.wheels.forEach((c,i)=>{
   const rawWork=c.power*h;this.totalWork[i]+=rawWork;this.recent[i]=this.recent[i]*Math.exp(-h/.1)+Math.max(0,rawWork);
   this.latest[i]={...c,time:end.time,forceStageOmega:c.omega,totalWork:this.totalWork[i],recentWork:this.recent[i],significantSliding:c.supported&&c.slidingSpeed>=DEPOSITION.minSlip&&this.recent[i]>=DEPOSITION.minWork,
    warning:c.power< -1e-7?'NEGATIVE CONTACT DISSIPATION':c.supported&&!c.geometryContact?'Axle-load / footprint geometry disagreement':null};
   const path=this.paths[i],previous=path.count?path.items[(path.cursor-1+path.capacity)%path.capacity]:null;
   if(!previous||discontinuity||dist(previous,c.position)>=.08)path.push({...c.position,time:end.time,breakBefore:discontinuity});
   const q=this.pending[i],point=c.position;
   const qualifies=c.supported&&c.geometryContact&&c.normal>=DEPOSITION.minLoad&&c.slidingSpeed>=DEPOSITION.minSlip&&c.power>=-1e-7;
   if(!qualifies){this.pending[i]={};return;}
   if(!q.anchor){q.anchor={...point};q.energy=0;q.episodeWork=0;q.normal=null;q.stamp=null;q.stampEnergy=0;}
   q.energy+=Math.max(0,rawWork);q.episodeWork+=Math.max(0,rawWork);
   if(q.episodeWork<DEPOSITION.minWork)return;
   const d=dist(q.anchor,point);
   if(d>DEPOSITION.maxJump){this.pending[i]={};return;}
   if(d>=DEPOSITION.spacing){
    const n=Math.floor(d/DEPOSITION.spacing);if(n>32){this.pending[i]={};return;}
    const origin=q.anchor,energyPerMeter=q.energy/d,dx=(point.x-origin.x)/d,dy=(point.y-origin.y)/d,normal={x:-dy,y:dx};
    for(let j=1;j<=n;j++){
     const b=lerp(origin,point,j*DEPOSITION.spacing/d),a=q.anchor;
     const startNormal=q.normal&&q.normal.x*normal.x+q.normal.y*normal.y>.25?q.normal:normal;
     const work=energyPerMeter*DEPOSITION.spacing,alpha=depositionOpacity(work,DEPOSITION.width*DEPOSITION.spacing,c.normal);
     if(alpha>=DEPOSITION.minOpacity){const slot=this.marks[i].push({kind:'strip',a:{...a},b:{...b},na:{...startNormal},nb:{...normal},alpha,work,load:c.normal,wheel:i});this.dirty(i,slot);}
     q.anchor=b;q.normal=normal;
    }
    q.energy=energyPerMeter*dist(q.anchor,point);q.stamp=null;q.stampEnergy=0;
   }else if(d<.002){
    q.stampEnergy+=q.energy;q.energy=0;
    const alpha=depositionOpacity(q.stampEnergy,DEPOSITION.width*DEPOSITION.footprint,c.normal);
    if(alpha>=DEPOSITION.minOpacity){
     if(q.stamp===null){const cs=Math.cos(c.heading),sn=Math.sin(c.heading),half=DEPOSITION.footprint/2;
      q.stamp=this.marks[i].push({kind:'imprint',a:{x:point.x-half*cs,y:point.y-half*sn,z:point.z},b:{x:point.x+half*cs,y:point.y+half*sn,z:point.z},na:{x:-sn,y:cs},nb:{x:-sn,y:cs},alpha,work:q.stampEnergy,load:c.normal,wheel:i});this.dirty(i,q.stamp);
     }else{const stamp=this.marks[i].items[q.stamp];stamp.work=q.stampEnergy;if(alpha-stamp.alpha>1e-4){stamp.alpha=alpha;this.dirty(i,q.stamp);}}
    }
   }
  });
  this.lastTime=end.time;this.lastCenter={...end.center};
 }
 stats(){return {capacityPerWheel:this.capacity,markCount:this.marks.map(r=>r.count),pathCount:this.paths.map(r=>r.count),centerCount:this.center.count,
  eventBytes:this.events.byteLength,revision:this.revision,generation:this.generation,acceptedStages:this.acceptedStages,acceptedTime:this.acceptedTime,totalSlipWork:[...this.totalWork]};}
}
