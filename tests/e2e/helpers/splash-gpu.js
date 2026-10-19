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
    read.unmap();read.destroy();let hash=2166136261,groundHash=2166136261,red=0,bright=0,difference=0;
    const previous=window.__splashLastPixels;
    // A fixed left-side region excludes the car/shadow when checking settled optics.
    for(let i=0;i<pixels.length;i++){if(previous?.length===pixels.length)difference+=Math.abs(pixels[i]-previous[i]);hash=Math.imul(hash^pixels[i],16777619)>>>0;if((i>>2)%width<width*.42)groundHash=Math.imul(groundHash^pixels[i],16777619)>>>0;if(i%4===0){if(pixels[i]>pixels[i+1]*1.6&&pixels[i]>pixels[i+2]*1.5&&pixels[i]>48)red++;if(pixels[i]>180&&pixels[i+1]>140)bright++;}}
    if(paint){const ctx=document.getElementById('splash').getContext('2d');ctx.putImageData(new ImageData(pixels,width,height),0,0);}
    window.__splashLastPixels=pixels;
    return {hash,groundHash,red,bright,width,height,differenceMean:previous?.length===pixels.length?difference/(width*height*3):null};
  },paint);
}
export async function seekSplash(page,time) {
  // Reset/replay can render between separate page.evaluate calls. Pause and
  // seek atomically, then wait for the requested frame, not merely any frame.
  const target=await page.evaluate(time=>{
    const lab=window.splashLab,before=lab.renderer.stats.frames;lab.seek(time);
    return {before,time:lab.clock.time};
  },time);
  await page.waitForFunction(({before,time})=>{
    const r=window.splashLab.renderer;
    return r.stats.frames>before&&r.uniforms[3]===Math.fround(time);
  },target);
}

export async function dryGroundPixels(page) {
 await page.evaluate(()=>{
  const r=window.splashLab.renderer;
  const empty=r.device.createTexture({size:[4,4],format:'rg16float',usage:GPUTextureUsage.TEXTURE_BINDING});
  window.__splashDryReference={empty,group:r.sceneGroup};
  r.sceneGroup=r.group(r.carTexture.createView(),empty.createView());
  r.render(window.splashLab.clock.time,window.splashLab.getSettings());
 });
 try {return await splashPixels(page);}
 finally {await page.evaluate(()=>{
  const r=window.splashLab.renderer,{empty,group}=window.__splashDryReference;
  r.sceneGroup=group;r.render(window.splashLab.clock.time,window.splashLab.getSettings());empty.destroy();delete window.__splashDryReference;
 });}
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
    const common=await fetch('/js/shaders/liquid/common.wgsl').then(r=>r.text());
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

// Optical invariants from the shader used by the actual laboratory scene.
export async function puddleOptics(page) {
 return page.evaluate(async()=>{
  const r=window.splashLab.renderer,{device}=r;
  const [common,material,puddles]=await Promise.all(['common','material','puddles'].map(name=>fetch(`/js/shaders/liquid/${name}.wgsl`).then(response=>response.text())));
  const module=device.createShaderModule({code:common+'\n'+material+'\n'+puddles+`
   @group(0) @binding(1) var<storage,read_write> result:array<vec4<f32>>;
   @group(0) @binding(2) var linearSampler:sampler;
   @group(0) @binding(3) var groundTexture:texture_2d<f32>;
   @compute @workgroup_size(1) fn probe() {
    result[0]=vec4(waterTransmission(.0002,.9,1.35),0.);
    result[1]=vec4(waterTransmission(.004,.9,1.35),0.);
    result[2]=vec4(waterTransmission(.004,.9,2.5),0.);
    result[3]=vec4(fresnelWater(1.),fresnelWater(.05),waterRoughness(.05,1.),waterRoughness(0.,0.));
    let view=normalize(vec3(0.,.48,1.));let world=vec2(-1.364,-1.66);
    result[4]=vec4(reflectedEnvironment(world,reflect(-view,vec3(0.,0.,1.)),.05),0.);
    result[5]=vec4(reflectedEnvironment(world,reflect(-view,normalize(vec3(.25,0.,1.))),.05),0.);
    let stain=puddleMaterial(vec2(.025,.44),.5,.0005);
    let film=puddleMaterial(vec2(.078,.44),.5,.0005);
    let pool=puddleMaterial(vec2(.14,.44),.5,.0005);
    result[6]=vec4(stain.standing,stain.water,stain.wet,stain.porosity);
    result[7]=vec4(film.standing,film.water,film.wet,film.porosity);
    result[8]=vec4(pool.standing,pool.water,pool.wet,pool.porosity);
    result[9]=vec4(settlingRipple(vec2(.4,.7),1.25),0.,0.);
    result[10]=vec4(settlingRipple(vec2(.4,.7),3.),0.,0.);
    result[11]=vec4(settlingRipple(vec2(.4,.7),7.45),0.,0.);
    result[13]=vec4(beadWeight(.22,1.),beadWeight(.44,2.),beadWeight(.66,3.),beadWeight(.12,2.));
    result[12]=vec4(ggxReflection(vec3(0.,0.,1.),vec3(0.,0.,1.),vec3(0.,0.,1.),.1),ggxReflection(vec3(0.,0.,1.),vec3(0.,0.,1.),vec3(0.,0.,1.),.6),0.,0.);
   }`});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probe'}});
  const size=14*16,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.uniformBuffer}},{binding:1,resource:{buffer:output}}]});
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();
   encoder.copyBufferToBuffer(output,0,read,0,size);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
   const data=new Float32Array(read.getMappedRange());return Array.from({length:14},(_,i)=>[...data.slice(i*4,i*4+4)]);
  } finally {read.unmap();read.destroy();output.destroy();}
 });
}

