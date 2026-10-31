import {test} from 'node:test';import assert from 'node:assert/strict';import {SimulationClock} from '../src/clock.js';
test('overload is bounded and throughput reports real accepted time at unchanged 1 ms steps',()=>{
 let cpu=0;const c=new SimulationClock({now:()=>cpu,budgetMs:6});
 for(let i=0;i<200;i++)c.frame(.05,h=>{assert.equal(h,.001);cpu+=3;},()=>({}));
 assert.ok(c.frameSteps<=2);assert.ok(c.debt<=.05);assert.equal(c.status,'overloaded');assert.ok(c.realtimeRatio<.05&&c.stepsPerSecond<=41);assert.ok(Math.abs(c.wall-c.simulated-c.debt-c.dilated)<1e-8);assert.ok(c.acceptedPhysicsMs>0);
 const accepted=c.accepted;c.frame(10,()=>assert.fail(),()=>({}),true);assert.equal(c.accepted,accepted);assert.equal(c.status,'paused');
});
test('gear event rejection is distinguishable from nonconvergence and overload',()=>{
 for(const [message,kind] of [['Terrain step crosses a gear event: subdivision is required','gear-event'],['Terrain endpoint iteration failed to converge','nonconvergence'],['Terrain candidate energy mismatch','energy-check']]){
  const c=new SimulationClock();const s={a:1};c.frame(.001,()=>{throw Error(message);},()=>s);assert.equal(c.fault.kind,kind);assert.equal(c.status,'fault-paused');assert.equal(c.rejected,1);assert.equal(c.simulated,0);s.a=2;assert.equal(c.fault.snapshot.a,1);c.reset();assert.equal(c.fault,null);
 }
});

test('terrain default budget improves bounded throughput without changing the timestep',()=>{
 let cpu=0;const c=new SimulationClock({now:()=>cpu});let calls=0;
 for(let i=0;i<60;i++)c.frame(1/60,h=>{assert.equal(h,.001);cpu+=.5;calls++;},()=>({}));
 assert.ok(c.realtimeRatio>.95);assert.ok(c.frameSteps<=24);assert.ok(c.debt<=.05);assert.ok(Math.abs(c.simulated-calls*.001)<1e-10);assert.equal(c.budgetMs,12);
});
test('all selectable frequencies advance actual physical time and preserve wall accounting on switching',()=>{
 for(const hz of [1000,500,250,200,100]){let cpu=0;const c=new SimulationClock({now:()=>cpu});c.setFrequency(hz);let time=0;for(let i=0;i<100;i++)c.frame(.01,h=>{assert.equal(h,1/hz);time+=h;cpu+=.01;},()=>({}));assert.ok(Math.abs(time-1)<1e-9);assert.ok(Math.abs(c.simulated-time)<1e-9);assert.ok(Math.abs(c.realtimeRatio-1)<1e-9);c.frame(.0003,()=>assert.fail(),()=>({}));const before=c.simulated;c.setFrequency(1000);assert.equal(c.simulated,before);assert.equal(c.debt,0);assert.ok(Math.abs(c.wall-c.simulated-c.debt-c.dilated)<1e-9);c.reset();assert.equal(c.frequency,1000);}
});
