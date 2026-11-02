// Necessary-condition probes, NOT a variable-terrain vehicle implementation.
import {P,contactForces} from '../consistent-model.js';
import {brakeActuation} from '../../tire-road-observatory-prototype/src/brakes.js';
import {rotorFlow} from '../constraints.js';
import {evaluateTerrainNormal} from '../../procedural-terrain/src/normal-contact.js';
export {createTerrain} from '../../procedural-terrain/src/terrain.js';
export const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export function plane(angle=5*Math.PI/180,crossSlope=0){const g=[Math.tan(angle),crossSlope],length=Math.hypot(...g,1);return {sample:(x,y)=>({height:g[0]*x+g[1]*y,gradient:g.slice(),normal:[-g[0]/length,-g[1]/length,1/length],friction:P.mu,surface:'diagnostic-plane'})};}
export function stationaryBalance(angle=5*Math.PI/180){
 const m=P.mass,g=9.81,normalTotal=m*g*Math.cos(angle),sample=plane(angle).sample(0,0),tangent=[Math.cos(angle),0,Math.sin(angle)];
 const tires=contactForces([[0,0],[0,0],[0,0],[0,0]],Array(4).fill(normalTotal/4),[0,0,0,0,0],[0,0,0,0,0],0,0);
 const tangential=tires.reduce((s,t)=>s+t.fx,0),gravity=[0,0,-m*g],terrain=plane(angle),gap=(normalTotal/4)*sample.normal[2]/20000;
 const supports=[[1,.6],[1,-.6],[-1,.6],[-1,-.6]].map(([x,y])=>evaluateTerrainNormal(terrain,[x,y,P.R+terrain.sample(x,y).height-gap],P.R,20000));
 const reaction=[0,1,2].map(k=>supports.reduce((s,c)=>s+c.force[k],0)),sum=gravity.map((x,i)=>x+reaction[i]+tangential*tangent[i]);
 const B=brakeActuation(1,0).wheels.map(w=>w.serviceCapacity+w.handCapacity),rotors=rotorFlow([0,0,0,0,0],[0,0,0,0,0],B,P.clutch,.001);
 const hypothetical=rotorFlow([0,0,0,0,0],[...Array(4).fill(-P.R*m*g*Math.sin(angle)/4),0],B,P.clutch,.001);
 return {angleRad:angle,massKg:m,normalN:normalTotal,frictionCapacityN:P.mu*normalTotal,requiredUphillForceN:m*g*Math.sin(angle),actualTireForceN:tangential,unbalancedForceN:sum,alongSlopeAccelerationMS2:-dot(sum,tangent)/m,requiredBrakeTorqueEachNm:P.R*m*g*Math.sin(angle)/4,brakeCapacityNm:B,rotorSpeeds:rotors.w,hypotheticalRequiredForceRotorSpeeds:hypothetical.w,clutchMode:rotors.clutchMode,brakeModes:rotors.brakeModes};
}
export function creepRun(h=.001,duration=1,angle=5*Math.PI/180){
 // 1-DOF necessary-condition reduction: normal motion constrained, wheels locked.
 // Equal load allocation is illustrative; the zero-slip impossibility is independent
 // of allocation. No suspension/chassis/terrain solver is claimed by this reduction.
 const m=P.mass,g=9.81,load=m*g*Math.cos(angle)/4,B=brakeActuation(1,0).wheels.map(w=>w.serviceCapacity+w.handCapacity);let w=[0,0,0,0,0];
 const tire=v=>contactForces([[0,0]],[load],[-v,0,0,0,0],[0],0,0)[0].fx;
 const derivative=y=>{const drag=-4*tire(y[1]);return [y[1],g*Math.sin(angle)+drag/m,drag*y[1]];};
 let y=[0,0,0],maxRotorResidual=0,minFrictionMargin=Infinity;
 for(let i=0;i<Math.round(duration/h);i++){
  const a=derivative(y),add=(k,t)=>y.map((x,j)=>x+h*t*k[j]),b=derivative(add(a,.5)),c=derivative(add(b,.5)),d=derivative(add(c,1));y=y.map((x,j)=>x+h*(a[j]+2*b[j]+2*c[j]+d[j])/6);
  const F=tire(y[1]),rotors=rotorFlow(w,[-P.R*F,-P.R*F,-P.R*F,-P.R*F,0],B,P.clutch,h);w=rotors.w;if(w.some(x=>x!==0))throw Error('Exited locked-wheel diagnostic domain');maxRotorResidual=Math.max(maxRotorResidual,...w.map(Math.abs));minFrictionMargin=Math.min(minFrictionMargin,P.mu*load-Math.abs(F));
 }
 const decay=4*P.k/m,terminal=m*g*Math.sin(angle)/(4*P.k),speedExact=terminal*(1-Math.exp(-decay*duration)),positionExact=terminal*(duration-(1-Math.exp(-decay*duration))/decay),mechanical=.5*m*y[1]**2-m*g*Math.sin(angle)*y[0];
 return {h,duration,positionM:y[0],speedMS:y[1],tireWorkJ:y[2],energyWorkResidualJ:mechanical-y[2],terminalCreepMS:terminal,analyticalPositionM:positionExact,analyticalSpeedMS:speedExact,maxRotorSpeedRadS:maxRotorResidual,minFrictionMarginN:minFrictionMargin};
}
export function point(state,i){const y=state.y,[x,z]=state.vertical.corners[i],a=x+P.H*y[7],b=z+P.H*y[8],c=Math.cos(y[2]),s=Math.sin(y[2]);return [y[0]+c*a-s*b,y[1]+s*a+c*b,y[9+i]];}
export function virtualVelocity(state,i,integrable=false){
 const y=state.y,[x,z]=state.vertical.corners[i],a=x+(integrable?P.H*y[7]:0),b=z+(integrable?P.H*y[8]:0),c=Math.cos(y[2]),s=Math.sin(y[2]),u=-y[5]*b+P.H*y[14],v=y[5]*a+P.H*y[15];return [y[3]+c*u-s*v,y[4]+s*u+c*v,y[16+i]];
}
export function geometryWitness(state,terrain,i=0){
 const p=point(state,i),contact=evaluateTerrainNormal(terrain,p,P.R,state.vertical.kt),flat=virtualVelocity(state,i),correct=virtualVelocity(state,i,true),dt=1e-5;
 const shifted=t=>{const clone={...state,y:state.y.slice()};clone.y[0]+=t*state.y[3];clone.y[1]+=t*state.y[4];clone.y[2]+=t*state.y[5];clone.y[7]+=t*state.y[14];clone.y[8]+=t*state.y[15];clone.y[9+i]+=t*state.y[16+i];return point(clone,i);};
 const derivative=(evaluateTerrainNormal(terrain,shifted(dt),P.R,state.vertical.kt).elasticEnergy-evaluateTerrainNormal(terrain,shifted(-dt),P.R,state.vertical.kt).elasticEnergy)/(2*dt);
 return {point:p,normalForce:contact.force,flatVirtualVelocity:flat,coordinateVelocity:correct,potentialRateW:derivative,flatPowerIdentityDefectW:derivative+dot(contact.force,flat),correctedJacobianIdentityDefectW:derivative+dot(contact.force,correct)};
}
export function closedLoop(yaw=.1,pitch=.01){return {yawRad:yaw,pitchRad:pitch,configurationReturnsExactly:true,virtualPointDisplacementM:[P.H*pitch*(Math.cos(yaw)-1),P.H*pitch*Math.sin(yaw)]};}
