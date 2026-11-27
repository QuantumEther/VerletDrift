import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createLaboratory,advance,capture} from './adapter.js';
import {authored,createMap} from './maps.js';
import {flightLanes} from './proving-ground.js';

const settings={seed:23,amplitude:.15,roughness:.5};
for(const preset of ['flat','hills','rough','road',...authored]){
 test(preset+' supports a moving vehicle and has consistent gradients',()=>{
  const map=createMap({...settings,preset});
  for(const [x,y] of [[0,0],[17,1],[74,0],[75,15],[74,-15],[74,-11]]){
   const a=map.sample(x,y),h=1e-4;
   const dx=(map.sample(x+h,y).height-map.sample(x-h,y).height)/(2*h);
   const dy=(map.sample(x,y+h).height-map.sample(x,y-h).height)/(2*h);
   assert.ok(Math.abs(dx-a.gradient[0])<1e-5&&Math.abs(dy-a.gradient[1])<1e-5);
  }
  const lab=createLaboratory({...settings,preset},{vehicleId:'mustang-1969',speed:9});
  for(let i=0;i<1600;i++)advance(lab,{gear:'N',clutch:0,steer:i>600&&i<1050?.1:0});
  assert.ok(lab.state.y[0]>7&&lab.state.y.every(Number.isFinite));
 });
}
test('Terrain creates four-wheel flight and recontact with no airborne tire forces',()=>{
 const results=[];
 for(const lane of flightLanes){
  const {speed}=lane;
  const lab=createLaboratory({...settings,preset:'flight'},{vehicleId:'mustang-1969',speed,x:lane.start-8,y:lane.y});
  let airtime=0,first=null,last=null,landing=null,maxXError=0,maxGravityError=0,firstTouch=null,maxWork=0;
  const trace=[];let allRecontacted=false;const begin=performance.now();
  for(let i=0;i<4300;i++){
   advance(lab,{gear:'N',clutch:0});
   const s=lab.state,y=s.y,t=s.contacts,detached=t.every(w=>!w.normal.attached&&w.normal.N===0);
   maxWork=Math.max(maxWork,Math.abs(s.consistency.workResidual));
   if(i%10===0)trace.push({t:s.time,x:y[0],z:y[6],pitch:y[7],roll:y[8],yaw:y[2],contact:t.map(w=>w.normal.attached)});
   if(landing&&t.every(w=>w.normal.attached))allRecontacted=true;
   if(detached){
    if(landing)continue;
    airtime+=.001;
    const state={t:s.time,x:y[0],z:y[6],vx:y[3],vy:y[4],pitch:y[7],roll:y[8],yaw:y[2],wheelSpeed:y.slice(20,24),pitchRate:y[14],rollRate:y[15],yawRate:y[5],
      vz:(s.vertical.mass*y[13]+s.vertical.wheelMass*y.slice(16,20).reduce((a,b)=>a+b,0))/(s.vertical.mass+4*s.vertical.wheelMass)};
    first??=state;last=state;
    assert.ok(t.every(w=>w.normal.N===0&&w.Ft.every(f=>f===0)));
    assert.ok(capture(lab).wheels.every(w=>!w.supported&&w.power===0));
    maxXError=Math.max(maxXError,Math.hypot(state.vx-first.vx,state.vy-first.vy));
    maxGravityError=Math.max(maxGravityError,Math.abs(state.vz-first.vz+s.vertical.g*(state.t-first.t)));
   }else if(first&&!landing){
    landing=s.time;firstTouch=t.map(w=>w.normal.attached);
   }
  }
  assert.ok(airtime>.04&&landing,JSON.stringify({lane:lane.name,airtime,landing,first,last}));
  assert.ok(allRecontacted);
  assert.ok(maxXError<1e-9&&maxGravityError<1e-8);
  results.push({lane:lane.name,speed,airtime,first,last,landing,firstTouch,maxXError,maxGravityError,maxWork,cpuMsPerSimulatedSecond:(performance.now()-begin)/4.3,trace});
 }
 if(process.env.FLIGHT_RESULTS)writeFileSync(process.env.FLIGHT_RESULTS,JSON.stringify(results,null,2));
});
