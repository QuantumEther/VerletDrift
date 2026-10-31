import {createTerrainVehicle,respawnTerrain} from '../src/vehicle.js';
import {createTireStrategy} from '../src/tire-strategy.js';
import {engageDogs,shaftState} from '../../tire-road-observatory-prototype/src/gearbox.js';
import {engineTorques} from '../../tire-road-observatory-prototype/src/engine.js';
import {brakeActuation} from '../../tire-road-observatory-prototype/src/brakes.js';
export function fixture(id,floor,scenario,duration){
 const settings={preset:'road',seed:42,amplitude:.001,roughness:.1},v=createTerrainVehicle(settings);v.tireStrategy=createTireStrategy({id,minSpeed:floor});const reset=respawnTerrain(v,settings);if(!reset.success)throw Error('initialization: '+reset.message);
 const s=v.state;s.gearbox.q=.025;engageDogs(s,'1');s.engine.mode='running';s.flywheel.omega=40;s.flywheel.engagement=.3;
 if(['braking','combined','recovery'].includes(scenario)){s.v=1;s.wheels.forEach(w=>w.omega=1/w.radius);}if(scenario==='recontact')s.vertical.q[3]=.35;if(scenario==='recovery')s.planar.v=.1;
 if(scenario==='drift-recovery'){s.v=5;s.planar.v=.2;s.wheels.forEach(w=>w.omega=(w.axle===1?6:5)/w.radius);s.flywheel.omega=shaftState(s).omega;}
 let trimThrottle=0,trimBrake=0;
 if(scenario==='near-steady'){
  s.v=5;s.wheels.forEach(w=>w.omega=5/w.radius);s.flywheel.omega=shaftState(s).omega;if(s.flywheel.omega<22)throw Error('trim below firing speed');
  const torque=a=>engineTorques(s.flywheel.omega,a,true).netTorque;
  if(torque(0)<0){let lo=0,hi=1;if(torque(1)<0)throw Error('unavailable engine trim');for(let i=0;i<64;i++){const m=(lo+hi)/2;if(torque(m)<0)lo=m;else hi=m;}trimThrottle=(lo+hi)/2;}
  else{const target=s.flywheel.ratio*torque(0);let lo=0,hi=1;for(let i=0;i<64;i++){const m=(lo+hi)/2,total=brakeActuation(m).wheels.reduce((a,w)=>a+w.serviceCapacity,0);if(total<target)lo=m;else hi=m;}trimBrake=(lo+hi)/2;}
  s.engine.throttle=trimThrottle;
 }
 const inputs=t=>scenario==='drift-recovery'?{throttle:0,serviceBrake:t>=.2?.05:0,steer:t<.5?.01:0}:scenario==='near-steady'?{throttle:trimThrottle,serviceBrake:trimBrake,steer:.01}:{throttle:['acceleration','steering','steering-release'].includes(scenario)?.2:0,steer:scenario==='steering-release'?(t>=.2&&t<.6?.01:0):['steering','combined','recovery'].includes(scenario)?.01:0,serviceBrake:['braking','combined'].includes(scenario)?.1:0};
 return {v,inputs,settings,trim:{throttle:trimThrottle,serviceBrake:trimBrake},duration};
}
