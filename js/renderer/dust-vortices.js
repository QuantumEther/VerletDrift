import {DUST_HISTORY_CAPACITY} from './dust-history.js';
// Read-only, bounded vortex shedding from the authoritative observation ring.
export const DUST_TRACERS=65536;
export const DUST_VORTICES=DUST_HISTORY_CAPACITY;
export const DUST_ELEMENT_BYTES=64;
export function buildDustTransport(h,time,bounds,poses,vortices){
 let count=0,n=0;
 for(let i=0;i<h.count;i++){
  const k=((h.head+i)%DUST_HISTORY_CAPACITY)*8,d=h.data,age=time-d[k+2];
  if(age<0||age>9.5)continue;
  const x=d[k],y=d[k+1],vx=d[k+4],vy=d[k+5],s=Math.hypot(vx,vy);
  if(x<bounds.left-14||x>bounds.right+14||y<bounds.top-14||y>bounds.bottom+14)continue;
  poses.set(d.subarray(k,k+8),count++*8);
  const tick=Math.round(d[k+2]*10);
  if(s<1||tick%2!==0)continue;
  const ax=vx/s,ay=vy/s,rx=-ay,ry=ax;
  const faceX=Math.sin(d[k+6]),faceY=-Math.cos(d[k+6]);
  const slip=(vx*-faceY+vy*faceX)/s,yaw=Math.max(-3,Math.min(3,d[k+7]));
  const span=1.05+Math.abs(slip)*.55,core=.72+Math.abs(slip)*.20;
  if(n+2>DUST_VORTICES){vortices.copyWithin(0,16);n-=2;}
  for(const side of [-1,1]){
   const imbalance=Math.max(.25,1+side*(slip*.65+yaw*.12+Math.sin(tick*1.37)*.16));
   vortices.set([x-ax*2.15+rx*span*side,y-ay*2.15+ry*span*side,d[k+2],
    side*Math.min(12,s*.34+Math.abs(yaw)*1.2)*imbalance,
    ax,ay,core,side],n++*8);
  }
 }
 return {poses:count,vortices:n};
}
