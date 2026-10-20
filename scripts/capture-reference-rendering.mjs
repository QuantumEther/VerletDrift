// Matched simulator captures, optionally substituting v29 sources without switching branches.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootSimulatorLiquid,renderSimulatorLiquid,impactSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const output=resolve(arg('--output','/tmp/reference-rendering'));mkdirSync(output,{recursive:true});
const height=Number(arg('--height','720')),samples=Number(arg('--samples','0'));
const ref=arg('--ref',''),zoom=Number(arg('--zoom','20')),preset=arg('--preset','daylight');
const fixturePath=arg('--fixture','');const fixture=fixturePath?JSON.parse(readFileSync(fixturePath,'utf8')):null;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({baseURL:arg('--url','http://localhost:8000'),viewport:{width:960,height:720}});
 if(ref){for(const file of ['js/gpu-renderer.js','js/shaders/environment.wgsl','js/shaders/background.wgsl','js/shaders/skid-vector.wgsl','js/shaders/surface-objects.wgsl']){
  const body=execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8'});
  await page.route(`**/${file}`,route=>route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 }}
 if(!await bootSimulatorLiquid(page))throw Error('Simulator GPU initialization failed');
 await page.evaluate(async({fixture,zoom,preset,height})=>{
  const {s,target,events}=window.__liquidHarness;target.width=960;target.height=height;
  if(fixture){
   for(const key of ['body','wheels','steering','skidMarks','balloons'])s[key]=structuredClone(fixture.state[key]);
   Object.assign(s.engine,fixture.state.engine);
   for(const e of fixture.events)events.recordLiquidImpact({x:e.x,y:e.y,radius:.6*Math.cbrt(e.volume/18),hue:e.hue},e.speed,{...s.body,velocityX:e.dx*e.speed,velocityY:e.dy*e.speed},e.time);
  }
  const {LIGHT_PRESETS}=await import('/js/renderer/environment.js');Object.assign(s.params,LIGHT_PRESETS[preset]);
  s.params.pixelsPerMeter=zoom;s.params.balloonAppearance=1;s.params.showTrailArrows=false;
  const hit=fixture?.events.at(-1);
  s.camera.x=(s.body.centerX+(hit?.x??s.body.centerX))*.5;s.camera.y=(s.body.centerY+(hit?.y??s.body.centerY))*.5;
  // Framing balloons are deliberate fixtures, separate from the recorded collision.
  s.balloons=[-5,0,5].map((x,i)=>({x:s.body.centerX+x,y:s.body.centerY-8,radius:.48,hue:350,isPopped:false}));
 },{fixture,zoom,preset,height});
 if(!fixture)await impactSimulatorLiquid(page,{hue:350});
 const collisionTime=fixture?.events.at(-1)?.time??0;const frames=[];
 for(const [age,name]of[[0,'dry'],[.7,'impact'],[5,'wet'],[70,'residue']]){
  const frame=await renderSimulatorLiquid(page,collisionTime+age,true);
  if(frame.errors.length||frame.stats.liquidError)throw Error(JSON.stringify(frame));
  await page.locator('#liquid-capture').screenshot({path:`${output}/${name}.png`});frames.push({name,age,...frame});
 }
 const timing=await page.evaluate(async({time,samples:count})=>{
  if(!count)return [];
  const {s,gpu,target}=window.__liquidHarness,d=window.__liquidDevice;s.loop.simulationTime=time;
  const samples=[];for(let i=0;i<count+4;i++){
   const begin=performance.now();gpu.renderFrameGPU(target.width,target.height);const submitted=performance.now();await d.queue.onSubmittedWorkDone();
   if(i>=4)samples.push({encodeMs:submitted-begin,completionMs:performance.now()-begin});
  }return samples;
 },{time:collisionTime+5,samples});
 writeFileSync(`${output}/measurements.json`,JSON.stringify({ref:ref||'working tree',zoom,preset,fixture:!!fixture,frames,timing,warning:'Forced SwiftShader: CPU-observed completion includes software GPU and queue waiting. Not native GPU execution time or RTX performance.'},null,2));
 console.log(JSON.stringify({output,errors:frames.flatMap(f=>f.errors),resources:frames[2].stats.resourceCount,draws:frames[2].stats.drawCalls}));
}finally{await browser.close();}
