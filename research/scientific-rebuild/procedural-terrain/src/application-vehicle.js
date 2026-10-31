// Presentation adapter: keep the mature application's stable state reference
// while the terrain solver privately constructs and atomically accepts a state.
import {createDifferential} from '../../four-corner-load-transfer/src/differential.js';
import {createTerrainVehicle,stepTerrainVehicle,respawnTerrain,sampleWheelTerrain} from './vehicle.js';
import {createTerrain} from './terrain.js';
export {cornerForces} from '../../four-corner-load-transfer/src/combined-vehicle.js';
let settings={preset:'flat',seed:42,amplitude:.001,roughness:.1};
let terrain=createTerrain(settings);
export const terrainSampler=()=>terrain;
export function setEnvironment(next){
 const sampler=createTerrain(next);
 settings={...sampler.settings};terrain=sampler;
}
function resetOptions(state,options){
 // Retain the mature model's additional reflected-inertia metadata.
 Object.assign(state.drivetrain,createDifferential(options.mode||'independent'));
 state.gearbox.worn=!!options.worn;
}
export function createVehicle(options={}){
 const vehicle=createTerrainVehicle(settings,options);
 if(settings.preset!=='flat'){
  const status=respawnTerrain(vehicle,settings);
  if(!status.success)throw Error(status.message);
 }
 resetOptions(vehicle.state,options);
 return vehicle.state;
}
export function stepVehicle(state,ports,h,observer){
 const vehicle={state,terrainSettings:settings,contacts:[]};
 stepTerrainVehicle(vehicle,ports,h,observer);
 Object.assign(state,vehicle.state);
 state.flywheel.gearbox=state.gearbox;
 return vehicle.integration;
}
export function regenerate(state,next,history,options={}){
 const vehicle={state,terrainSettings:settings,contacts:[]};
 const status=respawnTerrain(vehicle,next,history);
 if(!status.success)return {status,state};
 resetOptions(vehicle.state,options);
 setEnvironment(next);
 return {status,state:vehicle.state};
}
export function roadAt(state,x){
 const point=terrain.sample(x,state.planar?.y||0);
 return {height:point.height,slope:point.gradient[0]};
}
export function terrainContacts(state){
 return sampleWheelTerrain({state,terrain,terrainSettings:settings});
}
