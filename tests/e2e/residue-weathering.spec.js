import {test,expect} from '@playwright/test';
import {offscreenSplash,seekSplash,splashPixels,groundPixels,dryGroundPixels} from './helpers/splash-gpu.js';
async function start(page,extra=''){
 await offscreenSplash(page);await page.goto(`/experiments/splash-lab/?paused=1&time=40&${extra}`);
 await page.waitForFunction(()=>window.splashLab?.ready&&window.splashLab.renderer.stats.frames>0);
}
test('residue erodes reproducibly to clean asphalt without changing deposition or allocating resources',async({page})=>{
 await start(page);const atlas=await groundPixels(page),fresh=await splashPixels(page);
 const allocations=await page.evaluate(()=>window.splashLab.renderer.stats.resourceAllocations);
 await seekSplash(page,70);const aged=await splashPixels(page);expect(aged.hash).not.toBe(fresh.hash);
 await seekSplash(page,300);const clean=await splashPixels(page),reference=await dryGroundPixels(page);
 expect(clean.hash).toBe(reference.hash);
 await seekSplash(page,70);expect((await splashPixels(page)).hash).toBe(aged.hash);
 expect((await groundPixels(page)).hash).toBe(atlas.hash);
 expect(await page.evaluate(()=>window.splashLab.renderer.stats.resourceAllocations)).toBe(allocations);
 await page.locator('#residue-aging').evaluate(node=>{node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
 await seekSplash(page,300);expect((await splashPixels(page)).hash).not.toBe(clean.hash);
});
test('slowest residue controls still clear and early liquid appearance is preserved',async({page})=>{
 await start(page,'residueLifetime=100&residuePersistence=1&residueIrregularity=1&dryingDuration=24&dyeResidue=1&seed=42');
 await seekSplash(page,300);expect((await splashPixels(page)).hash).toBe((await dryGroundPixels(page)).hash);
 await seekSplash(page,2);const early=await splashPixels(page);
 await page.locator('#residue-aging').evaluate(node=>{node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
 await seekSplash(page,2);expect((await splashPixels(page)).hash).toBe(early.hash);
});
test('actual WGSL removes weak dye first with stable spatial erosion rather than uniform fading',async({page})=>{
 await start(page);
 const values=await page.evaluate(async()=>{
  const r=window.splashLab.renderer,{device}=r;
  const source=await Promise.all(['common','material','puddles'].map(n=>fetch(`/js/shaders/liquid/${n}.wgsl`).then(r=>r.text())));
  const module=device.createShaderModule({code:source.join('\n')+`
   @group(0) @binding(1) var<storage,read_write> output:array<vec4<f32>>;
   @group(0) @binding(2) var linearSampler:sampler;
   @group(0) @binding(3) var groundTexture:texture_2d<f32>;
   @compute @workgroup_size(32) fn probe(@builtin(global_invocation_id) id:vec3<u32>){
    let world=vec2(f32(id.x)*.173,1.7);
    let m=PuddleMaterial(.01,1.,1.,.5,.05);
    output[id.x]=vec4(
     weatherDye(world,.01,.02,.03,m,.5,.5,70.).mass,
     weatherDye(world,.01,.20,.22,m,.5,.5,70.).mass,
     weatherDye(world,.01,.20,.22,m,.5,.5,80.).mass,
     weatherDye(world,.01,.20,.22,m,.5,.5,300.).mass);
   }`});
  const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'probe'}});
  const size=32*16,out=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{
   const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:r.uniformBuffer}},{binding:1,resource:{buffer:out}}]});
   const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,group);p.dispatchWorkgroups(1);p.end();e.copyBufferToBuffer(out,0,read,0,size);device.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);
   return Array.from(new Float32Array(read.getMappedRange()));
  }finally{read.unmap();read.destroy();out.destroy();}
 });
 const rows=Array.from({length:32},(_,i)=>values.slice(i*4,i*4+4));
 expect(rows.every(r=>r[0]===0&&r[1]>0&&r[2]<r[1]&&r[3]===0)).toBe(true);
 expect(new Set(rows.map(r=>r[1].toFixed(5))).size).toBeGreaterThan(20);
});
test('weathering controls independently change the material and reset reproduces defaults',async({page})=>{
 await start(page);await seekSplash(page,65);const reference=await splashPixels(page);
 const set=async(id,v)=>page.locator(`#${id}`).evaluate((n,v)=>{n.value=String(v);n.dispatchEvent(new Event('input',{bubbles:true}));},v);
 for(const [id,value,reset] of [['residue-lifetime',100,60],['residue-irregularity',0,.65],['residue-persistence',0,.55]]){
  await set(id,value);await seekSplash(page,65);expect((await splashPixels(page)).hash,id).not.toBe(reference.hash);
  await set(id,reset);await seekSplash(page,65);expect((await splashPixels(page)).hash,id).toBe(reference.hash);
 }
 await set('residue-lifetime',20);await page.locator('#reset-controls').evaluate(n=>n.click());await seekSplash(page,65);
 expect((await splashPixels(page)).hash).toBe(reference.hash);
});
