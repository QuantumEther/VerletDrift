import {evaluate} from './vertical.js';
// Reference modal frequencies for the declared symmetric, undamped, all-contact
// linear model. Includes unsprung motion and tire compliance (two roots/mode).
export function modalFrequencies(s){
 return [[s.mass,4],[s.pitchInertia,4],[s.rollInertia,1.44]].map(([mass,factor])=>{
  const k=s.ks*factor,t=s.kt*factor,u=s.wheelMass*factor;
  const a=k/mass+(k+t)/u,b=k*t/(mass*u),disc=Math.sqrt(a*a-4*b);
  return [Math.sqrt((a-disc)/2)/(2*Math.PI),Math.sqrt((a+disc)/2)/(2*Math.PI)];
 });
}
export function suspensionDiagnostics(s){
 const v=s.vertical,e=evaluate(v);let springEnergy=0,damperPower=0;
 const corners=v.corners.map(([x,y],i)=>{const compression=v.length-(v.q[0]+x*v.q[1]+y*v.q[2]-v.q[3+i]),relativeVelocity=v.v[0]+x*v.v[1]+y*v.v[2]-v.v[3+i],spring=v.ks*compression,damper=-v.damping*relativeVelocity;springEnergy+=.5*v.ks*compression**2;damperPower+=v.damping*relativeVelocity**2;return {normal:e.normal[i],compression,relativeVelocity,spring,damper};});
 return {corners,pitchDegrees:v.q[1]*180/Math.PI,rollDegrees:v.q[2]*180/Math.PI,pitchRate:v.v[1],rollRate:v.v[2],springEnergy,damperPower,verticalEnergy:e.energy,modalHz:modalFrequencies(v),ledger:s.verticalLedger};
}
