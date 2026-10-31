// Historical rejected trial, for diagnostics only. Never imported by production.
import {createVehicle,stepVehicle} from '../../../four-corner-load-transfer/src/combined-vehicle.js';
import {createTerrain as sampler} from '../../src/terrain.js';
function createTerrain(settings){if(settings?.preset!=='plane')return sampler(settings);return {settings,sample:(x,y)=>({height:.001*x,gradient:[.001,0],normal:[-.001/Math.hypot(.001,1),0,1/Math.hypot(.001,1)],friction:.9,surface:'asphalt'})};}
import {stepSuspension,evaluateSuspension} from '../../src/vertical.js';
import {discreteTerrainNormal} from '../../src/normal-contact.js';
import {terrainContactFrame} from '../../src/contact-frame.js';
import {stepPlanar} from '../../src/combined-planar.js';
import {prepareEngine,finishEngine} from '../../../tire-road-observatory-prototype/src/engine.js';
import {advanceSteering,steeringJacobian} from '../../../tire-road-observatory-prototype/src/steering.js';
import {brakeActuation} from '../../../tire-road-observatory-prototype/src/brakes.js';
// Experiment-11 adapter. Geometry observations are external to the mechanical
// state so the inherited clone/rollback path never encounters sampler functions.
export function createTerrainVehicle(settings={},options={}){
 const terrain=createTerrain(settings);return {state:createVehicle(options),terrainSettings:{...terrain.settings},contacts:[]};
}
export function sampleWheelTerrain(vehicle){
 const s=vehicle.state,p=s.planar,t=createTerrain(vehicle.terrainSettings),co=Math.cos(p.heading),si=Math.sin(p.heading);
 return s.wheels.map((w,i)=>{const angle=i===0?s.steering.leftAngle:i===1?s.steering.rightAngle:0,trail=i<2?s.steering.dynamics.trail:0,x=w.x+trail*(1-Math.cos(angle)),y=w.y-trail*Math.sin(angle),world=[p.x+co*x-si*y,p.y+si*x+co*y];return {wheel:i,world,wheelHeight:s.vertical.q[3+i],...t.sample(...world)};});
}
// Trial state is private until acceptance, including diagnostic mutations made
// by the inherited gear-event path. Sampler settings remain plain cloneable data.
function cloneMechanical(s){const c=structuredClone(s);Object.defineProperties(c,{x:{enumerable:true,get(){return this.planar.x;},set(v){this.planar.x=v;}},v:{enumerable:true,get(){return this.planar.u;},set(v){this.planar.u=v;}}});c.flywheel.gearbox=c.gearbox;return c;}
export function candidateTerrainStep(vehicle,ports={},h=.001,observer=null){
 if(!(Number.isFinite(h)&&h>0))throw Error('Invalid candidate timestep');
 const trial={...vehicle,state:cloneMechanical(vehicle.state),contacts:structuredClone(vehicle.contacts)},accepted=[];
 const proxy=observer?{capture:s=>observer.capture(cloneMechanical(s)),accept:ss=>accepted.push(...structuredClone(ss))}:null;
 const start=sampleWheelTerrain(trial);
 const nonflat=start.some(c=>Math.abs(c.height)>1e-12||Math.abs(c.normal[0])+Math.abs(c.normal[1])>1e-12||c.friction!==.9);
 if(nonflat){
  const terrain=createTerrain(vehicle.terrainSettings),base=cloneMechanical(trial.state),verticalStage=stepSuspension(base.vertical,h),begin=sampleWheelTerrain(vehicle).map((c,i)=>[...c.world,vehicle.state.vertical.q[3+i]]);
  let guess=cloneMechanical(base),previousVelocity=null;
  const positions=s=>sampleWheelTerrain({state:s,terrainSettings:vehicle.terrainSettings}).map((c,i)=>[...c.world,s.vertical.q[3+i]]);
  for(let iteration=0;iteration<80;iteration++){
   const q=cloneMechanical(base),end=positions(guess),reaction=Array(18).fill(0),frames=[],loads=[];let elasticBefore=0,elasticAfter=0,workIdentity=0;
   const co=Math.cos(q.planar.heading),si=Math.sin(q.planar.heading),sj=steeringJacobian(q.steering);
   q.wheels.forEach((w,i)=>{const c=discreteTerrainNormal(terrain,begin[i],end[i],w.radius,q.vertical.kt),sample=terrain.sample(end[i][0],end[i][1]),rows=Array.from({length:3},()=>Array(18).fill(0));
    rows[0][7]=co;rows[0][8]=-si;rows[1][7]=si;rows[1][8]=co;rows[0][9]=-si*w.x-co*w.y;rows[1][9]=co*w.x-si*w.y;rows[0][12]=.5*co;rows[1][12]=.5*si;rows[0][13]=-.5*si;rows[1][13]=.5*co;rows[2][14+i]=1;
    const angle=i===0?q.steering.leftAngle:i===1?q.steering.rightAngle:0;
    if(i<2){const t=q.steering.dynamics.trail,dx=t*Math.sin(angle)*sj[i],dy=-t*Math.cos(angle)*sj[i];rows[0][10]=co*dx-si*dy;rows[1][10]=si*dx+co*dy;}
    for(let j=0;j<18;j++)for(let k=0;k<3;k++)reaction[j]+=rows[k][j]*c.force[k];
    frames.push(terrainContactFrame(sample,q.planar.heading+angle,rows,i,w.radius));loads.push(Math.hypot(...c.force));w.mu=sample.friction;elasticBefore+=c.energyBefore;elasticAfter+=c.energyAfter;workIdentity=Math.max(workIdentity,Math.abs(c.residual));
   });
   const angles=advanceSteering(q.steering,(ports.steer||0)/.4,h);q.brakes=brakeActuation(ports.serviceBrake||0,ports.handbrake||0);
   let drive=ports.drive||0;if(q.engine)drive=prepareEngine(q.engine,q.flywheel.omega,{throttle:ports.throttle||0,starter:ports.starter||false},h);
   stepPlanar(q.planar,q.wheels,loads,q.mass+4*q.vertical.wheelMass,{...ports,drive,steeringAngles:angles,steeringSystem:q.steering,verticalState:q.vertical,terrainFrames:frames,normalReaction:reaction,brakeMechanism:q.brakes},h,q.drivetrain,q.flywheel);
   const energyBeforePosition=evaluateSuspension(q.vertical).energy;
   q.vertical.q=q.vertical.q.map((v,i)=>v+.5*h*(q.vertical.v[i]-base.vertical.v[i]));
   const velocity=[q.planar.u,q.planar.v,q.planar.r,...q.vertical.v,...q.wheels.map(w=>w.omega),q.flywheel.omega,q.steering.angularVelocity];
   const pos=positions(q),error=Math.max(...pos.flatMap((r,i)=>r.map((v,k)=>Math.abs(v-end[i][k])))),vError=previousVelocity?Math.max(...velocity.map((v,i)=>Math.abs(v-previousVelocity[i]))):Infinity;
   const residual=verticalStage.energyResidual+q.planar.contact.energyResidual+elasticAfter-elasticBefore+h*reaction.reduce((n,f,i)=>n+f*([0,0,0,0,0,0,0,q.planar.u,q.planar.v,q.planar.r,q.steering.angularVelocity,...q.vertical.v][i]||0),0)+evaluateSuspension(q.vertical).energy-energyBeforePosition;
   if(error<1e-10&&vError<1e-9&&workIdentity<1e-9){
    if(Math.abs(residual)>1e-7)throw Object.assign(Error('Terrain candidate total energy check failed'),{candidate:{accepted:false,iteration,error,vError,workIdentity,residual,initial:vehicle.state,trial:q,begin,end,acceptedPositions:pos,reaction,velocity,elasticChange:elasticAfter-elasticBefore,suspensionCoordinateEnergyChange:evaluateSuspension(q.vertical).energy-energyBeforePosition,suspensionResidual:verticalStage.energyResidual,contactResidual:q.planar.contact.energyResidual,normalEndpointWork:h*reaction.reduce((n,f,i)=>n+f*([0,0,0,0,0,0,0,q.planar.u,q.planar.v,q.planar.r,q.steering.angularVelocity,...q.vertical.v][i]||0),0)}});
    if(q.engine)finishEngine(q.engine,q.flywheel.omega,h);q.time+=h;q.z=q.vertical.q[0];q.pitch=q.vertical.q[1];q.roll=q.vertical.q[2];q.terrainCandidate={iteration,residual,workIdentity};
    const samples=observer?[{start:observer.capture(cloneMechanical(vehicle.state)),end:observer.capture(cloneMechanical(q)),h}]:[];
    return {state:q,contacts:sampleWheelTerrain({state:q,terrainSettings:vehicle.terrainSettings}),accepted:samples,energyResidual:residual};
   }
   guess=q;previousVelocity=velocity;
  }
  throw Object.assign(Error('Terrain endpoint iteration did not converge'),{candidate:{accepted:false,suspensionResidual:verticalStage.energyResidual,trialVertical:base.vertical}});

 }
 stepVehicle(trial.state,ports,h,proxy);
 if(!Number.isFinite(trial.state.planar.contact.energyResidual)||Math.abs(trial.state.planar.contact.energyResidual)>1e-7)throw Error('Candidate contact energy check failed');
 trial.contacts=sampleWheelTerrain(trial);
 return {state:trial.state,contacts:trial.contacts,accepted,energyResidual:trial.state.planar.contact.energyResidual};
}
export function stepTerrainVehicle(vehicle,ports={},h=.001,observer=null){
 const candidate=candidateTerrainStep(vehicle,ports,h,observer);
 vehicle.state=candidate.state;vehicle.contacts=candidate.contacts;
 if(observer)observer.accept(candidate.accepted);
 return vehicle;
}
