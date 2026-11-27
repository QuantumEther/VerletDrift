import assert from 'node:assert/strict';
import {test} from 'node:test';
import {writeFileSync} from 'node:fs';
import {createLaboratory, advance, presentation, capture, defaults} from './adapter.js';
import {emission} from './tire-smoke.js';
import {mustang} from '../../vehicles/definitions.js';
import {wheelSteering, steerToward, legacySteering} from '../../vehicles/steering.js';

const config=mustang.steering;
const corners=mustang.vertical.corners;
const degrees=x=>x*180/Math.PI;
test('Ackermann gives the inside wheel more lock and mirrors through center',()=>{
 const left=wheelSteering(config.maxCenter,config,corners);
 assert.deepEqual(wheelSteering(-config.maxCenter,config,corners),[-left[1],-left[0]]);
 assert.deepEqual(wheelSteering(0,config,corners),[0,0]);
 assert.ok(left[0]>config.maxCenter&&left[1]<config.maxCenter);
 assert.ok(wheelSteering(1,config,corners).every(a=>a<=config.wheelLimit));
 assert.equal(steerToward(.001,0,.001,config),0);
});

function circle(points){
 const mean=index=>points.reduce((s,p)=>s+p[index],0)/points.length;
 const mx=mean(0),my=mean(1);
 let xx=0,xy=0,yy=0,xz=0,yz=0,z=0;
 for(const p of points){
  const x=p[0]-mx,y=p[1]-my,r=x*x+y*y;
  xx+=x*x;xy+=x*y;yy+=y*y;xz+=x*r;yz+=y*r;z+=r;
 }
 const d=xx*yy-xy*xy;
 return Math.hypot(Math.sqrt(z/points.length),(yy*xz-xy*yz)/(2*d),(xx*yz-xy*xz)/(2*d));
}

test('Integrated low-speed turning circles',()=>{
 const outputs=[];
 for(const [steering,direction,speed,command] of [[legacySteering,1,1.2,1],[config,1,1.2,1],[config,-1,1.2,1],[config,1,.95,.57],[config,1,1.36,1]]){
  const lab=createLaboratory(defaults,{vehicleId:mustang.id,speed,steering});
  const traces=Array.from({length:6},()=>[]);
  let p,maxWork=0,maxSmoke=0;
  for(let i=0;i<4500;i++){
   advance(lab,{steer:steerToward(lab.steer,direction*command,.001,steering),gear:'N',clutch:0});
   maxWork=Math.max(maxWork,Math.abs(lab.state.consistency.workResidual));
   if(i<1800||i%20)continue;
   p=presentation(lab);
   const w=p.wheels;
   traces[0].push(w[2].position.slice(0,2).map((x,j)=>(x+w[3].position[j])/2));
   traces[1].push([p.planar.x,p.planar.y]);
   w.forEach((t,j)=>traces[j+2].push(t.position.slice(0,2)));
   maxSmoke=Math.max(maxSmoke,...capture(lab).wheels.map(w=>emission(w,w.surface)));
  }
  const radii=traces.map(circle),ideal=(corners[0][0]-corners[2][0])/Math.tan(steering.maxCenter*command);
  assert.ok(Math.abs(radii[0]/ideal-1)<.15, JSON.stringify({radii,ideal}));
  assert.ok(maxWork<1e-7);
  outputs.push({speed,direction,center:degrees(p.centerSteering),handwheel:degrees(p.centerSteering*steering.ratio),angles:p.wheels.slice(0,2).map(w=>degrees(w.steering)),radii,ideal,maxSmoke,maxWork,energyResidual:p.energyResidual,forces:p.wheels.map(w=>w.fy),slipAngles:p.wheels.map(w=>degrees(Math.atan2(w.slipY,Math.abs(w.slipX+w.omega*w.radius)))),traces});
 }
 assert.ok(outputs[1].radii[0]<.65*outputs[0].radii[0]);
 assert.ok(Math.abs(outputs[1].radii[0]-outputs[2].radii[0])<1e-6);
 if(process.env.STEERING_RESULTS)writeFileSync(process.env.STEERING_RESULTS,JSON.stringify(outputs));
});

test('Steering remains work-consistent during speed and grip transitions',()=>{
 for(const [speed,lateral,brake] of [[8,0,0],[24,0,0],[10,4,0],[8,0,1]]){
  const lab=createLaboratory(defaults,{vehicleId:mustang.id,speed,lateral});
  let maxYaw=0;
  for(let i=0;i<1800;i++){
   const request=i<450?.55:i<950?-.45:0;
   advance(lab,{steer:steerToward(lab.steer,request,.001,config),gear:'N',clutch:0,handbrake:i<450?brake:0});
   assert.ok(Math.abs(lab.state.consistency.workResidual)<=lab.state.consistency.tolerance);
   maxYaw=Math.max(maxYaw,Math.abs(lab.state.y[5]));
  }
  assert.ok(maxYaw>.02);
  assert.ok(lab.state.y.every(Number.isFinite));
  assert.equal(lab.steer,0);
 }
});
