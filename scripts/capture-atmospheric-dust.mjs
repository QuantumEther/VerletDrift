// Actual simulator ticks and native rendering; only clock/presentation are test controlled.
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {installLiveGPUTarget} from '../tests/e2e/helpers/live-gpu.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const out=resolve(arg('--output','/tmp/atmospheric-dust'));mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:850}});await installLiveGPUTarget(page);
 const ref=arg('--ref','');
 if(ref)for(const file of ['js/renderer/atmospheric-dust.js','js/shaders/atmospheric-dust.wgsl'])await page.route(url=>url.pathname.endsWith('/'+file),route=>route.fulfill({body:execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}),contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 await page.addInitScript(()=>{window.__frames=[];window.__clock=1000;window.requestAnimationFrame=f=>{window.__frames.push(f);return window.__frames.length;};Date.now=()=>1700000000000+window.__clock;});
 await page.goto(arg('--url','http://localhost:8000')+'/?renderer=gpu&quality=balanced&debugMode=quiet');
 await page.waitForFunction(()=>window.state&&window.__frames.length,null,{polling:100});
 await page.evaluate(async()=>{window.__gpu=await import('/js/gpu-renderer.js');window.__dust=await import('/js/renderer/dust-history.js');});
 await page.waitForFunction(()=>window.__gpu.isGPUReady(),null,{polling:100});
 await page.evaluate(async preset=>{
  const {DUST_PRESETS}=await import('/js/renderer/dust-controls.js');Object.assign(state.params,preset==='baseline'?{dustDensity:.42}:DUST_PRESETS[preset]);
  const s=state;s.params.determinismMode=true;s.params.determinismSeed=1337;s.params.smokeEnabled=false;s.params.showSparks=false;s.params.showTrailArrows=false;s.params.showKinematicArrows=false;s.params.motionBlurIntensity=.000001;s.params.pixelsPerMeter=20;s.params.cameraOmega=18;s.params.cameraZeta=1;s.params.trailSpawnInterval=100000;
  s.balloons=[];s.splatDecals=[];s.engine.currentGear='N';s.engine.clutchEngagement=0;s.engine.clutchPedalPosition=0;
  s.steering.isDragging=true;s.steering.wheelAngle=0;
  const scale=document.getElementById('gpuResolutionScale');scale.value=.25;scale.dispatchEvent(new Event('input',{bubbles:true}));
  window.__setMotion=(speed)=>{const dt=1/s.params.simulationFps;for(const w of Object.values(s.wheels)){w.prevX=w.x;w.prevY=w.y+speed*dt;}for(const n of Object.keys(s.wheelOmega))s.wheelOmega[n]=speed/s.params.wheelRadius;for(const f of Object.values(s.prevTireForce)){f.lon=0;f.lat=0;}};
 },arg('--preset',ref?'baseline':'cinematic'));
 const capture=async(name,motion=false)=>{
  const result=await page.evaluate(async({name,motion})=>{
   const s=state,canvas=document.getElementById('simCanvas');s.params.dustEnabled=!name.endsWith('-off');
   const scale=document.getElementById('gpuResolutionScale');scale.value=1;scale.dispatchEvent(new Event('input',{bubbles:true}));
   window.__gpu.resizeGPU(canvas.width,canvas.height);window.__gpu.renderFrameGPU(canvas.clientWidth,canvas.clientHeight);
   const device=window.__liveGPU,t=window.__liveTexture,stride=Math.ceil(t.width*4/256)*256;
   const read=device.createBuffer({size:stride*t.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),enc=device.createCommandEncoder();
   enc.copyTextureToBuffer({texture:t},{buffer:read,bytesPerRow:stride},[t.width,t.height]);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
   const raw=new Uint8Array(read.getMappedRange()),pixels=new Uint8ClampedArray(t.width*t.height*4);for(let y=0;y<t.height;y++)pixels.set(raw.subarray(y*stride,y*stride+t.width*4),y*t.width*4);read.unmap();read.destroy();
   let c=document.getElementById('dust-capture');if(!c){c=document.createElement('canvas');c.id='dust-capture';document.body.append(c);}c.width=t.width;c.height=t.height;const ctx=c.getContext('2d');ctx.putImageData(new ImageData(pixels,t.width,t.height),0,0);ctx.drawImage(canvas,0,0,t.width,t.height);
   const stats=window.__gpu.getGPURenderStats();s.params.dustEnabled=true;scale.value=.25;scale.dispatchEvent(new Event('input',{bubbles:true}));
   return {time:s.loop.simulationTime,speed:s.body.speed,velocity:[s.body.velocityX,s.body.velocityY],heading:s.body.heading,zoom:s.camera.zoom,stats};
  },{name,motion});
  await page.locator('#dust-capture').screenshot({path:`${out}/${name}.png`});writeFileSync(`${out}/${name}.json`,JSON.stringify(result,null,2));return result;
 };
 const stages=[];
 for(let frame=0;frame<=540;frame++){
  if(frame===25)await page.evaluate(()=>window.__setMotion(16));
  if(frame===85)await page.evaluate(()=>window.__setMotion(32));
  if(frame===115){await page.evaluate(()=>state.steering.wheelAngle=.30/state.params.maxFrontWheelAngle*Math.PI*2.5);await page.keyboard.down('KeyF');}
  if(frame===220){await page.keyboard.up('KeyF');await page.keyboard.down('KeyS');await page.evaluate(()=>{window.__setMotion(0);state.steering.wheelAngle=0;});}
  await page.evaluate(async frame=>{window.__clock=1000+frame*1000/60;const q=window.__frames.splice(0);for(const f of q)f(window.__clock);await window.__liveGPU.queue.onSubmittedWorkDone();},frame);
  if(frame===205)await page.evaluate(()=>window.__benchmarkScene={body:structuredClone(state.body),wheels:structuredClone(state.wheels),camera:structuredClone(state.camera),steering:structuredClone(state.steering),marks:structuredClone(state.skidMarks),time:state.loop.simulationTime});
  const stage={20:'stationary',80:'straight',110:'fast',205:'drift',235:'stopped',540:'settled'}[frame];
  if(stage){stages.push({name:stage,...await capture(stage+'-off')});stages.push({name:stage,...await capture(stage+'-on')});}
  if(((frame>=40&&frame<=110)||(frame>=150&&frame<=300)||(frame>=360&&frame<=540))&&frame%10===0)await capture(`motion-${frame}`,true);
 }
 const fixture=await page.evaluate(()=>{
  state.debug.faults.isFrozen=true;const h=window.__dust.dustHistory();
  return {time:state.loop.simulationTime,body:structuredClone(state.body),wheels:structuredClone(state.wheels),camera:structuredClone(state.camera),steering:structuredClone(state.steering),marks:structuredClone(state.skidMarks),benchmark:window.__benchmarkScene,history:Array.from(h.data),head:h.head,count:h.count};
 });
 writeFileSync(`${out}/fixture.json`,JSON.stringify(fixture));writeFileSync(`${out}/stages.json`,JSON.stringify(stages,null,2));
 if(process.argv.includes('--skip-timing')){console.log({out,stages:stages.length,history:fixture.count});process.exitCode=0;}else{
 // Frozen real driving scene, no readbacks in timing loop; fixed simulation state.
 const timing=await page.evaluate(async()=>{
  const scene=window.__benchmarkScene;Object.assign(state.body,scene.body);state.wheels=scene.wheels;state.camera=scene.camera;state.steering=scene.steering;state.skidMarks=scene.marks;state.loop.simulationTime=scene.time;
  const c=document.getElementById('simCanvas'),scale=document.getElementById('gpuResolutionScale');scale.value=1;scale.dispatchEvent(new Event('input',{bubbles:true}));window.__gpu.resizeGPU(c.width,c.height);
  const result={};for(const enabled of [false,true]){state.params.dustEnabled=enabled;const samples=[];for(let i=0;i<24;i++){const start=performance.now();window.__gpu.renderFrameGPU(c.clientWidth,c.clientHeight);const encoded=performance.now();await window.__liveGPU.queue.onSubmittedWorkDone();if(i>=4)samples.push({encodeMs:encoded-start,completionMs:performance.now()-start});}result[enabled?'on':'off']={samples,stats:window.__gpu.getGPURenderStats()};}return result;
 });
 writeFileSync(`${out}/timing.json`,JSON.stringify({backend:process.argv.includes('--native')?'Native requested; verify adapter below. CPU-observed queue completion, not GPU execution time.':'Forced SwiftShader; completion is CPU-observed queue completion, not native GPU time.',...timing},null,2));console.log({out,stages:stages.length,history:fixture.count});
 }
}finally{await browser.close();}
