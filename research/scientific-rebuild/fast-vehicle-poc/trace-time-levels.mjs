// Independent reconstruction of the OLD constrained step's work defect.
import {create,energy,evaluateVehicle,P} from './model.js';import {step} from './constrained-model.js';import {rotorFlow} from './constraints.js';import {brakeActuation} from '../tire-road-observatory-prototype/src/brakes.js';import {evaluate} from '../four-corner-load-transfer/src/vertical.js';import {mkdir,writeFile} from 'node:fs/promises';
const zero={wheels:Array.from({length:4},()=>({serviceCapacity:0,handCapacity:0}))},m=[104,104,60,80,45,20,6,6,6,6],vel=y=>[...y.slice(3,6),...y.slice(13,20)],kinetic=y=>vel(y).reduce((e,x,i)=>e+.5*m[i]*x*x,0),potential=(s,y)=>evaluate(s.vertical,y.slice(6,13),Array(7).fill(0)).energy;
const rows=[];
for(const name of ['braking','recontact','drift-recovery']){
 const s=create({speed:name==='recontact'?0:5,lateral:name==='drift-recovery'?1:0,engine:0}),h=.001;let worst=null,bodyKineticSum=0,potentialSum=0,residualSum=0;
 if(name==='recontact')s.y[9]=.35;
 for(let i=0;i<1000;i++){
 const input={ignition:false,clutch:0,serviceBrake:name==='braking'?1:0,steer:name==='drift-recovery'?.05:0},old=s.y.slice(),e0=evaluateVehicle(s,old,input,zero),tau=[...e0.d.slice(20,24).map(x=>P.Iw*x),e0.d[24]*P.Ie],B=brakeActuation(input.serviceBrake,input.handbrake).wheels.map(w=>w.serviceCapacity+w.handCapacity),predict=rotorFlow(old.slice(20,25),tau,B,0,h/2),mid=old.map((x,k)=>x+h*e0.d[k]/2);mid.splice(20,5,...predict.w);
 const em=evaluateVehicle(s,mid,input,zero),fm=[P.mass*em.d[3],P.mass*em.d[4],P.Iz*em.d[5],...em.d.slice(13,20).map((x,k)=>x*m[k+3])],velocity=vel(mid),Fv=fm.reduce((p,x,k)=>p+x*velocity[k],0),bodyContactPower=em.power[1]+em.tires.reduce((p,t,k)=>p+P.R*t.fx*mid[20+k],0),damping=-em.power[4];
 step(s,input,h);const next=s.y,bodyKineticDefect=kinetic(next)-kinetic(old)-h*Fv,potentialDefect=potential(s,next)-potential(s,old)-h*(bodyContactPower-damping-Fv),ledger=energy(s,next)-energy(s,old)-next.slice(25).reduce((a,x,k)=>a+x-old[25+k],0);
 const data={time:s.time,bodyKineticDefectJ:bodyKineticDefect,potentialDefectJ:potentialDefect,totalDefectJ:bodyKineticDefect+potentialDefect,ledgerResidualJ:ledger,identityErrorJ:bodyKineticDefect+potentialDefect-ledger,predictedBodyVelocity:velocity,actualEndpointAverageBodyVelocity:vel(old).map((x,k)=>(x+vel(next)[k])/2),predictedRotorMidpoint:mid.slice(20,25),normalAtPredictedMidpoint:em.tires.map(t=>t.N)};
 if(!worst||Math.abs(ledger)>Math.abs(worst.ledgerResidualJ))worst=data;bodyKineticSum+=bodyKineticDefect;potentialSum+=potentialDefect;residualSum+=ledger;
 }
 rows.push({name,steps:1000,h,bodyKineticSumJ:bodyKineticSum,potentialSumJ:potentialSum,ledgerSumJ:residualSum,worst});
}
await mkdir(new URL('results/consistency',import.meta.url),{recursive:true});await writeFile(new URL('results/consistency/old-time-level-trace.json',import.meta.url),JSON.stringify({method:'Old model independently reconstructed, no correction applied; sum of body kinetic and potential work defects equals old ledger defect',rows},null,2));console.log(rows.map(({name,bodyKineticSumJ,potentialSumJ,ledgerSumJ,worst})=>({name,bodyKineticSumJ,potentialSumJ,ledgerSumJ,worstStep:worst.time,independentIdentityErrorJ:worst.identityErrorJ})));
