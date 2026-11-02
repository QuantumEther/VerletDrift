import {cloneMechanical,sampleWheelTerrain} from '../procedural-terrain/src/vehicle.js';
import {createTerrain} from '../procedural-terrain/src/terrain.js';
import {evaluateSuspension} from '../procedural-terrain/src/vertical.js';
import {evaluateTerrainNormal,discreteTerrainNormal} from '../procedural-terrain/src/normal-contact.js';
import {terrainContactFrame} from '../procedural-terrain/src/contact-frame.js';
import {createTireStrategy,REFERENCE,freezeTireCoefficients,frictionImpulseLimit} from '../procedural-terrain/src/tire-strategy.js';
import {advanceSteering,steeringJacobian,finishSteering} from '../tire-road-observatory-prototype/src/steering.js';
import {prepareEngine} from '../tire-road-observatory-prototype/src/engine.js';
import {brakeActuation} from '../tire-road-observatory-prototype/src/brakes.js';
import {prepare,reconstruct} from '../contact-solver-challenge/prepare.js';
import {stagePlanar} from './stage-adapter.js';
export const GEO=Object.freeze(Array.from({length:11},(_,i)=>i+7));
export function createModel(vehicle,ports,h){
 const initial=vehicle.state,vs=initial.vertical,terrain=vehicle.terrain||createTerrain(vehicle.terrainSettings),strategy=vehicle.tireStrategy?createTireStrategy(vehicle.tireStrategy):REFERENCE;
 const co=Math.cos(initial.planar.heading),si=Math.sin(initial.planar.heading),sj=steeringJacobian(initial.steering),start=sampleWheelTerrain({...vehicle,terrain}),begin=start.map(c=>[...c.world,c.wheelHeight]),startContacts=begin.map((p,i)=>evaluateTerrainNormal(terrain,p,initial.wheels[i].radius,vs.kt));
 const pointRows=initial.wheels.map((w,i)=>{const r=Array.from({length:3},()=>Array(18).fill(0));r[0][7]=co;r[0][8]=-si;r[1][7]=si;r[1][8]=co;r[0][9]=-si*w.x-co*w.y;r[1][9]=co*w.x-si*w.y;r[0][12]=.5*co;r[1][12]=.5*si;r[0][13]=-.5*si;r[1][13]=.5*co;r[2][14+i]=1;
  if(i<2){const a=i===0?initial.steering.leftAngle:initial.steering.rightAngle,t=initial.steering.dynamics.trail,dx=t*Math.sin(a)*sj[i],dy=-t*Math.cos(a)*sj[i];r[0][10]=co*dx-si*dy;r[1][10]=si*dx+co*dy;}return r;});
 const entry=[...initial.wheels.map(w=>w.omega),initial.gearbox.velocity,initial.flywheel.omega,initial.gearbox.neutralOmega||0,initial.planar.u,initial.planar.v,initial.planar.r,initial.steering.angularVelocity,...vs.v];
 const entryForCoefficients=[0,0,0,0,...entry.slice(4)],coefficients=strategy.id==='reference'?null:Object.freeze(initial.wheels.map((w,i)=>{const angle=i===0?initial.steering.leftAngle:i===1?initial.steering.rightAngle:0,frame=terrainContactFrame(start[i],initial.planar.heading+angle,pointRows[i],i,w.radius);return freezeTireCoefficients(strategy,frame.rows[0].reduce((s,a,j)=>s+a*entryForCoefficients[j],0));}));
 const preparedState=cloneMechanical(initial);Object.assign(preparedState.gearbox,{eventIterations:0,lastAngularImpulse:0,inputMomentumChange:0,lastImpulse:0,lastImpactEnergy:0,contactForce:0});
 const angles=advanceSteering(preparedState.steering,(ports.steer||0)/.4,h);preparedState.brakes=brakeActuation(ports.serviceBrake||0,ports.handbrake||0);const drive=preparedState.engine?prepareEngine(preparedState.engine,preparedState.flywheel.omega,{throttle:ports.throttle||0,starter:ports.starter||false},h):ports.drive||0;
 const stats={environments:0,assemblies:0,stageProbes:0};
 function endpoint(geo){
  const p={...initial.planar},s={...initial,planar:p,vertical:{...vs,q:vs.q.map((q,i)=>q+h*geo[4+i])},steering:{...initial.steering}};
  p.heading+=h*geo[2];p.x+=h*(co*geo[0]-si*geo[1]);p.y+=h*(si*geo[0]+co*geo[1]);finishSteering(s.steering,geo[3],h);return s;
 }
 function environment(geo){
  stats.environments++;const endState=endpoint(geo),samples=sampleWheelTerrain({state:endState,terrain}),pos=samples.map(c=>[...c.world,c.wheelHeight]),reaction=Array(18).fill(0),frames=[],loads=[];let U0=0,U1=0,identity=0,damping=0;
  reaction[11]=-vs.mass*vs.g;for(let i=0;i<4;i++)reaction[14+i]=-vs.wheelMass*vs.g;
  vs.corners.forEach(([x,y],i)=>{const compression=z=>vs.length-z[0]-x*z[1]-y*z[2]+z[3+i],rate=geo[4]+x*geo[5]+y*geo[6]-geo[7+i],force=vs.ks*(compression(vs.q)+compression(endState.vertical.q))/2-vs.damping*rate;reaction[11]+=force;reaction[12]+=x*force;reaction[13]+=y*force;reaction[14+i]-=force;damping+=h*vs.damping*rate*rate;});
  initial.wheels.forEach((w,i)=>{const c=discreteTerrainNormal(terrain,begin[i],pos[i],w.radius,vs.kt,startContacts[i],samples[i]),rows=pointRows[i];for(let j=0;j<18;j++)for(let k=0;k<3;k++)reaction[j]+=rows[k][j]*c.force[k];const a=i===0?initial.steering.leftAngle:i===1?initial.steering.rightAngle:0;frames.push(terrainContactFrame(samples[i],initial.planar.heading+a,rows,i,w.radius));loads.push(Math.hypot(...c.force));U0+=c.energyBefore;U1+=c.energyAfter;identity=Math.max(identity,Math.abs(c.residual));});
  return {geo,pos,samples,reaction,frames,loads,U0,U1,identity,damping};
 }
 const operators={};
 function stageOptions(env,extra={}){return {...ports,drive,steeringAngles:angles,steeringSystem:extra.state?.steering,verticalState:extra.state?.vertical,terrainFrames:env.frames,tireCoefficients:coefficients,normalReaction:env.reaction,brakeMechanism:preparedState.brakes,contactOperators:operators,...extra};}
 function probe(env,mode){
  stats.stageProbes++;const q=cloneMechanical(preparedState);q.wheels.forEach((w,i)=>w.mu=env.samples[i].friction);
  return stagePlanar(q.planar,q.wheels,env.loads,q.mass+4*vs.wheelMass,stageOptions(env,{state:q,probe:true,modeOverride:mode}),h,q.drivetrain,q.flywheel);
 }
 const firstEnvironment=environment(entry.slice(7)),base=probe(firstEnvironment,'locked');
 function problem(env,mode){
  stats.assemblies++;const rows=base.rows.map((r,i)=>i<8?{j:env.frames[Math.floor(i/2)].rows[i%2],compliance:r.compliance}:r),groups=base.groups.map((g,i)=>({...g,...(i<4?{limit:frictionImpulseLimit(h,env.samples[i].friction,env.loads[i])}:{})}));
  const last=groups.at(-1);delete last.fixed;if(mode!=='locked')last.fixed=mode*h*base.capacity;
  const free=base.v0.map((v,i)=>v+h*base.inverse[i].reduce((s,a,j)=>s+a*(base.external[j]+env.reaction[j]),0));if(base.neutral)free[6]=base.g.neutralOmega*base.g.inputInertia*base.inverse[6][6];free[10]=(base.sd.inertia*base.oldSteering+h*(base.driverTorque+env.reaction[10]))*base.inverse[10][10];
  const p={inverse:base.inverse,free,rows,groups,h};return {...p,assembly:prepare(p)};
 }
 return {initial,preparedState,terrain,strategy,coefficients,entry,base,firstEnvironment,environment,endpoint,problem,probe,stageOptions,stats,before:evaluateSuspension(vs),reconstruct};
}
