import {dustHistory} from './dust-history.js';
import {GPUComputeTiming} from './gpu-compute-timing.js';
import {BODY_RECT} from './vehicle-geometry.js';
import {buildDustTransport,DUST_TRACERS,DUST_VORTICES,DUST_ELEMENT_BYTES} from './dust-vortices.js';
// Fixed GPU buffers. Tracer trajectories are reconstructed by finite flow maps,
// rather than accumulating a frame-rate-dependent particle integration state.
export class AtmosphericDust {
 constructor(device,format,environment,source){
  Object.assign(this,{device,format,environment,source});
  this.arguments=new Uint32Array([0,1,0,0,4,0,0,0]);this.frame=new Float32Array(32);this.poses=new Float32Array(96*8);this.vortices=new Float32Array(DUST_VORTICES*8);
  this.adaptive=1;this.cost=0;this.count=0;
  this.forceOff=new URLSearchParams(globalThis.location?.search||'').get('dust')==='0';
  this.stats={enabled:false,instances:0,history:0,uploadBytes:0,drawCalls:0,adaptive:1};
 }
 async init(){
  const r=await fetch(new URL('../shaders/atmospheric-dust.wgsl?v=6',import.meta.url),{cache:'no-cache'});
  if(!r.ok)throw Error(`Dust shader: HTTP ${r.status}`);
  const d=this.device,module=d.createShaderModule({label:'dust-vortex-transport',code:this.source+await r.text()});
  const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(errors.map(e=>e.message).join('\n'));
  this.pipeline=await d.createRenderPipelineAsync({label:'dust-tracers',layout:'auto',vertex:{module,entryPoint:'vs_dust'},fragment:{module,entryPoint:'fs_dust',targets:[{format:this.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-strip'}});
  this.pointPipeline=await d.createRenderPipelineAsync({label:'dust-ambient-points',layout:'auto',vertex:{module,entryPoint:'vs_dust_point'},fragment:{module,entryPoint:'fs_dust',targets:[{format:this.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'point-list'}});
  this.compute=await d.createComputePipelineAsync({label:'dust-vortex-flow-maps',layout:'auto',compute:{module,entryPoint:'prepare_dust'}});
  this.prefix=await d.createComputePipelineAsync({label:'dust-stable-group-prefix',layout:'auto',compute:{module,entryPoint:'prefix_dust_groups'}});
  this.scatter=await d.createComputePipelineAsync({label:'dust-stable-visible-scatter',layout:'auto',compute:{module,entryPoint:'scatter_dust'}});
  this.elements=d.createBuffer({label:'dust-trajectories',size:DUST_TRACERS*DUST_ELEMENT_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  this.indices=d.createBuffer({label:'dust-visible-indices',size:DUST_TRACERS*8,usage:GPUBufferUsage.STORAGE});
  this.indirect=d.createBuffer({label:'dust-indirect-counts',size:32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.INDIRECT|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
  this.compact=d.createBuffer({label:'dust-stable-prefix-state',size:532480,usage:GPUBufferUsage.STORAGE});
  this.uniform=d.createBuffer({label:'dust-frame',size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.history=d.createBuffer({label:'dust-body-impulses',size:this.poses.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  this.vortexBuffer=d.createBuffer({label:'dust-persistent-vortices',size:this.vortices.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  this.group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:3,resource:{buffer:this.elements}},{binding:7,resource:{buffer:this.indices}}]});
  this.pointGroup=d.createBindGroup({layout:this.pointPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:3,resource:{buffer:this.elements}},{binding:7,resource:{buffer:this.indices}}]});
  this.computeGroup=d.createBindGroup({layout:this.compute.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.history}},{binding:2,resource:{buffer:this.elements}},{binding:4,resource:{buffer:this.vortexBuffer}},{binding:8,resource:{buffer:this.compact}}]});
  this.prefixGroup=d.createBindGroup({layout:this.prefix.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:6,resource:{buffer:this.indirect}},{binding:8,resource:{buffer:this.compact}}]});
  this.scatterGroup=d.createBindGroup({layout:this.scatter.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:2,resource:{buffer:this.elements}},{binding:5,resource:{buffer:this.indices}},{binding:8,resource:{buffer:this.compact}}]});
  if(d.features?.has('timestamp-query')){try{this.timing=new GPUComputeTiming(d);}catch{/* Profiling must never disable dust. */}}
  this.pointLightGroup=d.createBindGroup({layout:this.pointPipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:this.environment}}]});
  this.lightGroup=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:this.environment}}]});
 }
 get bytes(){return [this.uniform,this.history,this.vortexBuffer,this.elements,this.indices,this.indirect,this.compact].reduce((n,b)=>n+(b?.size??0),0)+(this.timing?32:0);}
 get resourceCount(){return [this.uniform,this.history,this.vortexBuffer,this.elements,this.indices,this.indirect,this.compact].filter(Boolean).length+(this.timing?3:0);}
 prepare(state,width,height,view,ppm,quality,cpuCost=0){
  const p=state.params,h=dustHistory(),debug=p.dustFlowDebug===true;
  const enabled=p.dustEnabled!==false&&!this.forceOff&&((p.dustDensity??.8)>0||(p.dustVisibility??1.15)>0);
  Object.assign(this.stats,{enabled,drawCalls:0,uploadBytes:0,computeWorkgroups:0,history:h.count,debug,gpuComputeMs:this.timing?.milliseconds??null,gpuTimestampSamples:this.timing?.samples??0});
  if(!enabled){this.count=0;Object.assign(this.stats,{instances:0,motes:0,fieldCells:0,vortices:0});return;}
  this.cost+=(cpuCost-this.cost)*.02;const goal=this.cost>6?.65:this.cost<3?1:this.adaptive;this.adaptive+=(goal-this.adaptive)*.012;
  const time=state.loop.simulationTime,angle=(p.dustWindDirection??25)*Math.PI/180,wx=Math.cos(angle)*(p.dustWind??.12),wy=Math.sin(angle)*(p.dustWind??.12);
  const halfX=width/(2*ppm),halfY=height/(2*ppm),pad=10;
  const bounds={left:view.x-halfX-pad,right:view.x+halfX+pad,top:view.y-halfY-pad,bottom:view.y+halfY+pad};
  const events=buildDustTransport(h,time,bounds,this.poses,this.vortices);
  const budget=debug?12288:[24576,65536,65536,65536][Math.min(3,quality.detail??1)];
  const cell=.25;let step=debug?3:1,cols,rows;
  do{cols=Math.ceil((bounds.right-bounds.left)/(cell*step))+2;rows=Math.ceil((bounds.bottom-bounds.top)/(cell*step))+2;if(cols*rows<=budget)break;step*=2;}while(step<1048576);
  const x=Math.floor((bounds.left-wx*time)/(cell*step))*step,y=Math.floor((bounds.top-wy*time)/(cell*step))*step;
  this.count=cols*rows;
  const f=this.frame;f.set([width,height,ppm,time]);f.set([view.x,view.y,BODY_RECT.length,BODY_RECT.width],4);
  f.set([state.body.centerX,state.body.centerY,state.body.velocityX,state.body.velocityY],8);
  f.set([state.body.heading,state.body.angularVelocity,p.dustDensity??.8,p.dustDisturbance??1],12);
  f.set([wx,wy,p.dustPersistence??4,this.adaptive],16);f.set([x,y,cols,step],20);
  f.set([this.count,events.poses,events.vortices,debug?1:0],24);
  // A cohort's full transport window plus vortex lifetime fits the 9.6 s ring.
  f.set([p.dustVisibility??1.15,Math.min(4,9.4-(p.dustPersistence??4)),cell,0],28);
  this.device.queue.writeBuffer(this.uniform,0,f);this.device.queue.writeBuffer(this.indirect,0,this.arguments);
  if(events.poses)this.device.queue.writeBuffer(this.history,0,this.poses,0,events.poses*8);
  if(events.vortices)this.device.queue.writeBuffer(this.vortexBuffer,0,this.vortices,0,events.vortices*8);
  Object.assign(this.stats,{instances:this.count*(debug?5:1),motes:this.count,fieldCells:0,vortices:events.vortices,flowEvents:events.poses,uploadBytes:160+(events.poses+events.vortices)*32,adaptive:this.adaptive,cellMetres:cell*step,tracerLifetime:f[29]});
 }
 encode(encoder){
  if(!this.count)return 0;const pass=encoder.beginComputePass({label:'dust-vortex-transport',timestampWrites:this.timing?.begin()}),n=Math.ceil(this.count/64);
  pass.setPipeline(this.compute);pass.setBindGroup(0,this.computeGroup);pass.dispatchWorkgroups(n);
  pass.setPipeline(this.prefix);pass.setBindGroup(0,this.prefixGroup);pass.dispatchWorkgroups(1);
  pass.setPipeline(this.scatter);pass.setBindGroup(0,this.scatterGroup);pass.dispatchWorkgroups(n);pass.end();
  this.timing?.encode(encoder);this.stats.computeWorkgroups=n*2+1;return n*2+1;
 }
 draw(pass){
  if(!this.count)return 0;let calls=0;
  if(!this.stats.debug){pass.setPipeline(this.pointPipeline);pass.setBindGroup(0,this.pointGroup);pass.setBindGroup(1,this.pointLightGroup);pass.drawIndirect(this.indirect,0);calls++;}
  pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.setBindGroup(1,this.lightGroup);pass.drawIndirect(this.indirect,16);calls++;
  this.stats.drawCalls=calls;return calls;
 }
 // Explicit asynchronous diagnostic only; never called by the render loop.
 async readTracers(first=0,count=this.count){
  first=Math.max(0,Math.min(this.count,Math.floor(first)));count=Math.max(0,Math.min(this.count-first,Math.floor(count)));
  if(!count)return [];
  const size=count*DUST_ELEMENT_BYTES,d=this.device,read=d.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{const enc=d.createCommandEncoder();enc.copyBufferToBuffer(this.elements,first*DUST_ELEMENT_BYTES,read,0,size);d.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);return Array.from(new Float32Array(read.getMappedRange()));}
  finally{read.unmap();read.destroy();}
 }
 async readDrawCounts(){
  const d=this.device,read=d.createBuffer({size:32,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{const e=d.createCommandEncoder();e.copyBufferToBuffer(this.indirect,0,read,0,32);d.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const v=new Uint32Array(read.getMappedRange());return {ambientPoints:v[0],wakeSegments:v[5],wakeTracers:v[5]/(this.stats.debug?5:1)};}
  finally{read.unmap();read.destroy();}
 }
 submitted(){this.timing?.submitted();}
 destroy(){this.timing?.destroy();for(const b of [this.elements,this.uniform,this.history,this.vortexBuffer,this.indices,this.indirect,this.compact])b?.destroy();this.count=0;}
}
