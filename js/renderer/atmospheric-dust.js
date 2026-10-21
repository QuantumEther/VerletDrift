import {dustHistory,DUST_HISTORY_CAPACITY} from './dust-history.js';
import {BODY_RECT} from './vehicle-geometry.js';
// Three fixed buffers, one instanced draw in an existing pass, no simulated particles.
export class AtmosphericDust {
 constructor(device,format,environment,source){
  this.device=device;this.format=format;this.environment=environment;this.source=source;
  this.frame=new Float32Array(32);this.serial=-1;this.generation=-1;this.adaptive=1;this.cost=0;
  this.forceOff=new URLSearchParams(globalThis.location?.search||'').get('dust')==='0';
  this.stats={enabled:false,instances:0,history:0,uploadBytes:0,drawCalls:0,adaptive:1};
 }
 async init(){
  const r=await fetch(new URL('../shaders/atmospheric-dust.wgsl?v=2',import.meta.url),{cache:'no-cache'});
  if(!r.ok)throw Error(`Dust shader: HTTP ${r.status}`);
  const d=this.device,module=d.createShaderModule({label:'atmospheric-dust',code:this.source+await r.text()});
  const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(errors.map(e=>e.message).join('\n'));
  this.pipeline=await d.createRenderPipelineAsync({label:'atmospheric-dust',layout:'auto',vertex:{module,entryPoint:'vs_dust'},fragment:{module,entryPoint:'fs_dust',targets:[{format:this.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-strip'}});
  this.compute=await d.createComputePipelineAsync({label:'dust-analytical-flow',layout:'auto',compute:{module,entryPoint:'prepare_dust'}});
  this.elements=d.createBuffer({label:'dust-elements',size:6400*32,usage:GPUBufferUsage.STORAGE});
  this.uniform=d.createBuffer({label:'dust-frame',size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  this.history=d.createBuffer({label:'dust-wake-history',size:DUST_HISTORY_CAPACITY*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  this.group=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:3,resource:{buffer:this.elements}}]});
  this.computeGroup=d.createBindGroup({layout:this.compute.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.history}},{binding:2,resource:{buffer:this.elements}}]});
  this.lightGroup=d.createBindGroup({layout:this.pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:this.environment}}]});
 }
 get bytes(){return (this.uniform?.size??0)+(this.history?.size??0)+(this.elements?.size??0);}
 get resourceCount(){return (this.uniform?1:0)+(this.history?1:0)+(this.elements?1:0);}
 prepare(state,width,height,view,ppm,quality,cpuCost=0){
  const p=state.params,enabled=p.dustEnabled!==false&&!this.forceOff&&(p.dustDensity??.42)>0;
  this.stats.enabled=enabled;this.stats.drawCalls=this.stats.uploadBytes=this.stats.computeWorkgroups=0;
  if(!enabled){this.count=0;Object.assign(this.stats,{instances:0,motes:0,fieldCells:0,history:dustHistory().count});return;}
  // Sustained command-encoding overload thins the same hashed motes smoothly.
  // This is CPU pressure, not a claim to measure GPU execution time.
  this.cost+=(cpuCost-this.cost)*.02;
  const goal=this.cost>6?.45:this.cost<3?1:this.adaptive;
  this.adaptive+=(goal-this.adaptive)*.012;
  const detail=[1800,3000,4600,6000][Math.min(3,quality.detail??1)];
  const time=state.loop.simulationTime,angle=(p.dustWindDirection??25)*Math.PI/180;
  const wx=Math.cos(angle)*(p.dustWind??.12),wy=Math.sin(angle)*(p.dustWind??.12);
  const f=this.frame;f.set([width,height,ppm,time]);f.set([view.x,view.y,BODY_RECT.length,BODY_RECT.width],4);
  f.set([state.body.centerX,state.body.centerY,state.body.velocityX,state.body.velocityY],8);
  f.set([state.body.heading,state.body.angularVelocity,p.dustDensity??.42,p.dustDisturbance??1],12);
  f.set([wx,wy,p.dustPersistence??4,this.adaptive],16);
  const halfX=width/(2*ppm),halfY=height/(2*ppm),pad=10;
  const grid=(cell,budget,offset)=>{
   let step=1,cols,rows;
   do{cols=Math.ceil((halfX*2+pad*2)/(cell*step))+2;rows=Math.ceil((halfY*2+pad*2)/(cell*step))+2;if(cols*rows<=budget)break;step*=2;}while(step<1048576);
   const x=Math.floor((view.x-wx*time-halfX-pad)/(cell*step))*step;
   const y=Math.floor((view.y-wy*time-halfY-pad)/(cell*step))*step;
   f.set([x,y,cols,step],offset);return cols*rows;
  };
  const fine=grid(1.25,detail,20),coarse=grid(6,320,24),coarseStep=f[27],h=dustHistory();
  f[27]=coarse;f.set([fine,h.head,h.count,coarseStep],28);this.count=fine+coarse;
  if(this.serial!==h.serial||this.generation!==h.generation){
   this.device.queue.writeBuffer(this.history,0,h.data);this.serial=h.serial;this.generation=h.generation;this.stats.uploadBytes+=h.data.byteLength;
  }
  this.device.queue.writeBuffer(this.uniform,0,f);this.stats.uploadBytes+=f.byteLength;
  Object.assign(this.stats,{instances:this.count,motes:fine,fieldCells:coarse,history:h.count,adaptive:this.adaptive});
 }
 encode(encoder){if(!this.count)return 0;const pass=encoder.beginComputePass({label:'dust-analytical-flow'});pass.setPipeline(this.compute);pass.setBindGroup(0,this.computeGroup);const n=Math.ceil(this.count/64);pass.dispatchWorkgroups(n);pass.end();this.stats.computeWorkgroups=n;return n;}
 draw(pass){if(!this.count)return 0;pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.group);pass.setBindGroup(1,this.lightGroup);pass.draw(4,this.count);this.stats.drawCalls=1;return 1;}
 destroy(){this.elements?.destroy();this.uniform?.destroy();this.history?.destroy();this.count=0;}
}
