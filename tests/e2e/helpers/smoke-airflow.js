// Isolated real compute pipeline: no vehicle physics writes or presentation timing.
export async function bootSmokeCompute(page,{count=256,profile=false}={}){
 await page.goto('/gauge-guide.html');
 return page.evaluate(async({count,profile})=>{
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  const timestamps=profile&&adapter.features.has('timestamp-query');
  const d=await adapter.requestDevice(timestamps?{requiredFeatures:['timestamp-query']}:{}),errors=[];
  d.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const {VehicleAirflow}=await import('/js/renderer/vehicle-airflow.js');const flow=new VehicleAirflow(d);await flow.init();
  const source=await (await fetch('/js/shaders/smoke-compute.wgsl')).text();const module=d.createShaderModule({code:source});
  const pipeline=await d.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'computeSmoke'}});
  const buffer=(size,usage)=>d.createBuffer({size,usage:usage|GPUBufferUsage.COPY_DST});
  const particles=buffer(count*48,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),flags=buffer(count*4,GPUBufferUsage.STORAGE);
  const uniform=buffer(32,GPUBufferUsage.UNIFORM),uniformData=new Float32Array(8),uint=new Uint32Array(uniformData.buffer);
  const group=d.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[uniform,particles,flags].map((buffer,binding)=>({binding,resource:{buffer}}))});
  const flowGroup=flow.smokeGroup(pipeline),s={params:{smokeAirflowEnabled:true,smokeAirflowStrength:1,dustWind:0},loop:{simulationTime:0},body:{centerX:0,centerY:0,velocityX:0,velocityY:0,heading:0,angularVelocity:0}};
  const h=await import('/js/renderer/dust-history.js');h.resetDustHistory();
  const seeds=new Float32Array(count*12);for(let i=0;i<count;i++)seeds.set([-3+.5*Math.cos(i/count*Math.PI*2),.5*Math.sin(i/count*Math.PI*2),0,0,5,5,.35,.35,.8,.8,.82,.6],i*12);
  const reset=()=>{d.queue.writeBuffer(particles,0,seeds);d.queue.writeBuffer(flags,0,new Uint32Array(count).fill(1));};reset();
  const step=(time,dt,{pair=false,curl=0}={})=>{
   s.loop.simulationTime=time;flow.prepare(s,profile);
   if(pair){flow.data[7]=2;d.queue.writeBuffer(flow.uniform,0,flow.data);d.queue.writeBuffer(flow.cores,0,new Float32Array([-3,0,0,9,0,0,.72,1,3,0,0,-9,0,0,.72,-1]));}
   uniformData.set([dt,0,curl,time,0,0,1,0]);uint[1]=count;d.queue.writeBuffer(uniform,0,uniformData);
   const e=d.createCommandEncoder();flow.encode(e);const p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.setBindGroup(1,flowGroup);p.dispatchWorkgroups(Math.ceil(count/256));p.end();d.queue.submit([e.finish()]);flow.submitted();
  };
  const snapshot=async()=>{const b=buffer(count*48,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ),e=d.createCommandEncoder();e.copyBufferToBuffer(particles,0,b,0,count*48);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const out=Array.from(new Float32Array(b.getMappedRange()));b.unmap();b.destroy();return out;};
  window.__smoke={d,flow,pipeline,group,flowGroup,uniform,uniformData,uint,particles,flags,seeds,s,h,reset,step,snapshot,errors,count};
  return {timestamps,adapter:{...adapter.info.toJSON?.(),vendor:adapter.info.vendor,architecture:adapter.info.architecture,description:adapter.info.description,isFallbackAdapter:adapter.info.isFallbackAdapter}};
 },{count,profile});
}
