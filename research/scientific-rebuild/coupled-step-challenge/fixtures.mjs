import {fixture} from '../procedural-terrain/tools/tire-ab-fixtures.mjs';
import {createTerrainVehicle,respawnTerrain} from '../procedural-terrain/src/vehicle.js';
import {createTireStrategy} from '../procedural-terrain/src/tire-strategy.js';
import {shaftState} from '../tire-road-observatory-prototype/src/gearbox.js';
export function makeFixture(strategy,scenario){
 if(scenario==='selector'||scenario==='flat-shift'){
  const settings={preset:scenario==='selector'?'road':'flat',seed:42,amplitude:.001,roughness:.1},v=createTerrainVehicle(settings);if(scenario==='selector')v.tireStrategy=createTireStrategy({id:strategy,minSpeed:.5});if(settings.preset!=='flat'&&!respawnTerrain(v,settings).success)throw Error('Initialization failed');v.state.gearbox.driverForce=120;
  return {v,inputs:()=>({})};
 }
 const base=scenario==='clutch-lock'?'near-steady':scenario==='braking'?'braking':scenario==='recontact'?'recontact':scenario==='saturated'||scenario==='drift-recovery'?'drift-recovery':'acceleration';
 const f=fixture(strategy,.5,base,1),s=f.v.state;
 if(scenario==='braking'){s.v=5;s.wheels.forEach(w=>w.omega=5/w.radius);s.flywheel.omega=shaftState(s).omega;s.engine.ignition=false;}
 if(scenario==='saturated'||scenario==='drift-recovery'){s.v=5;s.planar.v=1;s.planar.r=-.1;s.wheels.forEach(w=>w.omega=(w.axle===1?7:5)/w.radius);s.engine.ignition=false;}
 if(scenario==='stall'){s.v=0;s.wheels.forEach(w=>w.omega=0);s.flywheel.omega=30;s.flywheel.engagement=1;}
 const inputs=t=>scenario==='braking'?{serviceBrake:1}:scenario==='saturated'?{handbrake:.3}:scenario==='drift-recovery'?{steer:t<.2?.03:-.03,handbrake:t>=.1&&t<.2?.3:0}:scenario==='stall'?{throttle:0}:f.inputs(t);
 return {...f,inputs};
}
