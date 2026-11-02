// Explicit midpoint body/contact stage + exact frozen-torque Coulomb rotor flow.
// Original model.js remains the unchanged smooth-friction benchmark.
import {P,create,energy,evaluateVehicle} from './model.js';
import {brakeActuation} from '../tire-road-observatory-prototype/src/brakes.js';
import {rotorFlow} from './constraints.js';
export {P,create,energy};
const zeroBrakes={wheels:Array.from({length:4},()=>({serviceCapacity:0,handCapacity:0}))};
export function step(s,input={},h=.001){
 if(!(h>0&&h<=.004))throw Error('Declared timestep domain (0, .004] s');
 const engagement=input.clutch??.3;if(!Number.isFinite(engagement)||engagement<0||engagement>1)throw Error('Invalid clutch engagement');
 for(const key of ['serviceBrake','handbrake'])if(input[key]!==undefined&&(!Number.isFinite(input[key])||input[key]<0||input[key]>1))throw Error('Invalid brake request');
 const B=brakeActuation(input.serviceBrake,input.handbrake).wheels.map(w=>w.serviceCapacity+w.handCapacity),C=P.clutch*engagement;
 const ports={...input,clutch:0},y=s.y;
 const e0=evaluateVehicle(s,y,ports,zeroBrakes),tau=e=>[...e.d.slice(20,24).map(x=>x*P.Iw),e.d[24]*P.Ie];
 const params={Iw:P.Iw,Ie:P.Ie,G:P.gear};
 const predict=rotorFlow(y.slice(20,25),tau(e0),B,C,h/2,params);
 const mid=y.map((x,i)=>x+h/2*e0.d[i]);mid.splice(20,5,...predict.w);
 const em=evaluateVehicle(s,mid,ports,zeroBrakes),torques=tau(em),rotors=rotorFlow(y.slice(20,25),torques,B,C,h,params);
 const next=y.map((x,i)=>x+h*em.d[i]);next.splice(20,5,...rotors.w);
 next[25]=y[25]+torques[4]*rotors.integral[4];
 next[26]=y[26]+h*em.power[1]+em.tires.reduce((w,t,i)=>w-P.R*t.fx*(rotors.integral[i]-h*mid[20+i]),0);
 next[27]=y[27]-rotors.brakeHeat;next[28]=y[28]-rotors.clutchHeat;
 if(!next.every(Number.isFinite))throw Error('Invalid state; last accepted state retained');
 s.y=next;s.time+=h;s.constraints=rotors;
}
