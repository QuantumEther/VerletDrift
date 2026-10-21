// Interleaved A/B over a recorded real simulator drift, without timed readbacks.
import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),ref=arg('--ref','');
const fixture=JSON.parse(readFileSync(arg('--fixture','docs/rendering/atmospheric-dust/fixture.json'),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({baseURL:arg('--url','http://localhost:8000')});
 if(ref)for(const file of ['js/gpu-renderer.js','js/renderer/atmospheric-dust.js','js/shaders/atmospheric-dust.wgsl']){
  const body=execFileSync('git',['show',`${ref}:${file}`],{cwd:root,encoding:'utf8'});
  await page.route(url=>url.pathname.endsWith('/'+file),route=>route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 }
 if(!await bootSimulatorLiquid(page))throw Error('WebGPU unavailable');
 await page.evaluate(async f=>{
  const {s,target}=window.__liquidHarness,b=f.benchmark;target.width=926;target.height=696;
  Object.assign(s.body,b.body);s.wheels=b.wheels;s.camera=b.camera;s.steering=b.steering;s.skidMarks=b.marks;s.loop.simulationTime=b.time;s.params.pixelsPerMeter=20;s.params.liquidEnabled=false;
  const {observeDust,resetDustHistory}=await import('/js/renderer/dust-history.js');resetDustHistory();
  for(let i=0;i<f.count;i++){const k=((f.head+i)%96)*8,h=f.history;observeDust({centerX:h[k],centerY:h[k+1],velocityX:h[k+4],velocityY:h[k+5],heading:h[k+6],angularVelocity:h[k+7]},h[k+2]);}
 },fixture);
 const data=await page.evaluate(async count=>{
  const {s,gpu,target}=window.__liquidHarness,samples=[];const stats={};
  for(let i=-8;i<count;i++){
   const enabled=((i+8)%4===1||(i+8)%4===2);s.params.dustEnabled=enabled;
   const start=performance.now();gpu.renderFrameGPU(target.width,target.height);const encoded=performance.now();await window.__liquidDevice.queue.onSubmittedWorkDone();
   if(i>=0){samples.push({enabled,encodeMs:encoded-start,completionMs:performance.now()-start});stats[enabled?'on':'off']=gpu.getGPURenderStats();}
  }return {samples,stats};
 },Number(arg('--samples','40')));
 if(data.stats.on.error||data.stats.on.dustError)throw Error(JSON.stringify(data.stats.on));
 writeFileSync(arg('--output','/tmp/dust-benchmark.json'),JSON.stringify({ref:ref||'working tree',backend:process.argv.includes('--native')?'Native requested; verify adapter in stats. Queue completion is CPU observed, not GPU execution time.':'Forced SwiftShader; queue completion is CPU observed, not native GPU execution time.',...data},null,2));
 console.log({ref:ref||'current',marks:fixture.benchmark.marks.length,samples:data.samples.length});
}finally{await browser.close();}
