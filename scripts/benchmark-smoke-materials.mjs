import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {bootSmokeMaterial} from '../tests/e2e/helpers/smoke-material.js';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];};
const b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:process.argv.includes('--native')?['--no-sandbox','--enable-unsafe-webgpu']:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const fixturePath=arg('--fixture',''),fixture=fixturePath?JSON.parse(readFileSync(fixturePath,'utf8')):null;
 const p=await b.newPage({baseURL:'http://localhost:8000'});const info=await bootSmokeMaterial(p,{profile:true,count:fixture?.count??Number(arg('--count','512'))});
 const results=await p.evaluate(async({samples,fixture})=>{
  const a=window.__material,{d}=a,{SmokeVolume}=await import('/js/renderer/smoke-volume.js');
  const full=new SmokeVolume(d,'rgba8unorm',{camera:a.camera,smokeUniform:a.uniform,smoke:a.particles,flags:a.flags});await full.init();full.scale=1;
  const ts=d.features.has('timestamp-query'),query=ts?d.createQuerySet({type:'timestamp',count:6}):null;
  const resolve=ts?d.createBuffer({size:48,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}):null,read=ts?d.createBuffer({size:48,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}):null;
  const timestamp=i=>ts?{querySet:query,beginningOfPassWriteIndex:i,endOfPassWriteIndex:i+1}:undefined;
  if(fixture)a.seed=()=>{const values=new Float32Array(fixture.values);for(let i=0;i<a.count;i++){values[i*12]-=fixture.camera.x;values[i*12+1]-=fixture.camera.y;}d.queue.writeBuffer(a.particles,0,values);d.queue.writeBuffer(a.flags,0,new Uint32Array(fixture.flags));};
  const rows=[];
  for(const scene of (fixture?['recorded-drift']:['sparse','dense','overlap']))for(const ppm of [20,80]){
   a.seed(scene);d.queue.writeBuffer(a.camera,0,new Float32Array([1,ppm,a.width,a.height,0,0]));a.uniformData.set([0,0,2.5,fixture?.time??1,0,0,ppm>40?2:1,0]);a.uint[1]=a.count;d.queue.writeBuffer(a.uniform,0,a.uniformData);a.s.params.smokeShadingMode=2;
   for(const v of [a.volume,full])v.prepare(a.s,a.width,a.height,ppm,a.count,false);
   for(let frame=0;frame<samples+4;frame++)for(const kind of (frame%2?['full','shared','local','legacy']:['legacy','local','shared','full'])){
    const v=kind==='full'?full:a.volume;v.mode=kind==='local'?1:2;d.queue.writeBuffer(v.bounds,0,new Uint32Array([a.width,a.height,0,0]));
    const start=performance.now(),e=d.createCommandEncoder();
    if(kind==='shared'||kind==='full')v.encode({beginComputePass:desc=>e.beginComputePass({...desc,timestampWrites:timestamp(0)}),beginRenderPass:desc=>e.beginRenderPass({...desc,timestampWrites:timestamp(2)})});
    const pass=e.beginRenderPass({timestampWrites:timestamp(4),colorAttachments:[{view:a.target.createView(),loadOp:'clear',storeOp:'store',clearValue:[.055,.065,.075,1]}]});
    if(kind==='legacy'){pass.setPipeline(a.legacy);a.groups.forEach((g,i)=>pass.setBindGroup(i,g));pass.draw(6,a.count);}else v.draw(pass);pass.end();
    if(ts){e.resolveQuerySet(query,0,6,resolve,0);e.copyBufferToBuffer(resolve,0,read,0,48);}
    d.queue.submit([e.finish()]);const encodeMs=performance.now()-start;await d.queue.onSubmittedWorkDone();const completionMs=performance.now()-start;
    let timing={};if(ts){await read.mapAsync(GPUMapMode.READ);const q=new BigUint64Array(read.getMappedRange());const shared=['shared','full'].includes(kind);timing={boundsMs:shared?Number(q[1]-q[0])/1e6:0,densityMs:shared?Number(q[3]-q[2])/1e6:0,shadingMs:Number(q[5]-q[4])/1e6};read.unmap();timing.totalGpuMs=timing.boundsMs+timing.densityMs+timing.shadingMs;}
    if(frame>=4)rows.push({scene,ppm,kind,encodeMs,completionMs,...timing});
   }
  }
  full.destroy();return {scope:'Isolated rendering; recorded snapshot when supplied, otherwise 512 slots by default; 24 sparse or all live; 640x480; identical frozen particles; alternating order, 4 warmups per condition. Bounds, density and shading use actual GPU timestamps; uploads, simulation and presentation excluded.',rows,errors:a.errors};
 },{samples:Number(arg('--samples','12')),fixture});
 writeFileSync(arg('--output','/tmp/smoke-material-cost.json'),JSON.stringify({info,fixture:fixture?{count:fixture.count,live:fixture.flags.filter(Boolean).length,time:fixture.time}:null,...results},null,2));console.log({samples:results.rows.length,info,errors:results.errors});
}finally{await b.close();}
