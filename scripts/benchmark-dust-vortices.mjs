// Isolated compute and draw submission costs. Optional timestamps time each pass.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bootSimulatorLiquid} from '../tests/e2e/helpers/simulator-liquid.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const ref=arg('--ref',''),fixture=JSON.parse(readFileSync('docs/rendering/dust-calibration/fixture.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({baseURL:'http://localhost:8000'});
 if(ref)for(const file of ['js/renderer/atmospheric-dust.js','js/shaders/atmospheric-dust.wgsl'])await page.route(url=>url.pathname.endsWith('/'+file),route=>route.fulfill({body:execFileSync('git',['show',`${ref}:${file}`],{encoding:'utf8'}),contentType:file.endsWith('.js')?'text/javascript':'text/plain'}));
 if(!await bootSimulatorLiquid(page,'gpuProfile=1&gpuPower=high-performance'))throw Error('No adapter');
 const data=await page.evaluate(async({f,ref,count})=>{
  const d=window.__liquidDevice,{s}=window.__liquidHarness,b=f.benchmark;
  Object.assign(s.body,b.body);s.camera=b.camera;s.loop.simulationTime=b.time;s.params.pixelsPerMeter=20;s.params.dustDensity=ref?.48:.8;
  const {observeDust,resetDustHistory}=await import('/js/renderer/dust-history.js');resetDustHistory();
  for(let i=0;i<f.count;i++){const k=((f.head+i)%96)*8,h=f.history;observeDust({centerX:h[k],centerY:h[k+1],velocityX:h[k+4],velocityY:h[k+5],heading:h[k+6],angularVelocity:h[k+7]},h[k+2]);}
  const {AtmosphericDust}=await import('/js/renderer/atmospheric-dust.js'),{lighting}=await import('/js/renderer/environment.js'),{GPUComputeTiming}=await import('/js/renderer/gpu-compute-timing.js');
  const env=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});d.queue.writeBuffer(env,0,lighting(s.params));
  const source=await fetch('/js/shaders/environment.wgsl').then(r=>r.text());
  const dust=new AtmosphericDust(d,'rgba8unorm',env,source);await dust.init();dust.timing?.destroy();dust.timing=null;
  const timestamp=d.features.has('timestamp-query'),computeTimer=timestamp?new GPUComputeTiming(d):null,drawTimer=timestamp?new GPUComputeTiming(d):null;
  const tex=d.createTexture({size:[926,696],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const samples=[],stages=['compute','both','draw','draw','both','compute'];
  let cs=0,rs=0;const gpuCompute=[],gpuDraw=[];
  for(let i=-12;i<count;i++){
   const stage=stages[(i+12)%6];s.params.dustFlowDebug=false;
   const start=performance.now();if(stage!=='draw')dust.prepare(s,926,696,{x:s.camera.x,y:s.camera.y},20*s.camera.zoom,{detail:1});
   const e=d.createCommandEncoder();
   if(stage!=='draw'){
    const original=e.beginComputePass.bind(e);e.beginComputePass=desc=>original({...desc,timestampWrites:computeTimer?.begin()});dust.encode(e);computeTimer?.encode(e);
   }
   if(stage!=='compute'){
    const p=e.beginRenderPass({timestampWrites:drawTimer?.begin(),colorAttachments:[{view:tex.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:.05,g:.05,b:.05,a:1}}]});dust.draw(p);p.end();drawTimer?.encode(e);
   }
   d.queue.submit([e.finish()]);computeTimer?.submitted();drawTimer?.submitted();const encoded=performance.now();await d.queue.onSubmittedWorkDone();const completed=performance.now();
   await new Promise(r=>setTimeout(r,0));
   if(i>=0)samples.push({stage,encodeMs:encoded-start,completionMs:completed-start});
   if(computeTimer&&computeTimer.samples!==cs){cs=computeTimer.samples;gpuCompute.push(computeTimer.milliseconds);}
   if(drawTimer&&drawTimer.samples!==rs){rs=drawTimer.samples;gpuDraw.push(drawTimer.milliseconds);}
  }
  const stats={...dust.stats,bytes:dust.bytes,visible:dust.readDrawCounts?await dust.readDrawCounts():null};computeTimer?.destroy();drawTimer?.destroy();dust.destroy();env.destroy();tex.destroy();
  return {adapter:window.__liquidHarness.gpu.getGPURenderStats().adapter,timestamp,stats,samples,computeTimestampMs:gpuCompute,drawTimestampMs:gpuDraw,errors:window.__liquidErrors};
 },{f:fixture,ref,count:Number(arg('--samples','60'))});
 if(data.errors.length)throw Error(JSON.stringify(data.errors));
 writeFileSync(arg('--output','/tmp/dust-isolated.json'),JSON.stringify({ref:ref||'v34',backend:process.argv.includes('--native')?'Native requested; verify adapter.':'Forced SwiftShader: timestamp values are software pass execution, not RTX GPU time.',...data},null,2));console.log({ref:ref||'v34',samples:data.samples.length,timestamp:data.timestamp});
}finally{await browser.close();}
