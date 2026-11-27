import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin=process.env.VERLETDRIFT_URL??'http://127.0.0.1:8792';
const root='/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/';
const destination=process.env.MOTION_CAPTURES??'/tmp/verletdrift-motion';
await mkdir(destination,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM??'/usr/bin/chromium',
 args:['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader',
  '--use-vulkan=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
try {
 const backend=process.argv.includes('--webgl')?'webgl':'webgpu';
 const page=await browser.newPage({viewport:{width:760,height:480}});
 const errors=[];
 const validationErrors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',m=>{if(/While validating|Invalid RenderPipeline|Invalid CommandBuffer|Shader Error|GL_INVALID/.test(m.text()))validationErrors.push(m.text());});
 await page.goto(origin+root+'gpu-fixture.html');
 const result=await page.evaluate(async ({root,backend})=>{
  const gpu=backend==='webgpu';
  const T=await import(root+'vendor/three-r180/'+(gpu?'three.webgpu.js':'three.module.js'));
  const {createWebGLMotionBlur}=await import(root+'motion-blur-webgl.js');
  const {createMotionBlur,motionDefaults}=await import(root+'motion-blur.js');
  const {createRendererBackend}=await import(root+'renderer-backend.js');
  const width=640,height=360;
  const canvas=document.createElement('canvas'),{renderer}=await createRendererBackend(canvas,backend);
  renderer.setSize(width,height);
  renderer.singleSampleCanvasOutput=true;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,width/height,.05,100);
  scene.background=new T.Color('#9cb4bf');camera.position.set(0,2.4,8);camera.lookAt(0,0,0);
  const body=new T.Group(),hubs=[];
  scene.add(body);
  function box(parent,color,size,position){
   const mesh=new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({color}));
   mesh.position.set(...position);parent.add(mesh);return mesh;
  }
  box(scene,'#363d43',[30,.1,18],[0,-.1,0]);
  const barrier=box(scene,'#e8e0a6',[.54,.8,4],[0,.4,.65]);
  const vehicle=box(body,'#a45130',[2.2,.65,1.25],[0,.33,.15]);
  for(let i=-12;i<=12;i++){
   box(scene,i%2?'#25392b':'#dde8dc',[.18,1.3,.2],[i*.55,.65,-2.4]);
   box(scene,'#d5c9a4',[.12,.01,1.4],[i*.65,0,2.7]);
  }
  const blur=gpu?await createMotionBlur(renderer,body,hubs,new Set()):createWebGLMotionBlur(renderer,body,hubs,new Set());
  blur.configure({...motionDefaults,quality:'balanced',radius:32});
  const p={planar:{x:0,y:0,u:30,v:0},wheels:[]};
  async function read(label,render){
   const pixels=await new Promise((resolve,reject)=>requestAnimationFrame(()=>{
    try{
     render();
     if(!gpu){
      const copy=document.createElement('canvas');copy.width=width;copy.height=height;
      const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);
      resolve(ctx.getImageData(0,0,width,height).data);return;
     }
     const context=canvas.getContext('webgpu'),{device,format}=context.getConfiguration();
     const buffer=device.createBuffer({size:width*height*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
     const encoder=device.createCommandEncoder();
     encoder.copyTextureToBuffer({texture:context.getCurrentTexture()},{buffer,bytesPerRow:width*4},[width,height]);
     device.queue.submit([encoder.finish()]);
     buffer.mapAsync(GPUMapMode.READ).then(()=>{
      const data=new Uint8ClampedArray(buffer.getMappedRange()).slice();
      if(format.startsWith('bgra'))for(let i=0;i<data.length;i+=4)[data[i],data[i+2]]=[data[i+2],data[i]];
      buffer.destroy();resolve(data);
     },reject);
    }catch(error){reject(error);}
   }));
   const image=document.createElement('canvas');image.id=label;image.width=width;image.height=height;
   image.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);document.body.append(image);
   return pixels;
  }
  const draw=()=>renderer.render(scene,camera);
  const aim=x=>{camera.position.x=x;camera.lookAt(x,0,0);};
  aim(.18);body.position.x=.18;
  barrier.position.x=.2;vehicle.position.x=.25;
  const ordinary=await read('off',draw);
  const clean=await read('sharp',()=>blur.render(scene,camera,p,width,height,0));
  aim(-.02);body.position.x=-.02;
  barrier.position.x=-.25;vehicle.position.x=.15;
  blur.render(scene,camera,p,width,height,10);
  barrier.position.x=.2;vehicle.position.x=.25;
  aim(.18);body.position.x=.18;
  const blurred=await read('on',()=>blur.render(scene,camera,p,width,height,20));
  blur.reset();
  const cut=await read('cut',()=>blur.render(scene,camera,p,width,height,30));
  function difference(a,b){
   let count=0;
   for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>8)count++;
   return count;
  }
  const device=renderer.backend?.device;
  const gl=gpu?null:renderer.getContext(),ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  const timestamp=gpu?renderer.hasFeature('timestamp-query'):!!ext;
  async function timer(query){
   const end=performance.now()+3000;
   while(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)&&performance.now()<end)
    await new Promise(resolve=>requestAnimationFrame(resolve));
   const ms=gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT)
    ?gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6:null;
   gl.deleteQuery(query);return ms;
  }
  async function measure(quality){
   blur.configure({...motionDefaults,quality:quality??'fast',radius:32});
   blur.reset();
   const cpu=[],gpuTimes=[];
   for(let i=0;i<6;i++){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    barrier.position.x=i%2?.2:-.25;
    const query=ext?gl.createQuery():null;
    if(gpu)renderer.backend.trackTimestamp=timestamp;
    if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
    const begin=performance.now();
    if(quality)blur.render(scene,camera,p,width,height,100+i*16);
    else draw();
    cpu.push(performance.now()-begin);
    if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);gpuTimes.push(await timer(query));}
    else if(timestamp)gpuTimes.push(await renderer.resolveTimestampsAsync('render'));
   }
   return {cpu,gpu:gpuTimes};
  }
  return {backend,colorParityPixels:difference(ordinary,clean),adapter:device?.adapterInfo?.description??gl?.getParameter(gl.RENDERER),timestamp,changedPixels:difference(clean,blurred),cutPixels:difference(clean,cut),off:await measure(null),fast:await measure('fast'),balanced:await measure('balanced')};
 },{root,backend});
 assert.deepEqual(errors,[]);
 assert.deepEqual(validationErrors,[]);
 assert.ok(result.changedPixels>20,JSON.stringify(result));
 assert.ok(result.cutPixels<8,JSON.stringify(result));
 for(const name of ['off','on'])await page.locator('#'+name).screenshot({path:destination+'/'+backend+'-'+name+'.png'});
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
