import {createDifferential,inverseRotorMass,recordDifferential} from './differential.js';
// Right handed x forward, y left, yaw positive counterclockwise.
export function createPlanar(){return {x:0,y:0,heading:0,u:0,v:0,r:0,Iz:60,steering:0};}
export function tireLateral(vx,vy,load,mu=.9){
 const alpha=Math.atan2(vy,Math.max(Math.abs(vx),.5));
 const fy=Math.max(-mu*load,Math.min(mu*load,-800*alpha));
 return {alpha,fy:fy||0};
}
export function contactVelocity(p,c){return {vx:p.u-p.r*c.y,vy:p.v+p.r*c.x};}
export function yawMoment(c,fx,fy){return c.x*fy-c.y*fx;}
function solve(a,b){
 const m=a.map((row,i)=>[...row,b[i]]),n=b.length;
 for(let j=0;j<n;j++){let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(m[i][j])>Math.abs(m[pivot][j]))pivot=i;[m[j],m[pivot]]=[m[pivot],m[j]];const d=m[j][j];if(Math.abs(d)<1e-14)throw new Error('Singular contact system');for(let k=j;k<=n;k++)m[j][k]/=d;for(let i=0;i<n;i++)if(i!==j){const f=m[i][j];for(let k=j;k<=n;k++)m[i][k]-=f*m[j][k];}}
 return m.map(row=>row[n]);
}
export function stepPlanar(p,corners,loads,mass,{drive=0,brake=0,steer=0}={},h=.001,diff=createDifferential()){
 const old=corners.map(c=>c.omega),B=inverseRotorMass(corners,diff);
 const target=Math.max(-.45,Math.min(.45,steer));
 p.steering+=Math.max(-1.2*h,Math.min(1.2*h,target-p.steering));
 const t=corners.map((c,i)=>{
  const delta=c.axle===0?p.steering:0,cos=Math.cos(delta),sin=Math.sin(delta);
  const local=contactVelocity(p,c);
  const vx=cos*local.vx+sin*local.vy,vy=-sin*local.vx+cos*local.vy;
  c.steering=delta;
  const lateral=tireLateral(vx,vy,loads[i],c.mu);
  c.drive=c.axle===1?drive/2:0;
  const free=c.omega+h*c.drive/c.inertia;
  c.brake=-Math.sign(free)*Math.min(brake,Math.abs(free)*c.inertia/h);
  return {cos,sin,vx,vy,lever:c.x*sin-c.y*cos,latLever:c.x*cos+c.y*sin,...lateral,torque:c.drive+c.brake,limit:Math.sqrt(Math.max(0,(c.mu*loads[i])**2-lateral.fy**2))};
 });
 // Lateral forces frozen at start; solve longitudinal slip implicitly with
 // full shared translation/yaw response, including steered force directions.
 const lateralFx=t.reduce((n,a)=>n-a.sin*a.fy,0),lateralFy=t.reduce((n,a)=>n+a.cos*a.fy,0);
 const lateralMz=t.reduce((n,a,i)=>n+a.latLever*a.fy,0);
 const A=t.map((a,i)=>t.map((b,j)=>h*((a.cos*b.cos+a.sin*b.sin)/mass+a.lever*b.lever/p.Iz)+h*corners[i].radius*B[i][j]*corners[j].radius+(i===j?1/corners[i].slipStiffness:0)));
 const rhs=t.map((a,i)=>corners[i].radius*(corners[i].omega+h*B[i].reduce((sum,b,j)=>sum+b*t[j].torque,0))-a.vx-h*((a.cos*lateralFx+a.sin*lateralFy)/mass+a.lever*lateralMz/p.Iz));
 let force;
 for(let code=0;code<3**corners.length;code++){
  let remaining=code;
  const modes=corners.map(()=>{const mode=[0,1,-1][remaining%3];remaining=Math.floor(remaining/3);return mode;});
  const m=A.map(row=>[...row]),r=[...rhs];
  modes.forEach((mode,i)=>{if(mode){m[i]=corners.map(()=>0);m[i][i]=1;r[i]=mode*t[i].limit;}});
  const f=solve(m,r);
  if(modes.every((mode,i)=>mode===0?Math.abs(f[i])<=t[i].limit+1e-9:mode*(rhs[i]-A[i].reduce((sum,a,j)=>sum+a*f[j],0))>=-1e-9)){force=f;break;}
 }
 if(!force)throw new Error('Planar contact unresolved');
 const acceleration=B.map(row=>row.reduce((sum,b,j)=>sum+b*(t[j].torque-corners[j].radius*force[j]),0));
 let fx=0,fy=0,mz=0;
 corners.forEach((c,i)=>{const a=t[i];c.fx=force[i]||0;c.fy=a.fy;c.alpha=a.alpha;c.normal=loads[i];c.slip=c.radius*c.omega-a.vx;c.utilization=loads[i]>0?Math.hypot(c.fx,c.fy)/(c.mu*loads[i]):0;
 const bx=a.cos*c.fx-a.sin*c.fy,by=a.sin*c.fx+a.cos*c.fy;fx+=bx;fy+=by;mz+=yawMoment(c,bx,by);
 c.omega+=h*acceleration[i];c.angle+=h*c.omega;
 });
 recordDifferential(diff,corners,old,acceleration,t.map(a=>a.torque),h,drive);
 // World-frame velocity update is equivalent to body Newton-Euler equations
 // (uDot=Fx/m+r*v, vDot=Fy/m-r*u), without an explicit Coriolis energy error.
 const co=Math.cos(p.heading),si=Math.sin(p.heading);
 const wx=co*p.u-si*p.v+h*(co*fx-si*fy)/mass,wy=si*p.u+co*p.v+h*(si*fx+co*fy)/mass;
 p.r+=h*mz/p.Iz;p.heading+=h*p.r;p.x+=h*wx;p.y+=h*wy;
 const cn=Math.cos(p.heading),sn=Math.sin(p.heading);p.u=cn*wx+sn*wy;p.v=-sn*wx+cn*wy;
 if(!Object.values(p).every(Number.isFinite))throw new Error('Nonfinite planar state');
}
