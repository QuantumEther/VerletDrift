import {lighting} from './environment.js';
import {GPUComputeTiming} from './gpu-compute-timing.js';
const PREMUL={color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
const ADD={color:{srcFactor:'one',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}};
// Owns only rendering resources. Particle and airflow buffers are borrowed, never written.
// prepare → encode (bounds / optical depth) → draw (world compositing) → submitted.
export class SmokeVolume {
 constructor(device,format,buffers){
  this.device=device;this.format=format;this.buffers=buffers;this.data=new Float32Array(16);this.clear=new Uint32Array(4);this.resources=[];this.scale=.5;this.mode=0;
  this.stats={available:false,mode:0,uploadBytes:0,drawCalls:0,computeWorkgroups:0,width:0,height:0,allocations:0,densityMs:null,boundsMs:null};
  const make=(label,size,usage)=>{const b=device.createBuffer({label,size,usage});this.resources.push(b);return b;};
  this.uniform=make('smokeLighting',64,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
  this.bounds=make('smokeVisibleBounds',16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC);
 }
 get bytes(){return this.resources.reduce((n,b)=>n+b.size,0)+(this.texture?this.stats.width*this.stats.height*8:0)+(this.densityTiming?64:0);}
 get resourceCount(){return this.resources.length+(this.texture?1:0)+(this.densityTiming?6:0);}
 async init(){
  const names=['smoke-shape','smoke-material','smoke-density','smoke-local','smoke-composite','smoke-bounds'];
  const [shape,material,density,local,composite,bounds]=await Promise.all(names.map(async name=>{const r=await fetch(new URL(`../shaders/${name}.wgsl?v=1`,import.meta.url));if(!r.ok)throw Error(`${name}: ${r.status}`);return r.text();}));
  const render=async(code,vertex,fragment,format,blend)=>{const module=this.device.createShaderModule({label:`smoke-${fragment}`,code});return this.device.createRenderPipelineAsync({label:`smoke-${fragment}`,layout:'auto',vertex:{module,entryPoint:vertex},fragment:{module,entryPoint:fragment,targets:[{format,blend}]},primitive:{topology:'triangle-list'}});};
  this.density=await render(shape+density,'vs_main','fs_density','rgba16float',ADD);
  this.local=await render(shape+material+local,'vs_main','fs_local',this.format,PREMUL);
  this.composite=await render(material+composite,'vs_composite','fs_composite',this.format,PREMUL);
  const module=this.device.createShaderModule({label:'smoke-visible-bounds',code:material+bounds});
  this.boundsPipeline=await this.device.createComputePipelineAsync({label:'smoke-visible-bounds',layout:'auto',compute:{module,entryPoint:'smoke_bounds'}});
  const group=(p,index,buffers)=>this.device.createBindGroup({layout:p.getBindGroupLayout(index),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
  this.densityGroups=[group(this.density,0,[this.buffers.camera,this.buffers.smokeUniform]),group(this.density,1,[this.buffers.smoke,this.buffers.flags])];
  this.localGroups=[group(this.local,0,[this.buffers.camera,this.buffers.smokeUniform]),group(this.local,1,[this.buffers.smoke,this.buffers.flags]),group(this.local,2,[this.uniform])];
  this.boundsGroup=group(this.boundsPipeline,0,[this.buffers.camera,this.buffers.smokeUniform,this.buffers.smoke,this.buffers.flags,this.bounds,this.uniform]);
  this.sampler=this.device.createSampler({minFilter:'linear',magFilter:'linear'});this.stats.available=true;
 }
 prepare(state,width,height,pixelsPerMetre,count,profile=false){
  this.mode=this.stats.available&&state.params.smokeEnabled&&count>0?Math.max(0,Math.min(2,Math.round(state.params.smokeShadingMode??2))):0;
  Object.assign(this.stats,{mode:this.mode,uploadBytes:0,drawCalls:0,computeWorkgroups:0,densityMs:this.densityTiming?.milliseconds??null,boundsMs:this.boundsTiming?.milliseconds??null});this.count=count;
  if(!this.mode)return;
  lighting(state.params,this.data);this.data.set([state.params.smokeOpticalDensity??1,state.params.smokeScattering??1,state.params.smokeInternalShadow??.8,this.mode],8);this.data.set([width,height,pixelsPerMetre,this.scale],12);
  this.device.queue.writeBuffer(this.uniform,0,this.data);this.stats.uploadBytes=64;
  if(this.mode===2){
   const w=Math.max(1,Math.ceil(width*this.scale)),h=Math.max(1,Math.ceil(height*this.scale));
   if(!this.texture||w!==this.stats.width||h!==this.stats.height){
    this.texture?.destroy();this.texture=this.device.createTexture({label:'sharedSmokeDensity',size:[w,h],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});this.view=this.texture.createView();
    this.compositeGroup=this.device.createBindGroup({layout:this.composite.getBindGroupLayout(0),entries:[{binding:0,resource:this.view},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.uniform}},{binding:3,resource:{buffer:this.bounds}}]});
    Object.assign(this.stats,{width:w,height:h,allocations:this.stats.allocations+1});
   }
   this.clear.set([width,height,0,0]);this.device.queue.writeBuffer(this.bounds,0,this.clear);this.stats.uploadBytes+=16;
  }
  if(profile&&this.device.features.has('timestamp-query')&&!this.densityTiming){try{this.densityTiming=new GPUComputeTiming(this.device);this.boundsTiming=new GPUComputeTiming(this.device);}catch{this.densityTiming?.destroy();this.boundsTiming?.destroy();this.densityTiming=this.boundsTiming=null;}}
 }
 encode(encoder){
  if(this.mode!==2)return 0;
  let p=encoder.beginComputePass({label:'smokeVisibleBounds',timestampWrites:this.boundsTiming?.begin()});p.setPipeline(this.boundsPipeline);p.setBindGroup(0,this.boundsGroup);p.dispatchWorkgroups(Math.ceil(this.count/256));p.end();this.boundsTiming?.encode(encoder);
  p=encoder.beginRenderPass({label:'smokeOpticalDepth',timestampWrites:this.densityTiming?.begin(),colorAttachments:[{view:this.view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});p.setPipeline(this.density);this.densityGroups.forEach((g,i)=>p.setBindGroup(i,g));p.draw(6,this.count);p.end();this.densityTiming?.encode(encoder);
  this.stats.drawCalls=1;this.stats.computeWorkgroups=Math.ceil(this.count/256);return this.stats.computeWorkgroups;
 }
 draw(pass){
  if(!this.mode)return 0;
  if(this.mode===1){pass.setPipeline(this.local);this.localGroups.forEach((g,i)=>pass.setBindGroup(i,g));pass.draw(6,this.count);}
  else{pass.setPipeline(this.composite);pass.setBindGroup(0,this.compositeGroup);pass.draw(6);}
  this.stats.drawCalls++;return 1;
 }
 submitted(){this.densityTiming?.submitted();this.boundsTiming?.submitted();}
 destroy(){this.densityTiming?.destroy();this.boundsTiming?.destroy();this.texture?.destroy();for(const r of this.resources)r.destroy();this.resources.length=0;this.texture=null;this.densityTiming=this.boundsTiming=null;this.mode=0;this.stats.available=false;}
}
