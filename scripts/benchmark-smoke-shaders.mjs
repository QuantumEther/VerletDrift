// Isolated shader A/B: --baseline CHECKOUT [--backend native|software] [--output FILE]
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const baseline=option('--baseline');
if(!baseline)throw Error('Provide --baseline /path/to/baseline/checkout');
const software=option('--backend','software')==='software';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:software?['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
try{
 const page=await browser.newPage();await page.goto(`${option('--url','http://localhost:8000')}/gauge-guide.html`);
 const result=await page.evaluate(async code=>{
  const adapter=await navigator.gpu.requestAdapter();const device=await adapter.requestDevice({requiredFeatures:['timestamp-query']});globalThis.abDevice={adapter,device};
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const blend={color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
  const pipelines=await Promise.all(code.map(async c=>{const module=device.createShaderModule({code:c});return device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs_main'},fragment:{module,entryPoint:'fs_main',targets:[{format:'rgba8unorm',blend}]},primitive:{topology:'triangle-list'}});}));
  const buffer=(size,usage)=>device.createBuffer({size,usage:usage|GPUBufferUsage.COPY_DST});
  const cam=buffer(24,GPUBufferUsage.UNIFORM),settings=buffer(32,GPUBufferUsage.UNIFORM),particles=buffer(256*48,GPUBufferUsage.STORAGE),flags=buffer(256*4,GPUBufferUsage.STORAGE);
  const pdata=new Float32Array(256*12);for(let i=0;i<256;i++)pdata.set([(i%16-8)*.12,(Math.floor(i/16)-8)*.12,0,0,1,2,.4,.2,.8,.8,.82,.7],i*12);device.queue.writeBuffer(particles,0,pdata);device.queue.writeBuffer(flags,0,new Uint32Array(256).fill(1));
  const group=(p,index,bs)=>device.createBindGroup({layout:p.getBindGroupLayout(index),entries:bs.map((buffer,binding)=>({binding,resource:{buffer}}))});
  const groups=pipelines.map(p=>[group(p,0,[cam,settings]),group(p,1,[particles,flags])]);
  const target=device.createTexture({size:[512,512],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const queries=device.createQuerySet({type:'timestamp',count:4}),resolve=buffer(32,GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC),read=buffer(32,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  const results=[];
  for(const [ppm,detail] of [[20,1],[80,2]]){
   device.queue.writeBuffer(cam,0,new Float32Array([1,ppm,512,512,0,0]));device.queue.writeBuffer(settings,0,new Float32Array([0,0,0,1,0,0,detail,0]));
   const times=[[],[]];for(let frame=0;frame<20;frame++){
    const encoder=device.createCommandEncoder();for(const i of frame%2?[1,0]:[0,1]){const pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}],timestampWrites:{querySet:queries,beginningOfPassWriteIndex:i*2,endOfPassWriteIndex:i*2+1}});pass.setPipeline(pipelines[i]);pass.setBindGroup(0,groups[i][0]);pass.setBindGroup(1,groups[i][1]);pass.draw(6,256);pass.end();}
    encoder.resolveQuerySet(queries,0,4,resolve,0);encoder.copyBufferToBuffer(resolve,0,read,0,32);device.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);const ts=new BigUint64Array(read.getMappedRange());if(frame>=4)for(let i=0;i<2;i++)times[i].push(Number(ts[i*2+1]-ts[i*2])/1e6);read.unmap();
   }results.push({ppm,detail,beforeMs:times[0],afterMs:times[1]});
  }
  device.destroy();return {scope:'Isolated 256-puff render pass, alternating A/B order; actual GPU timestamps',adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,isFallbackAdapter:adapter.info.isFallbackAdapter},results,errors};
 },[readFileSync(join(resolve(baseline),'js/shaders/smoke.wgsl'),'utf8'),readFileSync(new URL('../js/shaders/smoke.wgsl',import.meta.url),'utf8')]);
 writeFileSync(option('--output','/tmp/smoke-ab.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
