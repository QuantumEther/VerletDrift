// Test/capture instrumentation only: real WGSL into a readable GPU texture.
// Avoids this cloud's unsupported native swapchain; never changes app shaders.
export async function offscreenSplash(page) {
  await page.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      if(type!=='webgpu'||this.id!=='splash')return original.call(this,type,...args);
      const canvas=this;let device,format,texture,width,height;
      return {
        configure(options){device=options.device;format=options.format;window.__splashGPU={device,get texture(){return texture;}};},
        getCurrentTexture(){
          if(!texture||width!==canvas.width||height!==canvas.height){
            texture?.destroy();width=canvas.width;height=canvas.height;
            texture=device.createTexture({label:'test-readable-splash-target',size:[width,height],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
          }
          return texture;
        },
        unconfigure(){texture?.destroy();},
      };
    };
  });
}
export async function splashPixels(page,paint=false) {
  return page.evaluate(async paint=>{
    const {device,texture}=window.__splashGPU;
    const width=texture.width,height=texture.height,stride=Math.ceil(width*4/256)*256;
    const read=device.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture},{buffer:read,bytesPerRow:stride},[width,height]);
    device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
    const source=new Uint8Array(read.getMappedRange()),pixels=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)pixels.set(source.subarray(y*stride,y*stride+width*4),y*width*4);
    if(texture.format==='bgra8unorm')for(let i=0;i<pixels.length;i+=4){const r=pixels[i];pixels[i]=pixels[i+2];pixels[i+2]=r;}
    read.unmap();read.destroy();let hash=2166136261,red=0,bright=0;
    for(let i=0;i<pixels.length;i++){hash=Math.imul(hash^pixels[i],16777619)>>>0;if(i%4===0){if(pixels[i]>pixels[i+1]*1.6&&pixels[i]>pixels[i+2]*1.5&&pixels[i]>48)red++;if(pixels[i]>180&&pixels[i+1]>140)bright++;}}
    if(paint){const ctx=document.getElementById('splash').getContext('2d');ctx.putImageData(new ImageData(pixels,width,height),0,0);}
    return {hash,red,bright,width,height};
  },paint);
}
export async function seekSplash(page,time) {
  const before=await page.evaluate(()=>window.splashLab.renderer.stats.frames);
  await page.evaluate(time=>window.splashLab.seek(time),time);
  await page.waitForFunction(before=>window.splashLab.renderer.stats.frames>before,before);
}

// Read the actual half-float world atlas; this instrumentation is test-only.
export async function groundPixels(page,points=[]) {
  return page.evaluate(async points=>{
    const {device,groundTexture:texture}=window.splashLab.renderer;
    const width=texture.width,height=texture.height,stride=Math.ceil(width*4/256)*256;
    const read=device.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
      const encoder=device.createCommandEncoder();encoder.copyTextureToBuffer({texture},{buffer:read,bytesPerRow:stride},[width,height]);
      device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
      const data=new Uint16Array(read.getMappedRange());
      const half=n=>{const sign=n&32768?-1:1,e=(n>>10)&31,f=n&1023;return sign*(e===0?f*2**-24:e===31?Infinity:(1+f/1024)*2**(e-15));};
      let hash=2166136261,mass=0,wet=0,touched=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=y*stride/2+x*2,r=data[i],g=data[i+1];
        hash=Math.imul(hash^r,16777619)>>>0;hash=Math.imul(hash^g,16777619)>>>0;
        mass+=half(r);wet+=half(g);if(r>0)touched++;
      }
      const samples=points.map(([x,y])=>{
        const px=Math.max(0,Math.min(width-1,Math.floor((x/32+.5)*width)));
        const py=Math.max(0,Math.min(height-1,Math.floor(((y+.8)/32+.5)*height)));
        return half(data[py*stride/2+px*2]);
      });
      return {hash,mass,wet,touched,samples,width,height};
    } finally {read.unmap();read.destroy();}
  },points);
}

// Probe the production WGSL functions themselves, not a JS copy of the model.
export async function splashKinematics(page) {
  return page.evaluate(async()=>{
    const renderer=window.splashLab.renderer,{device}=renderer;
    const common=await fetch('/experiments/splash-lab/shaders/common.wgsl').then(r=>r.text());
    const module=device.createShaderModule({code:common+`
      @group(0) @binding(1) var<storage,read_write> result:array<vec4<f32>>;
      @compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) gid:vec3<u32>) {
        let id=gid.x;if(id>=257u){return;}
        let angle=f32(id)/256.*TAU;let p=sheetPoint(angle,1.,u.event.z,0.);
        let d=drop(id);let s=splashlet(id);
        result[id*6u]=vec4(p,sheetLanding(angle,1.,0.));
        result[id*6u+1u]=vec4(d.ground,d.arrival,d.size);
        result[id*6u+2u]=vec4(d.position,d.alive);
        result[id*6u+3u]=vec4(s.ground,s.arrival,s.size);
        result[id*6u+4u]=vec4(s.position,s.alive);
        result[id*6u+5u]=vec4(sheetPoint(angle,0.,u.event.z,0.).xy,pressureSpeed(),transferredVelocity().y);
      }`});
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probe'}});
    const size=257*6*16,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    const read=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    try {
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:renderer.uniformBuffer}},{binding:1,resource:{buffer:output}}]});
      const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
      pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(5);pass.end();
      encoder.copyBufferToBuffer(output,0,read,0,size);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
      const values=new Float32Array(read.getMappedRange());
      return Array.from({length:257},(_,i)=>({sheet:[...values.slice(i*24,i*24+4)],landing:[...values.slice(i*24+4,i*24+8)],drop:[...values.slice(i*24+8,i*24+12)],secondaryLanding:[...values.slice(i*24+12,i*24+16)],secondary:[...values.slice(i*24+16,i*24+20)],center:[...values.slice(i*24+20,i*24+22)],pressure:values[i*24+22],momentum:values[i*24+23]}));
    } finally {read.unmap();read.destroy();output.destroy();}
  });
}
