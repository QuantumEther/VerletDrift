// Same-frame material A/B: advance the original emitter once; shade identical GPU particles twice.
import {chromium} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {bootSimulatorLiquid,renderSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const out=arg('--output','/tmp/smoke-volume-motion'),only=arg('--scenario',''),fixture=JSON.parse(readFileSync('docs/rendering/dust-calibration/fixture.json','utf8'));
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const stats=[];
try{for(const scenario of ['straight','wheelspin','drift','countersteer','stop','dissipation'].filter(s=>!only||s===only)){
 const page=await browser.newPage({baseURL:arg('--url','http://localhost:8000'),viewport:{width:1000,height:800}});
 if(!await bootSimulatorLiquid(page))throw Error('No adapter');
 await page.evaluate(async({scenario,fixture,dense})=>{
  const {s,target}=window.__liquidHarness;target.width=720;target.height=560;
  Object.assign(s.params,{pixelsPerMeter:20,dustEnabled:false,liquidEnabled:false,smokeEnabled:true,smokeAirflowEnabled:true,smokeAirflowStrength:1,showSkidMarks:false,determinismMode:true,determinismSeed:8294});
  if(dense)Object.assign(s.params,{smokeSpawnRate:200,smokeLifetimeMin:3,smokeLifetimeMax:3});
  window.__world=await import('/js/renderer/world.js');const emitter=await import('/js/renderer/smoke-system.js');const history=await import('/js/renderer/dust-history.js');history.resetDustHistory();
  const poses=[];for(let i=0;i<fixture.count;i++){const k=((fixture.head+i)%96)*8,d=fixture.history;poses.push({t:d[k+2],centerX:d[k],centerY:d[k+1],velocityX:d[k+4],velocityY:d[k+5],heading:d[k+6],angularVelocity:d[k+7]});}
  const offsets=Object.fromEntries(Object.entries(s.wheels).map(([n,w])=>[n,{x:w.x-s.body.centerX,y:w.y-s.body.centerY}]));
  const recorded=t=>{let a=poses[0],b=poses.at(-1);for(let i=1;i<poses.length;i++)if(poses[i].t>=t){a=poses[i-1];b=poses[i];break;}const f=Math.max(0,Math.min(1,(t-a.t)/Math.max(1e-6,b.t-a.t)));const p={};for(const k of ['centerX','centerY','velocityX','velocityY','heading','angularVelocity'])p[k]=a[k]+(b[k]-a[k])*f;return p;};
  window.__advance=t=>{
   let b={centerX:0,centerY:-12*t,velocityX:0,velocityY:-12,heading:0,angularVelocity:0};
   if(scenario==='wheelspin')Object.assign(b,{centerY:-4*t,velocityY:-4});
   if(['drift','stop','dissipation'].includes(scenario)){
    const stop=scenario==='drift'?10:2;Object.assign(b,recorded(Math.min(t,stop)+1.4));
    if(t>stop)Object.assign(b,{velocityX:0,velocityY:0,angularVelocity:0});
   }
   if(scenario==='countersteer')Object.assign(b,{centerX:3*Math.sin(t*1.5),centerY:-12*t,velocityX:4.5*Math.cos(t*1.5),heading:.7*Math.sin(t*2),angularVelocity:1.4*Math.cos(t*2)});
   Object.assign(s.body,b);s.body.speed=Math.hypot(b.velocityX,b.velocityY);s.loop.simulationTime=t;
   const viewVelocity=['stop','dissipation'].includes(scenario)?recorded(1.4):b;
   Object.assign(s.camera,{x:b.centerX-viewVelocity.velocityX*.16,y:b.centerY-viewVelocity.velocityY*.16,zoom:1});
   for(const [n,o]of Object.entries(offsets)){const c=Math.cos(b.heading),q=Math.sin(b.heading);s.wheels[n].x=b.centerX+o.x*c-o.y*q;s.wheels[n].y=b.centerY+o.x*q+o.y*c;
    s.wheelSlipRatio[n]=n.startsWith('rear')?(scenario==='wheelspin'?2:1):0;
    Object.assign(s.wheelKinematics[n],{wheelVelX:b.velocityX, wheelVelY:b.velocityY});}
   history.observeDust(s.body,t,true);emitter.updateSmoke(1/120);
  };
 },{scenario,fixture,dense:process.argv.includes('--dense')});
 await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/vehicles/')).length>=2);
 const name=scenario;for(const mode of [0,2])mkdirSync(`${out}/${name}-${mode}`,{recursive:true});
 let peakSlots=0;
 const duration=scenario==='dissipation'?5:3.5;let last;
 for(let frame=0;frame<=Math.ceil(duration*24);frame++){
  await page.evaluate(frame=>{for(let step=0;step<5;step++)window.__advance((frame*5+step)/120);},frame);
  const t=(frame*5+4)/120;
  if(frame%2===0){
   for(const mode of [0,2]){
    await page.evaluate(m=>window.__liquidHarness.s.params.smokeShadingMode=m,mode);
    last=await renderSimulatorLiquid(page,t,true);peakSlots=Math.max(peakSlots,last.stats.smokeSlots);if(last.errors.length||last.stats.airflowError||last.stats.smokeMaterialError)throw Error(JSON.stringify(last));
    await page.evaluate(()=>{const c=document.getElementById('liquid-capture'),ctx=c.getContext('2d');window.__world.applyCameraTransform(ctx,c.width,c.height);window.__world.drawCar(ctx,false);window.__world.removeCameraTransform(ctx);});
    await page.locator('#liquid-capture').screenshot({path:`${out}/${name}-${mode}/${String(frame/2).padStart(3,'0')}.png`});
   }
  }else await page.evaluate(t=>{const {s,gpu,target}=window.__liquidHarness;s.loop.simulationTime=t;gpu.renderFrameGPU(target.width,target.height);},t);
 }
 if(!peakSlots)throw Error(`${scenario}: no smoke emitted; check the existing emission gates`);
 stats.push({scenario,peakSlots,...last});await page.close();console.log(name);
}
const old=only?(()=>{try{return JSON.parse(readFileSync(`${out}/validation.json`,'utf8')).filter(s=>s.scenario!==only);}catch{return [];}})():[];
writeFileSync(`${out}/validation.json`,JSON.stringify([...old,...stats],null,2));}finally{await browser.close();}
