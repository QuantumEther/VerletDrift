// Material iteration/benchmark over the unchanged recorded real main-loop maneuver.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootSimulatorLiquid,renderSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),ref=arg('--ref',''),out=resolve(arg('--output','/tmp/wet-replay'));
const fixture=JSON.parse(readFileSync(arg('--fixture','docs/rendering/wet-tire-liquid/after/fixture.json'),'utf8'));mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({baseURL:arg('--url','http://localhost:8000'),viewport:{width:1000,height:850}});
 if(ref)for(const file of ['js/balloon.js','js/gpu-renderer.js','js/renderer/gpu-skid-cache.js','js/renderer/liquid-world.js','js/renderer/liquid-events.js','js/renderer/liquid-settings.js','js/shaders/liquid/material.wgsl','js/shaders/liquid/simulator.wgsl']){
  const body=execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8'});await page.route(`**/${file}`,r=>r.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 }
 if(!await bootSimulatorLiquid(page))throw Error('GPU initialization failed');
 await page.evaluate(async f=>{
  const {s,target,events}=window.__liquidHarness;target.width=926;target.height=694;
  Object.assign(s.body,f.body);s.wheels=f.wheels;s.steering=f.steering;s.skidMarks=f.marks;window.__originalMarks=f.marks;
  s.params.balloonAppearance=1;s.params.pixelsPerMeter=20;s.trail.arrows=[];
  events.resetLiquidImpacts();
  for(const e of f.impacts)events.recordLiquidImpact({x:e.x,y:e.y,radius:.6*Math.cbrt(e.volume/18),hue:e.hue},e.speed,{heading:0,velocityX:e.dx*e.speed,velocityY:e.dy*e.speed,centerX:e.x+(e.bodyContact?0:20),centerY:e.y},e.time);
  const wet=await import('/js/renderer/wet-trail-events.js');
  const key=e=>[e.x1,e.y1,e.x2,e.y2].join(':');const source=new Map(f.transfers.map(e=>[key(e),e]));
  for(const m of f.marks){const e=source.get(key(m));if(e){const alpha=m.alpha;m.alpha=e.dose;wet.recordWetTireTransfer(m,e.time);m.alpha=alpha;}}
  const hit=f.impacts.at(-1);s.camera.x=(s.body.centerX+hit.x)*.5;s.camera.y=(s.body.centerY+hit.y)*.5;s.camera.zoom=1;
 },fixture);
 const frames=[];
 for(const [age,name]of [[0,'fresh'],[9,'drying'],[35,'residue'],[120,'clean'],[0,'detail']]){
  await page.evaluate(({age,name})=>{
   const {s}=window.__liquidHarness;s.skidMarks=age>0?[]:window.__originalMarks;s.params.pixelsPerMeter=name==='detail'?58:20;
   const hit=window.__liquidHarness.events.getLiquidImpacts().events.at(-1);
   s.camera.x=(s.body.centerX+hit.x)*.5;s.camera.y=(s.body.centerY+hit.y)*.5;
   if(name==='detail'){const speed=Math.hypot(s.body.velocityX,s.body.velocityY);s.camera.x=s.body.centerX-s.body.velocityX/speed*3;s.camera.y=s.body.centerY-s.body.velocityY/speed*3;}
  },{age,name});
  const frame=await renderSimulatorLiquid(page,fixture.time+age,true);if(frame.errors.length||frame.stats.liquidError)throw Error(JSON.stringify(frame));
  await page.locator('#liquid-capture').screenshot({path:`${out}/${name}.png`});frames.push({name,age,...frame});
 }
 const samples=Number(arg('--samples','0'));
 const timing=await page.evaluate(async({time,count})=>{
  const {s,gpu,target}=window.__liquidHarness;s.params.pixelsPerMeter=20;s.loop.simulationTime=time;s.skidMarks=window.__originalMarks;
  const hit=window.__liquidHarness.events.getLiquidImpacts().events.at(-1);s.camera.x=(s.body.centerX+hit.x)*.5;s.camera.y=(s.body.centerY+hit.y)*.5;
  const result=[];for(let i=0;i<count+4&&count;i++){
   const start=performance.now();gpu.renderFrameGPU(target.width,target.height);const submitted=performance.now();await window.__liquidDevice.queue.onSubmittedWorkDone();
   if(i>=4)result.push({encodeMs:submitted-start,completionMs:performance.now()-start});
  }return result;
 },{time:fixture.time,count:samples});
 writeFileSync(`${out}/measurements.json`,JSON.stringify({ref:ref||'working tree',frames,timing,backend:'Forced SwiftShader; completion is CPU-observed queue completion, not native GPU execution time.'},null,2));
 console.log({out,errors:frames.flatMap(f=>f.errors),transfers:frames[0].stats.liquid?.wetTransfers});
}finally{await browser.close();}
