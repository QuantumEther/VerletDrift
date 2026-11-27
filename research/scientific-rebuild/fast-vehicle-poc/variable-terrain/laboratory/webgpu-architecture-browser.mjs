import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.VERLETDRIFT_URL??'http://127.0.0.1:8792';
const directory=process.env.VERLETDRIFT_CAPTURES??'/tmp/verletdrift-architecture';
const base='/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',
 args:['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
const driving=process.argv.includes('--drive'),visual=process.argv.includes('--visual');
const cases=driving?[{name:'reference-driving',architecture:'reference',motion:true},{name:'optimized-driving',architecture:'auto',motion:true}]:[
 {name:'reference-motion',architecture:'reference',motion:true},
 {name:'reference-hdr',architecture:'reference',motion:false},
 {name:'stationary',architecture:'auto',motion:true},
 {name:'optimized-hdr',architecture:'auto',motion:false},
 {name:'opaque-hdr',architecture:'cinematic',motion:false,opaque:true},
 {name:'direct',architecture:'direct',motion:false,opaque:true},
 {name:'webgl',backend:'webgl',architecture:'auto',motion:false},
];
const results=[];
await mkdir(directory,{recursive:true});
try{
 for(const setup of visual?cases.filter(c=>c.opaque):cases){
  const page=await browser.newPage({viewport:{width:900,height:740}});
  const errors=[];
  await page.addInitScript(()=>{
   window.renderPasses={total:0,output:0,discardedResolves:0};
   const native=GPUCommandEncoder.prototype.beginRenderPass;
   GPUCommandEncoder.prototype.beginRenderPass=function(descriptor){
    renderPasses.total++;
    if(descriptor.label==='VerletDrift resolved color output')renderPasses.output++;
    for(const attachment of descriptor.colorAttachments)if(attachment?.resolveTarget&&attachment.storeOp==='discard')renderPasses.discardedResolves++;
    return native.call(this,descriptor);
   };
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(/While validating|Invalid RenderPipeline|Invalid CommandBuffer|GL_INVALID/.test(msg.text()))errors.push(msg.text());});
  await page.goto(origin+base+'?terrain=flight&backend='+(setup.backend??'webgpu')+'&gpu-architecture='+setup.architecture+'&motion='+(setup.motion?'on':'off'));
  await page.evaluate(async base=>{
   window.app=await import(base+'main.js');
   const pause=document.querySelector('#pause');if(pause.textContent!=='Resume')pause.click();
   const scale=document.querySelector('#render-scale');scale.value='.5';scale.dispatchEvent(new Event('change'));
  },base);
  await page.waitForFunction(()=>{
   try{const s=app.rendererSnapshot();return s.assetStatus==='ready'&&s.graphics.status==='ready'&&s.terrainUpdates>0;}
   catch{return false;}
  },null,{timeout:120000});
  await page.evaluate(opaque=>{
   const scale=document.querySelector('#render-scale');scale.value='.5';scale.dispatchEvent(new Event('change'));
   document.querySelector('#diag-gpu').checked=true;
   if(opaque){
    document.querySelector('#diag-mode').value='incremental';
    for(const [name,active] of [['terrain',true],['lighting',true],['other',false],['vehicle',false],['tracks',false],['smoke',false]]){
     document.querySelector('#diag-'+name).checked=active;
    }
   }
  },!!setup.opaque);
  if(driving){
   await page.evaluate(()=>document.querySelector('#coast').click());
   await page.waitForFunction(()=>{
    try{return app.simulationSnapshot().y[3]===3&&app.rendererSnapshot().graphics.status==='ready'&&app.rendererSnapshot().assetStatus==='ready';}
    catch{return false;}
   },null,{timeout:90000});
   await page.evaluate(()=>document.querySelector('#pause').click());
  }else await page.waitForTimeout(3000);
  if(setup.name==='direct'){
   await page.waitForFunction(()=>app.rendererSnapshot().renderArchitecture.active==='direct',null,{timeout:12000})
    .catch(async error=>{throw Error('Direct path did not activate: '+JSON.stringify(await page.evaluate(()=>app.rendererSnapshot()))+' '+error.message);});
  }
  if(visual){
   const image=await page.evaluate(()=>new Promise((resolve,reject)=>requestAnimationFrame(()=>{
    try{
     const canvas=document.querySelector('#perspective'),ctx=canvas.getContext('webgpu');
     const {device,format}=ctx.getConfiguration(),width=canvas.width,height=canvas.height,stride=Math.ceil(width*4/256)*256;
     const buffer=device.createBuffer({size:stride*height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
     const encoder=device.createCommandEncoder();
     encoder.copyTextureToBuffer({texture:ctx.getCurrentTexture()},{buffer,bytesPerRow:stride},[width,height]);
     device.queue.submit([encoder.finish()]);
     buffer.mapAsync(GPUMapMode.READ).then(()=>{
      try{
       const bytes=new Uint8ClampedArray(buffer.getMappedRange()),data=new ImageData(width,height);
       for(let y=0;y<height;y++)data.data.set(bytes.subarray(y*stride,y*stride+width*4),y*width*4);
       if(format.startsWith('bgra'))for(let i=0;i<data.data.length;i+=4)[data.data[i],data.data[i+2]]=[data.data[i+2],data.data[i]];
       const output=document.createElement('canvas');output.width=width;output.height=height;output.getContext('2d').putImageData(data,0,0);
       resolve(output.toDataURL('image/png').split(',')[1]);
      }finally{buffer.destroy();}
     },reject).catch(reject);
    }catch(error){reject(error);}
   })));
   assert.deepEqual(errors,[]);
   assert.equal(await page.locator('#warning').textContent(),'');
   await writeFile(directory+'/'+setup.name+'.png',Buffer.from(image,'base64'));
   await page.close();
   continue;
  }
  const captures=await page.evaluate(async()=>{
   const c=document.querySelector('#perspective'),d=document.querySelector('#diag-duration');
   d.add(new Option('4 seconds','4'));d.value='4';
   const begin=document.querySelector('#diag-start');
   const records=[];
   for(let i=0;i<2;i++){
    const previous=app.performanceReport(),start={...renderPasses};begin.click();
    while(app.performanceReport()===previous)await new Promise(resolve=>setTimeout(resolve,120));
    const r=app.performanceReport();
    records.push({settings:r.settings,frames:r.frames,meanFps:r.meanFps,onePercentLowFps:r.onePercentLowFps,
     stats:r.stats,gpu:r.gpu,debt:app.runtimeSnapshot().clock,changed:r.settingsChanged,passes:Object.fromEntries(Object.keys(start).map(key=>[key,renderPasses[key]-start[key]]))});
   }
   return {buffer:[c.width,c.height],snapshot:app.rendererSnapshot(),records};
  });
  assert.deepEqual(errors,[]);
  assert.ok(captures.records.every(report=>!report.changed&&!report.debt.fault),JSON.stringify(captures.records.map(r=>r.debt.fault?.message)));
  assert.equal(captures.snapshot.graphics.shadowSize,2048);
  const result={...setup,...captures};
  results.push(result);
  console.log(setup.name,captures.snapshot.renderArchitecture,captures.records.map(r=>({frames:r.frames,fps:r.meanFps})));
  await writeFile(directory+'/timings.json',JSON.stringify(results,null,2)+'\n');
  if(setup.backend!=='webgl'&&!driving){
   const pixels=await page.evaluate(async base=>{
    const {sampleCanvasTexture}=await import(base+'gpu-isolation/output-check.js');
    return new Promise((resolve,reject)=>requestAnimationFrame(()=>sampleCanvasTexture(document.querySelector('#perspective')).then(resolve,reject)));
   },base);
   assert.ok(new Set(pixels.map(String)).size>1);
   result.pixels=pixels;
   await writeFile(directory+'/timings.json',JSON.stringify(results,null,2)+'\n');
  }
  await page.close();
 }
 if(visual)process.stdout.write("Captured matching opaque HDR and direct views.\n");
 else {
 assert.deepEqual(results.map(r=>r.buffer),Array(results.length).fill(results[0].buffer));
 if(!driving){
  const byName=name=>results.find(r=>r.name===name);
  assert.equal(byName('reference-motion').snapshot.renderArchitecture.active,'motion');
  assert.equal(byName('stationary').snapshot.renderArchitecture.active,'stationary');
  for(const [a,b] of [['opaque-hdr','direct'],['reference-hdr','stationary'],['reference-hdr','optimized-hdr']]){
   assert.ok(byName(a).pixels.flat().every((x,i)=>Math.abs(x-byName(b).pixels.flat()[i])<=3),a+' / '+b);
  }
 }
 }
}finally{await browser.close();}
