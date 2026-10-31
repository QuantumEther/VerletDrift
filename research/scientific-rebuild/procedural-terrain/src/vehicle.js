import {createVehicle,stepVehicle} from '../../four-corner-load-transfer/src/combined-vehicle.js';
import {createTerrain} from './terrain.js';
// Experiment-11 adapter. Geometry observations are external to the mechanical
// state so the inherited clone/rollback path never encounters sampler functions.
export function createTerrainVehicle(settings={},options={}){
 const terrain=createTerrain(settings);return {state:createVehicle(options),terrainSettings:{...terrain.settings},contacts:[]};
}
export function sampleWheelTerrain(vehicle){
 const s=vehicle.state,p=s.planar,t=createTerrain(vehicle.terrainSettings),co=Math.cos(p.heading),si=Math.sin(p.heading);
 return s.wheels.map((w,i)=>{const angle=i===0?s.steering.leftAngle:i===1?s.steering.rightAngle:0,trail=i<2?s.steering.dynamics.trail:0,x=w.x+trail*(1-Math.cos(angle)),y=w.y-trail*Math.sin(angle),world=[p.x+co*x-si*y,p.y+si*x+co*y];return {wheel:i,world,wheelHeight:s.vertical.q[3+i],...t.sample(...world)};});
}
export function stepTerrainVehicle(vehicle,ports={},h=.001,observer=null){
 const samples=sampleWheelTerrain(vehicle);
 // Until the normal-force path is replaced, reject nonflat conditions rather
 // than silently driving a flat vehicle over decorative sampled elevations.
 if(samples.some(c=>Math.abs(c.height)>1e-12||Math.abs(c.normal[0])+Math.abs(c.normal[1])>1e-12||c.friction!==.9))throw Error('Terrain normal-force and elastic-energy coupling is not connected yet');
 stepVehicle(vehicle.state,ports,h,observer);vehicle.contacts=sampleWheelTerrain(vehicle);return vehicle;
}
