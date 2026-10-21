import {bootSmokeCompute} from './smoke-airflow.js';
export async function bootSmokeMaterial(page,{count=512,profile=false,width=640,height=480}={}){
 const info=await bootSmokeCompute(page,{count,profile});
 await page.evaluate(async({width,height})=>{
  const a=window.__smoke,{d}=a;
  const {SmokeVolume}=await import('/js/renderer/smoke-volume.js'),{SCENE_DEFAULTS}=await import('/js/renderer/environment.js'),{SMOKE_MATERIAL_DEFAULTS}=await import('/js/renderer/smoke-material-controls.js');
  Object.assign(a.s.params,SCENE_DEFAULTS,SMOKE_MATERIAL_DEFAULTS,{smokeEnabled:true});
  const camera=d.createBuffer({size:24,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const volume=new SmokeVolume(d,'rgba8unorm',{camera,smokeUniform:a.uniform,smoke:a.particles,flags:a.flags});await volume.init();
  const module=d.createShaderModule({code:await(await fetch('/js/shaders/smoke.wgsl')).text()});
  const blend={color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
  const legacy=await d.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs_main'},fragment:{module,entryPoint:'fs_main',targets:[{format:'rgba8unorm',blend}]},primitive:{topology:'triangle-list'}});
  const group=(n,buffers)=>d.createBindGroup({layout:legacy.getBindGroupLayout(n),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
  const groups=[group(0,[camera,a.uniform]),group(1,[a.particles,a.flags])];
  let target=d.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const seed=(scene='dense')=>{
   const n=scene==='sparse'?24:a.count;const values=a.seeds;values.fill(0);const flags=new Uint32Array(a.count);
   for(let i=0;i<n;i++){
    const rand=k=>{let h=Math.imul(i+17,k)|0;h=Math.imul(h^(h>>>16),2246822519);return (h>>>0)/4294967296;};
    const t=rand(1664525),angle=rand(747796405)*Math.PI*2,r=Math.sqrt(rand(1597334677));
    const x=scene==='overlap'?Math.cos(angle)*r:Math.sin(t*7)*1.2+Math.cos(angle)*r*.9;
    const y=scene==='overlap'?Math.sin(angle)*r:(t-.5)*9+Math.sin(angle)*r*.8;
    const radius=scene==='sparse'?.45+rand(4129)*.6:.65+rand(4129)*1.25;
    values.set([x,y,0,0,1,2,radius,radius/2,.8,.8,.82,.65],i*12);flags[i]=1;
   }
   d.queue.writeBuffer(a.particles,0,values);d.queue.writeBuffer(a.flags,0,flags);
  };
  seed();
  const render=(mode,{ppm=30,time=1,transparent=false,scale=.5}={})=>{
   a.s.params.smokeShadingMode=mode;a.s.loop.simulationTime=time;volume.scale=scale;
   d.queue.writeBuffer(camera,0,new Float32Array([1,ppm,width,height,0,0]));a.uniformData.set([0,0,2.5,time,0,0,1,0]);a.uint[1]=a.count;d.queue.writeBuffer(a.uniform,0,a.uniformData);
   volume.prepare(a.s,width,height,ppm,a.count,false);
   const e=d.createCommandEncoder();volume.encode(e);const p=e.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:transparent?[0,0,0,0]:[.055,.065,.075,1]}]});
   if(mode===0){p.setPipeline(legacy);groups.forEach((g,i)=>p.setBindGroup(i,g));p.draw(6,a.count);}else volume.draw(p);p.end();d.queue.submit([e.finish()]);
  };
  const pixels=async()=>{const stride=Math.ceil(width*4/256)*256,b=d.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const e=d.createCommandEncoder();e.copyTextureToBuffer({texture:target},{buffer:b,bytesPerRow:stride},[width,height]);d.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(b.getMappedRange()),out=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)out.set(raw.subarray(y*stride,y*stride+width*4),y*width*4);b.unmap();b.destroy();return out;};
  const paint=async()=>{const p=await pixels();let c=document.getElementById('smoke-material');if(!c){c=document.createElement('canvas');c.id='smoke-material';document.body.replaceChildren(c);}c.width=width;c.height=height;c.getContext('2d').putImageData(new ImageData(p,width,height),0,0);};
  window.__material={...a,camera,volume,legacy,groups,seed,render,pixels,paint,width,height,target};
 },{width,height});return info;
}
