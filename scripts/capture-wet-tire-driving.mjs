// Deterministic real main-loop comparison. Only browser timing/presentation are test-controlled.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {installLiveGPUTarget} from '../tests/e2e/helpers/live-gpu.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const ref=arg('--ref',''),out=resolve(arg('--output','/tmp/wet-tire-driving'));mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await b.newPage({viewport:{width:1000,height:850}});await installLiveGPUTarget(p);
 if(ref){for(const file of ['js/main.js','js/balloon.js','js/gpu-renderer.js','js/renderer/gpu-skid-cache.js','js/renderer/liquid-world.js','js/renderer/liquid-events.js','js/renderer/liquid-settings.js','js/shaders/liquid/material.wgsl','js/shaders/liquid/simulator.wgsl']){
  const body=execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8'});await p.route(`**/${file}`,r=>r.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 }}
 await p.addInitScript(()=>{
  window.__frames=[];window.__clock=1000;window.requestAnimationFrame=f=>{window.__frames.push(f);return window.__frames.length;};
  Date.now=()=>1700000000000+window.__clock;
 });
 await p.goto(arg('--url','http://localhost:8000')+'/?renderer=gpu&quality=balanced&debugMode=quiet');
 await p.waitForFunction(()=>window.state&&window.__frames.length,null,{polling:100});
 await p.evaluate(async()=>{window.__gpu=await import('/js/gpu-renderer.js');window.__events=await import('/js/renderer/liquid-events.js');window.__wet=await import('/js/renderer/wet-trail-events.js');});
 await p.waitForFunction(()=>window.__gpu.isGPUReady(),null,{polling:100});
 await p.evaluate(()=>{
  const s=state,dt=1/s.params.simulationFps;
  s.params.determinismMode=true;s.params.determinismSeed=1337;
  s.params.smokeEnabled=false;s.params.showSparks=false;s.params.showTrailArrows=false;s.params.showKinematicArrows=false;s.params.motionBlurIntensity=0;s.params.pixelsPerMeter=20;
  s.balloons=[];s.splatDecals=[];s.params.balloonAppearance=1;
  s.engine.currentGear='N';s.engine.clutchEngagement=0;s.engine.clutchPedalPosition=0;
  for(const w of Object.values(s.wheels)){w.prevX=w.x;w.prevY=w.y+22*dt;}
  for(const n of Object.keys(s.wheelOmega))s.wheelOmega[n]=22/s.params.wheelRadius;
  for(const f of Object.values(s.prevTireForce)){f.lon=0;f.lat=0;}
  s.steering.isDragging=true;s.steering.wheelAngle=.24/s.params.maxFrontWheelAngle*Math.PI*2.5;
  const n=document.getElementById('gpuResolutionScale');n.value=.25;n.dispatchEvent(new Event('input',{bubbles:true}));
 });
 await p.keyboard.down('KeyF');
 for(let frame=0;frame<=160;frame++){
  await p.evaluate(async frame=>{
   if([15,40,65].includes(frame)){
    const w=state.wheels.frontLeft,hue={15:210,40:120,65:270}[frame];
    state.balloons=[{x:w.x,y:w.y,radius:.6,hue,isPopped:false,deformTime:0,deformScale:1,deformDir:{x:0,y:0}}];
   }
   window.__clock=1000+frame*1000/60;const queue=window.__frames.splice(0);for(const f of queue)f(window.__clock);
   await window.__liveGPU.queue.onSubmittedWorkDone();
  },frame);
 }
 const fixture=await p.evaluate(()=>{
  state.debug.faults.isFrozen=true;window.__nativeMarks=state.skidMarks;
  return {body:structuredClone(state.body),wheels:structuredClone(state.wheels),steering:structuredClone(state.steering),camera:structuredClone(state.camera),time:state.loop.simulationTime,
   marks:structuredClone(state.skidMarks),impacts:window.__events.getLiquidImpacts().events,transfers:window.__wet.getWetTireTransfers().events,tires:structuredClone(state.tirePaint),stats:window.__gpu.getGPURenderStats()};
 });
 writeFileSync(`${out}/fixture.json`,JSON.stringify(fixture));
 // Freeze geometry and native source opacity, then inspect only the optical lifecycle.
 for(const [age,name]of [[0,'fresh'],[9,'drying'],[35,'residue'],[120,'clean'],[0,'detail']]){
  const stats=await p.evaluate(async({time,age,name})=>{
   state.loop.simulationTime=time+age;
   state.trail.arrows=[];
   if(age>0){state.skidMarks=[];state.skidMarksNewThisFrame=[];}else{state.skidMarks=window.__nativeMarks;}
   // Same authored camera in both revisions, broad enough to include all three impacts.
   const hits=window.__events.getLiquidImpacts().events;
   const hit=hits.at(-1);state.camera.x=(state.body.centerX+hit.x)*.5;state.camera.y=(state.body.centerY+hit.y)*.5;state.camera.zoom=1;
   state.params.pixelsPerMeter=name==='detail'?58:20;
   if(name==='detail'){const speed=Math.hypot(state.body.velocityX,state.body.velocityY);state.camera.x=state.body.centerX-state.body.velocityX/speed*3;state.camera.y=state.body.centerY-state.body.velocityY/speed*3;}
   const canvas=document.querySelector('#simCanvas');window.__gpu.resizeGPU(canvas.width,canvas.height);window.__gpu.renderFrameGPU(canvas.clientWidth,canvas.clientHeight);
   const d=window.__liveGPU,t=window.__liveTexture,stride=Math.ceil(t.width*4/256)*256;
   const read=d.createBuffer({size:stride*t.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),enc=d.createCommandEncoder();
   enc.copyTextureToBuffer({texture:t},{buffer:read,bytesPerRow:stride},[t.width,t.height]);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
   const raw=new Uint8Array(read.getMappedRange()),pixels=new Uint8ClampedArray(t.width*t.height*4);
   for(let y=0;y<t.height;y++)pixels.set(raw.subarray(y*stride,y*stride+t.width*4),y*t.width*4);
   read.unmap();read.destroy();
   let c=document.getElementById('wet-capture');if(!c){c=document.createElement('canvas');c.id='wet-capture';document.body.append(c);}
   c.width=t.width;c.height=t.height;c.getContext('2d').putImageData(new ImageData(pixels,t.width,t.height),0,0);
   return window.__gpu.getGPURenderStats();
  },{time:fixture.time,age,name});
  await p.locator('#wet-capture').screenshot({path:`${out}/${name}.png`});writeFileSync(`${out}/${name}.json`,JSON.stringify(stats,null,2));
 }
 console.log(JSON.stringify({out,time:fixture.time,hues:fixture.impacts.map(e=>e.hue),tireHues:Object.values(fixture.tires).map(t=>t.hue),marks:fixture.marks.length,transfers:fixture.transfers.length}));
}finally{await b.close();}
