import fs from 'node:fs';
import {chromium} from '/workspace/.verletdrift-tools/node_modules/playwright/index.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:8000/');
await page.waitForFunction(()=>window.state);
const params=await page.evaluate(()=>({...window.state.params}));
fs.writeFileSync('/workspace/physics-audit/browser-defaults.json',JSON.stringify(params,null,2));
const result=await page.evaluate(async()=>{
 const s=window.state;s.balloons.length=0;
 const samples=[];
 for(let i=0;i<100;i++){
  await new Promise(r=>setTimeout(r,20));
  samples.push({t:s.loop.simulationTime,v:s.body.speed,delta:s.steering.frontWheelAngle,rate:s.steering.angularVelocity,sat:s.steering.selfAligningTorque,drag:s.steering.isDragging});
 }
 return samples;
});
fs.writeFileSync('/workspace/physics-audit/browser-stationary.json',JSON.stringify({errors,samples:result},null,2));
console.log(JSON.stringify({errors,defaults:{damping:params.steeringViscousDamping,gripLoss:params.gripLossThreshold,gripRecovery:params.gripRecoveryThreshold,constraintDamping:params.constraintDamping,constraintIterations:params.constraintIterations},stationary:result.at(-1)}));
await browser.close();
