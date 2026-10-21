// Bounded read-only airflow observations, never physics or RNG writes.
export const DUST_HISTORY_CAPACITY=96;
export const DUST_SAMPLE_INTERVAL=.1;
const ring=new Float32Array(DUST_HISTORY_CAPACITY*8);
let head=0,count=0,serial=0,generation=0,previous=null,next=0;
export function resetDustHistory(){head=count=serial=0;generation++;previous=null;next=0;}
export function observeDust(body,time,enabled=true){
 if(!Number.isFinite(time)||![body.centerX,body.centerY,body.velocityX,body.velocityY,body.heading,body.angularVelocity].every(Number.isFinite))return;
 const current=[body.centerX,body.centerY,body.velocityX,body.velocityY,body.heading,body.angularVelocity,time];
 if(previous&&(time<previous[6]||Math.hypot(current[0]-previous[0],current[1]-previous[1])>25))resetDustHistory();
 if(!previous){previous=current;next=Math.ceil((time-1e-8)/DUST_SAMPLE_INTERVAL)*DUST_SAMPLE_INTERVAL;}
 if(!enabled){previous=current;next=time+DUST_SAMPLE_INTERVAL;return;}
 next=Math.max(next,Math.ceil((time-DUST_HISTORY_CAPACITY*DUST_SAMPLE_INTERVAL)/DUST_SAMPLE_INTERVAL)*DUST_SAMPLE_INTERVAL);
 while(next<=time+1e-8){
  const f=time>previous[6]?Math.max(0,Math.min(1,(next-previous[6])/(time-previous[6]))):1;
  const vx=previous[2]+(current[2]-previous[2])*f,vy=previous[3]+(current[3]-previous[3])*f;
  if(Math.hypot(vx,vy)>.4||Math.abs(current[5])>.2){
   const slot=(head+count)%DUST_HISTORY_CAPACITY;
   let turn=(current[4]-previous[4]+Math.PI)%(2*Math.PI);if(turn<0)turn+=2*Math.PI;turn-=Math.PI;
   ring.set([previous[0]+(current[0]-previous[0])*f,previous[1]+(current[1]-previous[1])*f,next,0,
    vx,vy,previous[4]+turn*f,previous[5]+(current[5]-previous[5])*f],slot*8);
   if(count<DUST_HISTORY_CAPACITY)count++;else head=(head+1)%DUST_HISTORY_CAPACITY;
   serial++;
  }
  next+=DUST_SAMPLE_INTERVAL;
 }
 previous=current;
}
export function dustHistory(){return {data:ring,head,count,serial,generation};}
