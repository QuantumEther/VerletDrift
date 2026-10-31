// Experiment 11 suspension/gravity stage. Tire normal contact and tire elastic
// potential belong exclusively to the terrain-contact stage, never this RK step.
export {createVertical} from '../../four-corner-load-transfer/src/vertical.js';
export function evaluateSuspension(s,q=s.q,v=s.v){
 const mass=[s.mass,s.pitchInertia,s.rollInertia,...Array(4).fill(s.wheelMass)];
 const force=[-s.mass*s.g,0,0,...Array(4).fill(-s.wheelMass*s.g)];
 let springEnergy=0,gravityEnergy=s.mass*s.g*q[0],damperPower=0;
 const corners=s.corners.map(([x,y],i)=>{
  const compression=s.length-q[0]-x*q[1]-y*q[2]+q[3+i];
  const relativeVelocity=v[0]+x*v[1]+y*v[2]-v[3+i];
  const spring=s.ks*compression,damper=-s.damping*relativeVelocity,reaction=spring+damper;
  force[0]+=reaction;force[1]+=x*reaction;force[2]+=y*reaction;force[3+i]-=reaction;
  springEnergy+=.5*s.ks*compression**2;gravityEnergy+=s.wheelMass*s.g*q[3+i];damperPower+=s.damping*relativeVelocity**2;
  return {compression,relativeVelocity,spring,damper,reaction};
 });
 const kineticEnergy=v.reduce((e,w,i)=>e+.5*mass[i]*w*w,0);
 return {force,acceleration:force.map((f,i)=>f/mass[i]),corners,springEnergy,gravityEnergy,kineticEnergy,damperPower,energy:springEnergy+gravityEnergy+kineticEnergy};
}
export function stepSuspension(s,h=.001){
 if(!(h>0&&Number.isFinite(h)))throw Error('Invalid suspension timestep');
 const initial=evaluateSuspension(s),y=[...s.q,...s.v];
 const evaluate=y=>{const e=evaluateSuspension(s,y.slice(0,7),y.slice(7));return {derivative:[...y.slice(7),...e.acceleration],power:e.damperPower};};
 const at=(k,t)=>y.map((a,i)=>a+h*t*k.derivative[i]);
 const a=evaluate(y),b=evaluate(at(a,.5)),c=evaluate(at(b,.5)),d=evaluate(at(c,1));
 const next=y.map((v,i)=>v+h*(a.derivative[i]+2*b.derivative[i]+2*c.derivative[i]+d.derivative[i])/6);
 s.q=next.slice(0,7);s.v=next.slice(7);const final=evaluateSuspension(s),damperWork=h*(a.power+2*b.power+2*c.power+d.power)/6;
 return {...final,damperWork,energyResidual:final.energy-initial.energy+damperWork};
}
