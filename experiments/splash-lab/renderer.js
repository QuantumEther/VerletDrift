import { BODY_CROP } from '../../js/renderer/vehicle-geometry.js';
import { GPUTiming } from '../../js/renderer/gpu-timing.js';
import { IMPACT_TIME, QUALITY, makeSheetMesh, makeStrandMesh } from './scene.js';
const PREMUL={color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
const ADDITIVE={color:{srcFactor:'one',dstFactor:'one',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one',operation:'add'}};
const VERTICES=[{arrayStride:8,attributes:[{shaderLocation:0,offset:0,format:'float32x2'}]}];
export class SplashRenderer {
  constructor(canvas,onFailure=()=>{}) {
    this.canvas=canvas;this.onFailure=onFailure;this.ready=false;this.closed=false;this.resources=[];
    this.uniforms=new Float32Array(28);this.depositionKey=null;
    this.stats={backend:'uninitialized',drawCalls:0,frames:0,resourceAllocations:0,resourceBytes:0,cpuEncodeMs:0,sceneGpuMs:null,splashGpuMs:null};
  }
  track(resource,bytes=0) {this.resources.push(resource);this.stats.resourceAllocations++;this.stats.resourceBytes+=bytes;return resource;}
  buffer(label,data,usage) {
    const buffer=this.track(this.device.createBuffer({label,size:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST}),data.byteLength);
    this.device.queue.writeBuffer(buffer,0,data);return buffer;
  }
  async init(settings={quality:'balanced'}) {
    try {
      if(!navigator.gpu)throw Error('WebGPU is unavailable. Use a browser with hardware WebGPU enabled.');
      const power=new URLSearchParams(location.search).get('gpuPower')==='low-power'?'low-power':'high-performance';
      this.adapter=await navigator.gpu.requestAdapter({powerPreference:power});
      if(!this.adapter)throw Error('The browser returned no WebGPU adapter.');
      const info=this.adapter.info;
      this.stats.adapter={vendor:info?.vendor,architecture:info?.architecture,description:info?.description,isFallbackAdapter:info?.isFallbackAdapter??this.adapter.isFallbackAdapter??null,powerPreference:power};
      const timestamp=this.adapter.features.has('timestamp-query');
      this.device=await this.adapter.requestDevice(timestamp?{requiredFeatures:['timestamp-query']}:{});
      const device=this.device;
      device.addEventListener('uncapturederror',event=>{event.preventDefault();this.fail(event.error.message);});
      device.lost.then(info=>{if(!this.closed)this.fail(`Device lost: ${info.message||info.reason}`);});
      if(timestamp){this.sceneTimer=new GPUTiming(device);this.liquidTimer=new GPUTiming(device);this.groundTimer=new GPUTiming(device);this.stats.resourceAllocations+=9;this.stats.resourceBytes+=192;}
      this.stats.gpuTimingSupported=timestamp;
      this.context=this.canvas.getContext('webgpu');
      if(!this.context)throw Error('A WebGPU canvas context could not be created.');
      this.format=navigator.gpu.getPreferredCanvasFormat();
      this.context.configure({device,format:this.format,alphaMode:'opaque'});
      this.layout=device.createBindGroupLayout({entries:[
        {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},
        {binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
        {binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},
        {binding:3,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float'}},
      ]});
      const layout=device.createPipelineLayout({bindGroupLayouts:[this.layout]});
      const depositionLayout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}}]});
      const depositionPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[depositionLayout]});
      const read=async name=>{const response=await fetch(new URL(`shaders/${name}.wgsl`,import.meta.url),{cache:'no-cache'});if(!response.ok)throw Error(`Shader ${name}: HTTP ${response.status}`);return response.text();};
      const [common,puddles,scene,liquid]=await Promise.all(['common','puddles','scene','liquid'].map(read));
      const modules=[device.createShaderModule({label:'splash-scene',code:common+'\n'+puddles+'\n'+scene}),device.createShaderModule({label:'splash-liquid',code:common+'\n'+liquid})];
      if(this.closed)throw Error('Renderer closed during shader loading');
      for(const module of modules){const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>`${m.lineNum}: ${m.message}`).join('\n'));}
      const make=(label,module,vs,fs,format,mesh=false,blend=false,pipelineLayout=layout)=>device.createRenderPipelineAsync({label,layout:pipelineLayout,
        vertex:{module,entryPoint:vs,...(mesh?{buffers:VERTICES}:{})},fragment:{module,entryPoint:fs,targets:[{format,...(blend?{blend:blend===true?PREMUL:blend}:{})}]},primitive:{topology:'triangle-list',cullMode:'none'}});
      const [scenePipeline,blit,sheet,strand,drop,shadow,splashlet,depositSheet,depositDrop,depositSecondary]=await Promise.all([
        make('lab-scene',modules[0],'vs_fullscreen','fs_scene','rgba8unorm'),
        make('lab-blit',modules[1],'vs_blit','fs_blit',this.format),
        make('liquid-membrane',modules[1],'vs_sheet','fs_sheet',this.format,true,true),
        make('liquid-filaments',modules[1],'vs_strand','fs_strand',this.format,true,true),
        make('liquid-drops',modules[1],'vs_drop','fs_drop',this.format,false,true),
        make('liquid-contact-shadows',modules[1],'vs_drop_shadow','fs_shadow','rgba8unorm',false,true),
        make('landing-splashlets',modules[1],'vs_splashlet','fs_drop',this.format,false,true),
        make('deposit-film',modules[1],'vs_deposit_sheet','fs_deposit_sheet','rg16float',true,ADDITIVE,depositionPipelineLayout),
        make('deposit-drops',modules[1],'vs_deposit_drop','fs_deposit_drop','rg16float',false,ADDITIVE,depositionPipelineLayout),
        make('deposit-secondary',modules[1],'vs_deposit_secondary','fs_deposit_drop','rg16float',false,ADDITIVE,depositionPipelineLayout),
      ]);
      if(this.closed)throw Error('Renderer closed during pipeline creation');
      this.pipelines={scene:scenePipeline,blit,sheet,strand,drop,shadow,splashlet,depositSheet,depositDrop,depositSecondary};
      this.uniformBuffer=this.buffer('lab-uniforms',this.uniforms,GPUBufferUsage.UNIFORM);
      this.depositionGroup=device.createBindGroup({layout:depositionLayout,entries:[{binding:0,resource:{buffer:this.uniformBuffer}}]});
      const mesh=makeSheetMesh(),strands=makeStrandMesh();
      this.sheetVertices=this.buffer('membrane-parameters',mesh.vertices,GPUBufferUsage.VERTEX);
      this.sheetIndices=this.buffer('membrane-indices',mesh.indices,GPUBufferUsage.INDEX);this.sheetIndexCount=mesh.indices.length;
      this.strandVertices=this.buffer('strand-parameters',strands.vertices,GPUBufferUsage.VERTEX);
      this.strandIndices=this.buffer('strand-indices',strands.indices,GPUBufferUsage.INDEX);this.strandIndexCount=strands.indices.length;
      this.sampler=device.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
      await this.loadCar();
      this.ensureGround((QUALITY[settings.quality]??QUALITY.balanced).atlas);
      if(this.closed)throw Error('Renderer closed during initialization');
      this.ready=true;this.stats.backend='webgpu';return true;
    }catch(error){this.fail(error.message);return false;}
  }
  async loadCar() {
    let bitmap;
    try {
      const response=await fetch(new URL('../../assets/vehicles/delorean/DeLorean.png',import.meta.url));
      if(!response.ok)throw Error('Car artwork unavailable');
      bitmap=await createImageBitmap(await response.blob(),...BODY_CROP,{resizeWidth:344,resizeHeight:602,resizeQuality:'high'});
    }catch{this.stats.carFallback=true;}
    if(this.closed){bitmap?.close();throw Error('Renderer closed during artwork loading');}
    this.hasCar=!!bitmap;
    const width=bitmap?.width??1,height=bitmap?.height??1;
    this.carTexture=this.track(this.device.createTexture({label:'unchanged-delorean-artwork',size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT}),width*height*4);
    if(bitmap){this.device.queue.copyExternalImageToTexture({source:bitmap},{texture:this.carTexture},[width,height]);bitmap.close();}
    else this.device.queue.writeTexture({texture:this.carTexture},new Uint8Array([0,0,0,0]),{bytesPerRow:4},[1,1]);
  }
  group(view,groundView=this.groundView) {return this.device.createBindGroup({layout:this.layout,entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:view},{binding:2,resource:this.sampler},{binding:3,resource:groundView}]});}
  ensureGround(size) {
    if(this.groundTexture?.width===size)return;
    const texture=this.device.createTexture({label:'world-space-liquid-deposition',size:[size,size],format:'rg16float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
    try{
      const view=texture.createView(),sceneGroup=this.group(this.carTexture.createView(),view);
      const liquidGroup=this.sceneTexture?this.group(this.sceneView,view):null;
      this.groundTexture?.destroy();this.groundTexture=texture;this.groundView=view;
      this.sceneGroup=sceneGroup;if(liquidGroup)this.liquidGroup=liquidGroup;
    }catch(error){texture.destroy();throw error;}
    this.depositionKey=null;this.stats.resourceAllocations++;this.stats.groundTextureBytes=size*size*4;
  }
  resize(settings) {
    const q=QUALITY[settings.quality];this.ensureGround(q.atlas);
    const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(rect.width*dpr*q.resolution)),h=Math.max(1,Math.round(rect.height*dpr*q.resolution));
    const scale=Math.min(1,Math.sqrt(q.maxPixels/(w*h)),this.device.limits.maxTextureDimension2D/Math.max(w,h));
    const width=Math.max(1,Math.floor(w*scale)),height=Math.max(1,Math.floor(h*scale));
    if(this.sceneTexture&&this.canvas.width===width&&this.canvas.height===height)return;
    const next=this.device.createTexture({label:'lab-scene-refraction-source',size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
    try{const view=next.createView(),group=this.group(view);this.sceneTexture?.destroy();this.sceneTexture=next;this.sceneView=view;this.liquidGroup=group;}catch(error){next.destroy();throw error;}
    this.canvas.width=width;this.canvas.height=height;
    this.stats.resourceAllocations++;this.stats.sceneTextureBytes=width*height*4;
    this.stats.width=width;this.stats.height=height;
  }
  render(time,settings) {
    if(!this.ready)return;
    const start=performance.now();
    try{
      this.resize(settings);const q=QUALITY[settings.quality],age=time-IMPACT_TIME;
      const framing=Math.max(1,Math.cbrt(settings.volume/18)*(.85+settings.speed*.007));
      const carWidth=1.85,carLength=carWidth*BODY_CROP[3]/BODY_CROP[2];
      const carY=-.8+carLength*.5+(age<0?-age*settings.speed:-settings.speed*.10*(1.-Math.exp(-age*1.8)));
      this.uniforms.set([this.canvas.width,this.canvas.height,Math.min(this.canvas.width/18,this.canvas.height/14.5)/framing,time,
        settings.speed,settings.volume,settings.breakup,settings.concentration,0,-.8,age,settings.seed,
        0,carY,carWidth,carLength,0,-1,q.detail,this.hasCar?1:0,q.strands/3,q.drops,q.sheets,0,16,q.atlas,0,-.8-settings.speed*.18*.22]);
      this.device.queue.writeBuffer(this.uniformBuffer,0,this.uniforms);
      this.sceneTimer?.startFrame();this.liquidTimer?.startFrame();
      // Reconstruct only when contact history changes. Seeking backwards clears
      // future deposits; settled ground stays cached across later frames.
      const key=[Math.min(3,Math.max(0,age)),settings.speed,settings.volume,settings.breakup,settings.seed,settings.quality].join(':');
      const deposit=key!==this.depositionKey;
      if(deposit)this.groundTimer?.startFrame();
      const encoder=this.device.createCommandEncoder({label:'splash-laboratory'});
      this.stats.drawCalls=0;
      if(deposit){
        const ground=encoder.beginRenderPass({label:'liquid-deposition',timestampWrites:this.groundTimer?.begin(),colorAttachments:[{view:this.groundView,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});
        ground.setBindGroup(0,this.depositionGroup);
        if(age>0){
          ground.setPipeline(this.pipelines.depositSheet);ground.setVertexBuffer(0,this.sheetVertices);ground.setIndexBuffer(this.sheetIndices,'uint32');ground.drawIndexed(this.sheetIndexCount,q.sheets);
          ground.setPipeline(this.pipelines.depositDrop);ground.draw(6,q.drops);
          ground.setPipeline(this.pipelines.depositSecondary);ground.draw(6,q.drops*2);this.stats.drawCalls+=3;
        }
        ground.end();this.stats.depositionRebuilds=(this.stats.depositionRebuilds??0)+1;
      }
      const scene=encoder.beginRenderPass({label:'ground-and-car',timestampWrites:this.sceneTimer?.begin(),colorAttachments:[{view:this.sceneView,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});
      scene.setPipeline(this.pipelines.scene);scene.setBindGroup(0,this.sceneGroup);scene.draw(3);
      this.stats.drawCalls++;
      if(age>0&&age<2.8){scene.setPipeline(this.pipelines.shadow);scene.draw(6,q.drops);this.stats.drawCalls++;}
      scene.end();
      const pass=encoder.beginRenderPass({label:'procedural-liquid',timestampWrites:this.liquidTimer?.begin(),colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});
      pass.setBindGroup(0,this.liquidGroup);pass.setPipeline(this.pipelines.blit);pass.draw(3);this.stats.drawCalls++;
      if(age>0&&age<2.8){
        pass.setPipeline(this.pipelines.sheet);pass.setVertexBuffer(0,this.sheetVertices);pass.setIndexBuffer(this.sheetIndices,'uint32');pass.drawIndexed(this.sheetIndexCount,q.sheets);
        pass.setPipeline(this.pipelines.strand);pass.setVertexBuffer(0,this.strandVertices);pass.setIndexBuffer(this.strandIndices,'uint32');pass.drawIndexed(this.strandIndexCount,q.strands);
        pass.setPipeline(this.pipelines.drop);pass.draw(6,q.drops);
        pass.setPipeline(this.pipelines.splashlet);pass.draw(6,q.drops*2);this.stats.drawCalls+=4;
      }
      pass.end();this.sceneTimer?.encode(encoder);this.liquidTimer?.encode(encoder);if(deposit)this.groundTimer?.encode(encoder);
      this.device.queue.submit([encoder.finish()]);this.sceneTimer?.submitted();this.liquidTimer?.submitted();if(deposit){this.groundTimer?.submitted();this.depositionKey=key;}
      this.stats.frames++;this.stats.sceneGpuMs=this.sceneTimer?.milliseconds??null;this.stats.splashGpuMs=this.liquidTimer?.milliseconds??null;
      this.stats.quality=settings.quality;this.stats.triangles=2+(age>0&&age<2.8?this.sheetIndexCount/3*q.sheets+this.strandIndexCount/3*q.strands+q.drops*8:0)+(deposit&&age>0?this.sheetIndexCount/3*q.sheets+q.drops*6:0);
    }catch(error){this.fail(error.message);}
    this.stats.cpuEncodeMs=performance.now()-start;
  }
  getStats() {
    return {...this.stats,depositionGpuMs:this.groundTimer?.milliseconds??null,depositionTimestampSamples:this.groundTimer?.sampleCount??0,sceneGpuMs:this.sceneTimer?.milliseconds??null,
      splashGpuMs:this.liquidTimer?.milliseconds??null,
      gpuTimestampSamples:Math.min(this.sceneTimer?.sampleCount??0,this.liquidTimer?.sampleCount??0),
      ownedResourceCount:this.closed?0:this.resources.length+(this.sceneTexture?1:0)+(this.groundTexture?1:0)+(this.sceneTimer?9:0)};
  }
  fail(message) {if(this.closed)return;this.stats.error=message;this.dispose();this.onFailure(message);}
  dispose() {
    if(this.closed)return;this.closed=true;this.ready=false;this.stats.backend='unavailable';
    try{this.context?.unconfigure();}catch{}
    this.sceneTimer?.destroy();this.liquidTimer?.destroy();this.groundTimer?.destroy();this.sceneTexture?.destroy();this.groundTexture?.destroy();
    for(const resource of this.resources)resource.destroy?.();this.resources.length=0;
    this.device?.destroy();
  }
}
