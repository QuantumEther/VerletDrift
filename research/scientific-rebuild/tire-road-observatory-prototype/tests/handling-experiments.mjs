import {writeFile} from 'node:fs/promises';import {gzipSync} from 'node:zlib';import os from 'node:os';import {performance} from 'node:perf_hooks';import assert from 'node:assert/strict';
import {createVehicle,stepVehicle} from '../src/vehicle.js';import {createVehicle as oldVehicle,stepVehicle as oldStep} from '../../braking-and-tire-contact-prototype/src/vehicle.js';
import {createPressurePlate} from '../src/pressure-plate.js';import {engageDogs} from '../src/gearbox.js';import {TireObservatory} from '../src/tracks.js';import {reducedKineticEnergy} from '../src/diagnostics.js';
const ramp=(t,a,b)=>Math.max(0,Math.min(1,(t-a)/(b-a)));
export const scenarios=[
 {id:'A-rolling',speed:8,seconds:2,ports:t=>({})},
 {id:'B-service',speed:8,seconds:3,ports:t=>({serviceBrake:ramp(t,.2,.6)})},
 {id:'C-rear-lock',speed:8,seconds:2,ports:t=>({handbrake:ramp(t,.3,.6)})},
 {id:'D-low-slip-turn',speed:4,seconds:2,ports:t=>({steer:.08})},
 {id:'E-rear-lock-turn',speed:4,seconds:2,ports:t=>({steer:.08,handbrake:ramp(t,.5,.8)})},
 {id:'F-low-grip-wheelspin',speed:0,seconds:2,spin:true,ports:t=>({throttle:1})},
 {id:'G-mixed-grip-braking',speed:8,seconds:2,mixed:true,ports:t=>({serviceBrake:ramp(t,.2,.6)})},
 {id:'H-steering-reversal',speed:8,seconds:2,ports:t=>({steer:t<1?.2:-.2})},
 {id:'H-low-grip-reversal',speed:8,seconds:2,low:true,ports:t=>({steer:t<1?.2:-.2})}
];
export function setup(c,create=createVehicle){const s=create({automobile:true,mode:'open',scenario:c.mixed?'asymmetric':'uniform'});s.v=c.speed;s.wheels.forEach(w=>w.omega=c.speed/w.radius);s.flywheel.actuator=createPressurePlate();
 if(c.spin){s.wheels[2].mu=s.wheels[3].mu=.08;s.flywheel.omega=68.46575630623933;s.engine.mode='running';s.gearbox.q=.025;engageDogs(s,'1');}
 if(c.low)s.wheels.forEach(w=>w.mu=.2);return s;}
const snapshot=s=>({time:s.time,x:s.x,y:s.planar.y,u:s.v,v:s.planar.v,yaw:s.planar.r,heading:s.planar.heading,ax:s.planar.contact?.ax,ay:s.planar.contact?.ay,sideslip:Math.atan2(s.planar.v,Math.max(Math.abs(s.v),.01)),pitch:s.pitch,energy:reducedKineticEnergy(s),engineRPM:s.flywheel.omega*60/(2*Math.PI),engineMode:s.engine.mode,wheels:s.wheels.map(w=>({omega:w.omega,fx:w.fx,fy:w.fy,sx:w.slipX,sy:w.slipY,N:w.normal,U:w.utilization,brake:w.brake,mu:w.mu})),energyResidual:s.planar.contact?.energyResidual,iterations:s.gearbox.lastStepCases});
const stats=v=>{const a=[...v].sort((x,y)=>x-y);return {meanMs:v.reduce((x,y)=>x+y,0)/v.length,p95Ms:a[Math.floor(.95*a.length)],worstMs:a.at(-1)};};
export async function experiments(){
 const report={sourceCommit:'d419189dda7fc698d5364e0a1f91d2c9718c9113',branch:'scientific-rebuild/12-braking-and-tire-contact',node:process.version,cpu:os.cpus()[0].model,logicalCPUs:os.cpus().length,h:.001,units:'SI; engineRPM explicitly rpm; stopping threshold .02 m/s',parameters:{sprungMass:80,unsprungPerAxle:12,totalMass:104,Iz:60,wheelbase:2,track:1.2,wheelRadius:.32,wheelSpinInertia:1,mu:.9,contactK:800},cases:[]},traces=[];
 for(const c of scenarios){const s=setup(c),old=setup(c,oldVehicle),o=new TireObservatory(),trace=[],durations=[];let stop=null,firstLock=null,maxUtil=0,minPower=Infinity,maxResidual=0,brakeWork=0,observerMs=0;
  const consume=o.accept.bind(o);o.accept=stages=>{const t=performance.now();consume(stages);observerMs+=performance.now()-t;for(const a of stages)for(const w of a.end.wheels)brakeWork-=a.h*w.brakeTorque*w.omega;};
  for(let i=0;i<c.seconds*1000;i++){
   const t=i*.001,ports=c.ports(t);if(c.spin)s.flywheel.engagement=old.flywheel.engagement=ramp(t,0,.4);
   const begin=performance.now();stepVehicle(s,ports,.001,o);durations.push(performance.now()-begin);oldStep(old,ports);
   if(!stop&&c.speed>0&&Math.hypot(s.v,s.planar.v)<.02)stop={time:s.time,distance:Math.hypot(s.x,s.planar.y),x:s.x,threshold:.02};
   if(!firstLock&&Math.hypot(s.v,s.planar.v)>.5&&s.wheels.slice(2).every(w=>Math.abs(w.omega)<1e-6))firstLock={time:s.time,speed:Math.hypot(s.v,s.planar.v)};
   for(const w of o.latest){maxUtil=Math.max(maxUtil,w.utilization??0);minPower=Math.min(minPower,w.power);}maxResidual=Math.max(maxResidual,Math.abs(s.planar.contact.energyResidual));
   if(i%20===0)trace.push({...snapshot(s),contacts:o.latest.map(w=>({name:w.name,position:w.position,slipPower:w.power,work:w.totalWork,saturated:w.saturated,significant:w.significantSliding})),marks:o.marks.map(r=>r.count)});
  }
  assert.deepEqual(structuredClone(s),structuredClone(old));assert.ok(maxUtil<=1+1e-8);assert.ok(minPower>=-1e-7);assert.ok(maxResidual<1e-7);
  const row={id:c.id,status:'PASS',configuration:{speed:c.speed,seconds:c.seconds,spin:!!c.spin,mixed:!!c.mixed,low:!!c.low,controlFunction:c.ports.toString()},final:snapshot(s),stop,firstRearLock:firstLock,maxUtilization:maxUtil,minTireDissipationW:minPower,maxEnergyResidualJ:maxResidual,brakeWorkJ:brakeWork,tracks:o.stats(),sourceComparison:'bit-identical full final physical state',physicsIncludingObserver:stats(durations),acceptedRecordMeanMs:observerMs/(c.seconds*1000)};
  report.cases.push(row);traces.push({id:c.id,trace,marks:o.marks.map(r=>[...r.values()]),center:[...o.center.values()],paths:o.paths.map(r=>[...r.values()])});
 }
 await writeFile(new URL('../results/mission40-handling.json',import.meta.url),JSON.stringify(report,null,2)+'\n');await writeFile(new URL('../results/mission40-traces.json.gz',import.meta.url),gzipSync(JSON.stringify({metadata:report.parameters,units:report.units,cases:traces})));
 console.log(JSON.stringify(report.cases.map(c=>({id:c.id,marks:c.tracks.markCount,stop:c.stop,lock:c.firstRearLock,U:c.maxUtilization,mean:c.physicsIncludingObserver.meanMs}))));return report;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await experiments();