// Evaluate the actual airborne material functions, including layer compositing.
export async function airborneOptics(page) {
 return page.evaluate(async()=>{
  const {device}=window.splashLab.renderer;
  const sources=await Promise.all(['common','material','vehicle','liquid'].map(name=>fetch(`/js/shaders/liquid/${name}.wgsl`).then(r=>r.text())));
  const module=device.createShaderModule({code:sources.join('\n')+`
   @group(0) @binding(4) var<storage,read_write> result:array<vec4<f32>>;
   @compute @workgroup_size(1) fn probe() {
    result[0]=vec4(airborneTransmission(.08,.9,1.35),0.);
    result[1]=vec4(waterTransmission(.08*.012,.9,1.35),0.);
    result[2]=vec4(airborneTransmission(.8,.9,1.35),0.);
    result[3]=vec4(airborneTransmission(.8,.9,2.5),0.);
    let behind=vec3(.2);let reflection=vec3(.001);
    result[4]=airborneLayer(behind,.08,.9,reflection,1.,1.35);
    let layer=airborneLayer(behind,.8,.9,reflection,1.,1.35);
    result[5]=layer;
    result[6]=airborneLayer(behind,.8,.9,reflection,0.,1.35);
    result[7]=airborneLayer(behind,0.,.9,reflection,1.,1.35);
    let single=layer.rgb+behind*(1.-layer.a);
    result[8]=vec4(single,1.);
    result[9]=vec4(layer.rgb+single*(1.-layer.a),1.);
    result[10]=airborneLayer(vec3(0.),.8,.9,vec3(0.),1.,1.35);
    result[11]=airborneLayer(behind,.8,.9,vec3(.1),1.,1.35);
   }`});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probe'}});
  const size=12*16,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:window.splashLab.renderer.uniformBuffer}},{binding:4,resource:{buffer:output}}]});
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();
   encoder.copyBufferToBuffer(output,0,read,0,size);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
   const data=new Float32Array(read.getMappedRange());return Array.from({length:12},(_,i)=>[...data.slice(i*4,i*4+4)]);
  } finally {read.unmap();read.destroy();output.destroy();}
 });
}

