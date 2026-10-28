import {performance}from 'node:perf_hooks';import{createVehicle,stepVehicle}from '../src/vehicle.js';
const s=createVehicle({worn:true});const durations=[];let maxCases=0,events=0;
for(let i=0;i<2000;i++){s.gearbox.driverForce=Math.floor(i/40)%2?120:-120;s.flywheel.engagement=i%100<50?1:0;const start=performance.now();stepVehicle(s,{drive:30});durations.push(performance.now()-start);maxCases=Math.max(maxCases,s.gearbox.lastStepCases||0);events+=s.gearbox.eventIterations||0;}
const sorted=[...durations].sort((a,b)=>a-b);console.log(JSON.stringify({steps:2000,meanMs:durations.reduce((a,b)=>a+b)/durations.length,p95Ms:sorted[1900],worstMs:sorted.at(-1),slowest1000StepsMs:durations.slice(0,1000).reduce((a,b)=>a+b),maxCases,eventSearchTrials:events}));
