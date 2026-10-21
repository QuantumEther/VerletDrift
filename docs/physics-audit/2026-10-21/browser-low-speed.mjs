import fs from 'node:fs';
import {chromium} from '/workspace/.verletdrift-tools/node_modules/playwright/index.mjs';
const b=await chromium.launch({executablePath:'/usr/bin/chromium'});const page=await b.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8000/');await page.waitForFunction(()=>window.state);
const samples=await page.evaluate(async()=>{
 const s=window.state; const {initializeCarBody,computeBodyDerivedState}=await import('/js/physics/kinematics.js');
 s.balloons.length=0;s.params.balloonRespawnRate=0;s.engine.currentGear='N';
 initializeCarBody(150,120);for(const [n,w] of Object.entries(s.wheels)){w.prevY=w.y+.01;s.wheelOmega[n]=1/s.params.wheelRadius;}
 s.body.heading=0;computeBodyDerivedState(.01);s.body.longitudinalAccel=s.body.lateralAccel=0;s.steering.frontWheelAngle=.01;s.steering.wheelAngle=.01/s.params.maxFrontWheelAngle*Math.PI*2.5;
 const start=s.loop.simulationTime;const samples=[];
 while(s.loop.simulationTime-start<10){await new Promise(r=>setTimeout(r,10));samples.push({t:s.loop.simulationTime-start,v:s.body.speed,delta:s.steering.frontWheelAngle,wheelAngle:s.steering.wheelAngle,rate:s.steering.angularVelocity,sat:s.steering.selfAligningTorque,isDragging:s.steering.isDragging});}
 return samples;
});
fs.writeFileSync('/workspace/physics-audit/browser-low-speed.json',JSON.stringify({errors,samples},null,2));console.log(JSON.stringify({errors,maxDelta:Math.max(...samples.map(x=>Math.abs(x.delta))),maxRate:Math.max(...samples.map(x=>Math.abs(x.rate))),last:samples.at(-1)}));await b.close();
