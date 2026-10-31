import {createVehicle,stepVehicle} from '../../four-corner-load-transfer/src/combined-vehicle.js';
import {createTerrain} from './terrain.js';
import {stepSuspension} from './vertical.js';
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
  // Execute the suspension-only trial, never the superseded flat tire path.
  // This partial candidate is rejected: the implicit normal-contact endpoint
  // solve is not yet connected. No unsupported trial can escape as accepted.
  const vertical=stepSuspension(trial.state.vertical,h);
  const error=Error('Implicit terrain endpoint/contact-work iteration is not connected');
  error.candidate={accepted:false,start,trialVertical:structuredClone(trial.state.vertical),suspensionResidual:vertical.energyResidual};throw error;
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
