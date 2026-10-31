import {createVertical,evaluate,stepVertical} from './vertical.js';
import {solveFourContacts} from './coupled-contact.js';
import {brakeActuation} from '../../braking-and-tire-contact-prototype/src/brakes.js';
import {linkage,steeringGeometry} from '../../braking-and-tire-contact-prototype/src/steering.js';
export function createExperiment(scenario='rest'){
 const vertical=createVertical(),speed=['braking','left','right','reverse'].includes(scenario)?(scenario==='reverse'?-3:3):0;
 return {vertical,scenario,time:0,horizontal:[speed,0,0],spin:Array(4).fill(speed/vertical.radius),position:[0,0,0],loads:evaluate(vertical).normal,travel:Array(4).fill(vertical.mass*vertical.g/(4*vertical.ks)),utilization:Array(4).fill(0),energyResidual:0,contactResidual:0,work:0,dissipation:0,numericalLoss:0,geometry:steeringGeometry()};
}
export function totalEnergy(s){return evaluate(s.vertical).energy+.5*104*(s.horizontal[0]**2+s.horizontal[1]**2)+.5*45*s.horizontal[2]**2+s.spin.reduce((a,w)=>a+.5*w*w,0);}
export function stepExperiment(s,h=.001,controls={}){
 if(!(h>0&&h<=.004))throw Error('Timestep outside supported range');
 const oldEnergy=totalEnergy(s),vertical=s.vertical,initial=evaluate(vertical);
 stepVertical(vertical,h);
 const final=evaluate(vertical),verticalHeat=h*(initial.dissipation+final.dissipation)/2;
 let velocity=[...s.horizontal,...vertical.v,...s.spin];
 const drive=controls.drive??(s.scenario==='acceleration'?6:0),brake=controls.brake??(s.scenario==='braking'&&s.time>.1?.5:0);
 let work=0;for(const i of [12,13]){const old=velocity[i];velocity[i]+=h*drive;work+=drive*h*(old+velocity[i])/2;}
 const column=controls.column??(s.scenario==='left'||s.scenario==='reverse'?1:s.scenario==='right'?-1:0),steering=linkage(column,s.geometry);
 const result=solveFourContacts(vertical,{velocity,normal:final.normal,angles:[steering.leftAngle,steering.rightAngle,0,0],brakeCapacity:brakeActuation(brake).wheels.map(w=>w.serviceCapacity)},h);
 s.horizontal=result.velocity.slice(0,3);vertical.v=result.velocity.slice(3,10);s.spin=result.velocity.slice(10);s.time+=h;
 s.position=s.position.map((v,i)=>v+h*s.horizontal[i]);s.loads=final.normal;
 s.travel=vertical.corners.map(([x,y],i)=>vertical.length-(vertical.q[0]+x*vertical.q[1]+y*vertical.q[2]-vertical.q[i+3]));
 s.utilization=s.loads.map((n,i)=>n>0?Math.hypot(result.forces[2*i],result.forces[2*i+1])/(.9*n):0);
 s.contactResidual=Math.max(s.contactResidual,Math.abs(result.energyResidual));
 s.work+=work;s.dissipation+=verticalHeat+result.dissipation;s.numericalLoss+=result.numericalLoss;
 s.energyResidual+=totalEnergy(s)-oldEnergy-work+verticalHeat+result.dissipation+result.numericalLoss;
 if(![...vertical.q,...vertical.v,...s.horizontal,...s.spin].every(Number.isFinite))throw Error('Nonfinite experiment state');
 return s;
}
