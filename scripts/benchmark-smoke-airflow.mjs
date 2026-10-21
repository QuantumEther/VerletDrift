// Actual GPU pass timestamps, CPU encoding, and CPU-observed completion kept separate.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bootSmokeCompute} from '../tests/e2e/helpers/smoke-airflow.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const fixture=JSON.parse(readFileSync('docs/rendering/dust-calibration/fixture.json','utf8'));
const baseline=execFileSync('git',['show','acd64ac:js/shaders/smoke-compute.wgsl'],{encoding:'utf8'});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({baseURL:arg('--url','http://localhost:8000')});
 const info=await bootSmokeCompute(page,{count:8000,profile:true});
 const results=await page.evaluate(async({fixture,baseline,samples})=>{
  const a=window.__smoke,{d,flow}=a;
  for(let i=0;i<fixture.count;i++){const k=((fixture.head+i)%96)*8,h=fixture.history;a.h.observeDust({centerX:h[k],centerY:h[k+1],velocityX:h[k+4],velocityY:h[k+5],heading:h[k+6],angularVelocity:h[k+7]},h[k+2]);}
  const h=fixture.history;Object.assign(a.s.body,{centerX:194.27966,centerY:79.84992,velocityX:3.0401,velocityY:-26.3849,heading:.76986,angularVelocity:.42847});a.s.loop.simulationTime=3;
  for(let i=0;i<a.count;i++){a.seeds[i*12]=a.s.body.centerX+(i%100-50)*.14;a.seeds[i*12+1]=a.s.body.centerY+Math.floor(i/100)*.3;}
  a.uniformData.set([1/60,0,2.5,3,a.s.body.centerX,a.s.body.centerY,1,0]);a.uint[1]=a.count;d.queue.writeBuffer(a.uniform,0,a.uniformData);
  const old=await d.createComputePipelineAsync({layout:'auto',compute:{module:d.createShaderModule({code:baseline}),entryPoint:'computeSmoke'}});
  const oldGroup=d.createBindGroup({layout:old.getBindGroupLayout(0),entries:[a.uniform,a.particles,a.flags].map((buffer,binding)=>({binding,resource:{buffer}}))});
  const ts=d.features.has('timestamp-query');const query=ts?d.createQuerySet({type:'timestamp',count:4}):null;
  const resolved=ts?d.createBuffer({size:32,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}):null;
  const read=ts?d.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}):null;
  const result={scope:'Isolated 8000 live particles, 96x96 velocity grid; fixed actual drift observations; 6 warmups; alternating order; no rendering/presentation',counts:[],samples:[],errors:a.errors};
  let baselineState,disabledState;
  for(let i=0;i<samples+6;i++)for(const mode of (i%2?['on','off','v34']:['v34','off','on'])){
   a.reset();a.s.params.smokeAirflowEnabled=mode==='on';flow.prepare(a.s,false);
   const start=performance.now(),e=d.createCommandEncoder();
   if(mode==='on'){
    const p=e.beginComputePass({timestampWrites:ts?{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}:undefined});p.setPipeline(flow.pipeline);p.setBindGroup(0,flow.group);p.dispatchWorkgroups(12,12);p.end();
   }
   const p=e.beginComputePass({timestampWrites:ts?{querySet:query,beginningOfPassWriteIndex:2,endOfPassWriteIndex:3}:undefined});p.setPipeline(mode==='v34'?old:a.pipeline);p.setBindGroup(0,mode==='v34'?oldGroup:a.group);if(mode!=='v34')p.setBindGroup(1,a.flowGroup);p.dispatchWorkgroups(Math.ceil(a.count/256));p.end();
   if(ts){e.resolveQuerySet(query,0,4,resolved,0);e.copyBufferToBuffer(resolved,0,read,0,32);}
   d.queue.submit([e.finish()]);const encodeMs=performance.now()-start;
   await d.queue.onSubmittedWorkDone();const completionMs=performance.now()-start;
   let values;if(ts){await read.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(read.getMappedRange());values={gridMs:mode==='on'?Number(t[1]-t[0])/1e6:0,smokeMs:Number(t[3]-t[2])/1e6};read.unmap();}
   if(i>=6)result.samples.push({mode,encodeMs,completionMs,vortices:flow.stats.vortices,...values});
   if(i===0&&mode==='v34')baselineState=await a.snapshot();if(i===0&&mode==='off')disabledState=await a.snapshot();
  }
  result.disabledExactlyMatchesV34=baselineState.every((v,i)=>Object.is(v,disabledState[i]));result.vortices=Math.max(...result.samples.map(s=>s.vortices));
  query?.destroy();resolved?.destroy();read?.destroy();flow.destroy();d.destroy();return result;
 },{fixture,baseline,samples:Number(arg('--samples','24'))});
 writeFileSync(arg('--output','/tmp/smoke-airflow-profile.json'),JSON.stringify({info,...results},null,2));console.log({info,samples:results.samples.length,disabledExactlyMatchesV34:results.disabledExactlyMatchesV34,errors:results.errors});
}finally{await browser.close();}
