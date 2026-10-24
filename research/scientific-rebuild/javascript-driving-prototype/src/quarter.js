import {createWheel, stepWheel} from './wheel.js';
export function createQuarter({sprungMass=40, unsprungMass=12, radius=.32, ...wheelOptions}={}) {
  const q={ms:sprungMass,mu:unsprungMass,ks:4000,cs:160,kt:40000,ct:180,L0:.6,g:9.81,time:0,bumpStart:-Infinity};
  q.zu=radius-(q.ms+q.mu)*q.g/q.kt;
  q.zs=q.zu+q.L0-q.ms*q.g/q.ks; q.vs=q.vu=0;
  q.wheel=createWheel({...wheelOptions,mass:q.ms+q.mu,radius});
  q.wheel.normalLoad=forces(q).normal;
  return q;
}
export function road(q,t=q.time) {
  const u=(t-q.bumpStart)/.4;
  return u>0&&u<1 ? {height:.08*Math.sin(Math.PI*u)**2,velocity:.08*Math.PI/.4*Math.sin(2*Math.PI*u)} : {height:0,velocity:0};
}
export function forces(q,state=[q.zs,q.vs,q.zu,q.vu],t=q.time) {
  const [zs,vs,zu,vu]=state,r=road(q,t);
  const compression=q.L0-(zs-zu), spring=q.ks*compression, damper=-q.cs*(vs-vu);
  const delta=Math.max(0,q.wheel.radius+r.height-zu);
  const tireSpring=q.kt*delta, tireDamper=delta>0?-q.ct*(vu-r.velocity):0;
  const normal=delta>0?Math.max(0,tireSpring+tireDamper):0;
  return {spring,damper,suspension:spring+damper,compression,delta,tireSpring,tireDamper,normal,contact:normal>0,road:r};
}
export function stepQuarter(q,ports={},h=.001) {
  const y=[q.zs,q.vs,q.zu,q.vu];
  const derivative=(s,t)=>{const f=forces(q,s,t);return [s[1],f.suspension/q.ms-q.g,s[3],(f.normal-f.suspension)/q.mu-q.g];};
  const add=(a,b,k)=>a.map((v,i)=>v+k*b[i]);
  const a=derivative(y,q.time),b=derivative(add(y,a,h/2),q.time+h/2),c=derivative(add(y,b,h/2),q.time+h/2),d=derivative(add(y,c,h),q.time+h);
  [q.zs,q.vs,q.zu,q.vu]=y.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
  q.time+=h;
  // Explicit partition: vertical RK4 ends first; its new N drives one implicit longitudinal step.
  q.wheel.normalLoad=forces(q).normal;
  const result=stepWheel(q.wheel,ports,h);
  if (![q.zs,q.vs,q.zu,q.vu,q.wheel.x,q.wheel.velocity,q.wheel.omega].every(Number.isFinite)) throw new Error('Nonfinite quarter state');
  return result;
}
export function verticalEnergy(q) {
  const f=forces(q);
  return .5*q.ms*q.vs**2+.5*q.mu*q.vu**2+.5*q.ks*f.compression**2+.5*q.kt*f.delta**2+q.g*(q.ms*q.zs+q.mu*q.zu);
}
