import {evaluate} from './vertical.js';
// Reference modal frequencies for the declared symmetric, undamped, all-contact
// linear model. Includes unsprung motion and tire compliance (two roots/mode).
export function modalFrequencies(s){
 return [[s.mass,4],[s.pitchInertia,s.corners.reduce((n,[x])=>n+x*x,0)],[s.rollInertia,s.corners.reduce((n,[,y])=>n+y*y,0)]].map(([mass,factor])=>{
  const k=s.ks*factor,t=s.kt*factor,u=s.wheelMass*factor;
  const a=k/mass+(k+t)/u,b=k*t/(mass*u),disc=Math.sqrt(a*a-4*b);
  return [Math.sqrt((a-disc)/2)/(2*Math.PI),Math.sqrt((a+disc)/2)/(2*Math.PI)];
 });
}
export function suspensionDiagnostics(s){
 const v=s.vertical,e=evaluate(v);let springEnergy=0,damperPower=0;
 const corners=v.corners.map(([x,y],i)=>{const compression=v.length-(v.q[0]+x*v.q[1]+y*v.q[2]-v.q[3+i]),relativeVelocity=v.v[0]+x*v.v[1]+y*v.v[2]-v.v[3+i],spring=v.ks*compression,damper=-v.damping*relativeVelocity;springEnergy+=.5*v.ks*compression**2;damperPower+=v.damping*relativeVelocity**2;return {normal:e.normal[i],compression,relativeVelocity,spring,damper};});
 return {corners,pitchDegrees:v.q[1]*180/Math.PI,rollDegrees:v.q[2]*180/Math.PI,pitchRate:v.v[1],rollRate:v.v[2],springEnergy,damperPower,verticalEnergy:e.energy,modalHz:modalFrequencies(v),lightDampingReference:modalDampingReference(v),ledger:s.verticalLedger};
}

// Light-damping modal projection, not exact roots of the damped coupled vehicle.
export function modalDampingReference(s){
 const factors=[4,s.corners.reduce((n,[x])=>n+x*x,0),s.corners.reduce((n,[,y])=>n+y*y,0)],masses=[s.mass,s.pitchInertia,s.rollInertia];
 return modalFrequencies(s).map((frequencies,i)=>frequencies.map(f=>{const w=2*Math.PI*f,k=s.ks*factors[i],ratio=(k-masses[i]*w*w)/k;return s.damping*factors[i]*(1-ratio)**2/(2*w*(masses[i]+s.wheelMass*factors[i]*ratio**2));}));
}