// Probe the production puddle drying function at fixed world points and times.
// The world-space atlas is unchanged; only analytic shader state varies.
export async function puddleDryingOptics(page) {
 return page.evaluate(async()=>{
  const {device}=window.splashLab.renderer;
  const sources=await Promise.all(['common','material','puddles'].map(name=>fetch(`/js/shaders/liquid/${name}.wgsl`).then(r=>r.text())));
  const module=device.createShaderModule({code:sources.join('\n')+`
   @group(0) @binding(1) var<storage,read_write> result:array<vec4<f32>>;
   @group(0) @binding(2) var linearSampler:sampler;
   @group(0) @binding(3) var groundTexture:texture_2d<f32>;
   @compute @workgroup_size(1) fn probe() {
    let pool=puddleMaterial(vec2(.38,.72),.42,.0005);
    let shallow=puddleMaterial(vec2(.095,.52),.42,.0005);
    result[0]=vec4(dryPuddle(pool,.42,.5,u.optics.z,.0005).standing,dryPuddle(pool,.42,.5,u.optics.z,.0005).water,dryPuddle(pool,.42,.5,u.optics.z,.0005).wet,dryPuddle(pool,.42,.5,u.optics.z,.0005).residue);
    let deepMid=dryPuddle(pool,.42,.5,u.optics.z+u.drying.x*.55,.0005);
    let shallowMid=dryPuddle(shallow,.42,.5,u.optics.z+u.drying.x*.55,.0005);
    result[1]=vec4(deepMid.standing,deepMid.water,deepMid.wet,deepMid.progress);
    result[2]=vec4(shallowMid.standing,shallowMid.water,shallowMid.wet,shallowMid.progress);
    let damp=dryPuddle(pool,.42,.5,u.optics.z+u.drying.x*1.4,.0005);
    let residue=dryPuddle(pool,.42,.5,u.optics.z+u.drying.x*2.8,.0005);
    result[3]=vec4(damp.standing,damp.water,damp.wet,damp.progress);
    result[4]=vec4(residue.standing,residue.water,residue.wet,residue.residue);
    let patchA=dryPuddle(pool,.42,0.,u.optics.z+u.drying.x*.65,.0005);
    let patchB=dryPuddle(pool,.42,1.,u.optics.z+u.drying.x*.65,.0005);
    result[5]=vec4(patchA.standing,patchA.water,patchA.progress,patchB.standing);
    let atTimelineEnd=dryPuddle(pool,.42,.5,u.event.z,.0005);
    result[6]=vec4(atTimelineEnd.standing,atTimelineEnd.water,atTimelineEnd.wet,atTimelineEnd.residue);
   }`});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probe'}});
  const size=7*16,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:window.splashLab.renderer.uniformBuffer}},{binding:1,resource:{buffer:output}}]});
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();
   encoder.copyBufferToBuffer(output,0,read,0,size);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
   const data=new Float32Array(read.getMappedRange());return Array.from({length:7},(_,i)=>[...data.slice(i*4,i*4+4)]);
  } finally {read.unmap();read.destroy();output.destroy();}
 });
}

// Production analytic vehicle field and local collision response, evaluated on GPU.
export async function vehicleLiquidProbe(page) {
 return page.evaluate(async()=>{
  const r=window.splashLab.renderer,{device}=r;
  const sources=await Promise.all(['common','material','vehicle'].map(name=>fetch(`/js/shaders/liquid/${name}.wgsl`).then(response=>response.text())));
  const module=device.createShaderModule({code:sources.join('\n')+`
   @group(0) @binding(1) var<storage,read_write> result:array<vec4<f32>>;
   fn pack(f:BodyFilm)->vec4<f32>{return vec4(f.depth,f.wet,f.residue,f.caught);}
   @compute @workgroup_size(64) fn probe(@builtin(global_invocation_id) gid:vec3<u32>) {
    let id=gid.x;let q=vec2((f32(id%8u)+.5)/8.-.5,(f32(id/8u)+.5)/8.-.5);
    result[id*4u]=pack(bodyFilm(q,1.));result[id*4u+1u]=pack(bodyFilm(q,5.));
    result[id*4u+2u]=pack(bodyFilm(q,18.));result[id*4u+3u]=pack(bodyFilm(q,72.));
    if(id==0u){
     let left=vec3(u.car.xy+vec2(-.12,-.30)*u.car.zw+vec2(0.,.30*.48),.30);
     let right=vec3(u.car.xy+vec2(.12,-.30)*u.car.zw+vec2(0.,.30*.48),.30);
     let far=vec3(u.car.xy+vec2(8.,0.),.30);
     result[256]=vec4(vehicleDeflect(left)-left,vehicleTransmission(left));
     result[257]=vec4(vehicleDeflect(right)-right,vehicleTransmission(right));
     result[258]=vec4(vehicleDeflect(far)-far,vehicleTransmission(far));
    }
   }`});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probe'}});
  const size=259*16,output=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try {
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.uniformBuffer}},{binding:1,resource:{buffer:output}}]});
   const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();
   encoder.copyBufferToBuffer(output,0,read,0,size);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
   const data=new Float32Array(read.getMappedRange());return {fields:Array.from({length:64},(_,i)=>Array.from({length:4},(_,t)=>[...data.slice(i*16+t*4,i*16+t*4+4)])),response:Array.from({length:3},(_,i)=>[...data.slice(1024+i*4,1028+i*4)])};
  } finally {read.unmap();read.destroy();output.destroy();}
 });
}
