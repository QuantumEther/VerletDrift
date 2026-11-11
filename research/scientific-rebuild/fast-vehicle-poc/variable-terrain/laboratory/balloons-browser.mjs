import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const backend=process.argv[2]==='webgl'?'webgl':'webgpu',root=process.cwd(),base='/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/';
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname,p=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[extname(p)]||'text/plain');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}${base}gpu-fixture.html`);
 const result=await page.evaluate(async({base,backend})=>{
  const T=await import('three'),GPU=await import('three/webgpu'),{createBalloons}=await import(base+'balloons.js'),{createLiquidMaterials}=await import(base+'liquid-materials.js');
  const renderer=backend==='webgpu'?new GPU.WebGPURenderer({trackTimestamp:true}):new T.WebGLRenderer();if(backend==='webgpu'){await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Unexpected backend');}
  renderer.setSize(640,480);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  const target=backend==='webgpu'?new GPU.RenderTarget(640,480,{colorSpace:T.SRGBColorSpace}):new T.WebGLRenderTarget(640,480,{colorSpace:T.SRGBColorSpace});renderer.setRenderTarget(target);
  const scene=new T.Scene();scene.background=new T.Color(0xa4b5c3);const ground=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:0xb3aaa1,roughness:.8}));scene.add(ground);
  scene.add(new T.HemisphereLight(0xdceaff,0x66604c,2));const sun=new T.DirectionalLight(0xfff0dc,3);sun.position.set(-2,-3,5);scene.add(sun);
  const terrain={sample:(x,y)=>({height:0,gradient:[0,0]})},b=createBalloons(T,scene,terrain,await createLiquidMaterials(T,backend));
  const camera=new T.PerspectiveCamera(48,640/480,.05,150);camera.up.set(0,0,1);
  let p={time:0,z:.4,planar:{x:0,y:0,heading:0},wheels:[]};const captures=[];
  async function render(){if(backend==='webgpu')await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);const raw=backend==='webgpu'?await renderer.readRenderTargetPixelsAsync(target,0,0,640,480):new Uint8Array(640*480*4);if(backend==='webgl')renderer.readRenderTargetPixels(target,0,0,640,480,raw);const data=new Uint8ClampedArray(raw.length);for(let y=0;y<480;y++)data.set(raw.subarray((backend==='webgl'?479-y:y)*2560,(backend==='webgl'?480-y:y+1)*2560),y*2560);return data;}
  async function capture(id){const pixels=await render(),canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;canvas.getContext('2d').putImageData(new ImageData(pixels,640,480),0,0);captures.push({id,image:canvas.toDataURL(),info:JSON.parse(JSON.stringify(b.info()))});return pixels;}
  camera.position.set(4,-5,3);camera.lookAt(2,0,0);
  b.draw(p);await capture('sizes');p.time=.1;p.planar.x=7;b.draw(p);const impactTime=.1;
  for(const [name,age]of [['sheet',.08],['droplets',.25],['deposits',1.8]]){p.time=impactTime+age;b.draw(p);await capture(name);}
  sun.intensity=.4;await capture('deposits-overcast');sun.intensity=3;sun.position.set(4,-4,.7);await capture('deposits-low-sun');sun.position.set(-2,-3,5);camera.position.set(-3,-4,4);camera.lookAt(2,0,0);await capture('deposits-angle');camera.position.set(4,-5,3);camera.lookAt(2,0,0);
  const before=await render(),samples=b.info().liquid.terrainVertexSamples;p.planar.x+=20;camera.position.x-=20;controlsLook(-18);b.draw(p);const shifted=await render();let maxDiff=0,changed=0;for(let i=0;i<before.length;i+=4){const d=Math.max(Math.abs(before[i]-shifted[i]),Math.abs(before[i+1]-shifted[i+1]),Math.abs(before[i+2]-shifted[i+2]));maxDiff=Math.max(maxDiff,d);if(d>3)changed++;}const persistence={changedPixels:changed,maxDiff,samplesBefore:samples,samplesAfter:b.info().liquid.terrainVertexSamples};
  function controlsLook(x){camera.lookAt(x,0,0);}
  // Bounded CPU-only draw workload. Excludes renderer, driver and presentation.
  const costs=[];for(let i=0;i<300;i++){p.time+=.001;const t=performance.now();b.draw(p);costs.push(performance.now()-t);}costs.sort((a,b)=>a-b);const cpu={meanMs:costs.reduce((a,b)=>a+b,0)/costs.length,p95Ms:costs[Math.floor(costs.length*.95)],p99Ms:costs[Math.floor(costs.length*.99)],worstMs:costs.at(-1)};
  const objects=scene.children.filter(o=>o!==ground&&!o.isLight),renderAB=[];
  for(const enabled of [false,true]){objects.forEach(o=>o.visible=enabled);for(let i=0;i<5;i++){if(backend==='webgpu')await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);}if(backend==='webgpu'&&renderer.hasFeature('timestamp-query'))await renderer.resolveTimestampsAsync('render');const cpuRender=[],gpu=[];for(let i=0;i<30;i++){const start=performance.now();if(backend==='webgpu')await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);cpuRender.push(performance.now()-start);if(backend==='webgpu'&&renderer.hasFeature('timestamp-query')){const ms=await renderer.resolveTimestampsAsync('render');if(Number.isFinite(ms))gpu.push(ms);}}const summarize=a=>a.length?{meanMs:a.reduce((a,b)=>a+b,0)/a.length,p95Ms:[...a].sort((a,b)=>a-b)[Math.floor(a.length*.95)],samples:a.length}:null;renderAB.push({effectsEnabled:enabled,cpuSubmission:summarize(cpuRender),gpuRenderPassBatch:summarize(gpu)});}
  const info=b.info(),deviceInfo=backend==='webgpu'?renderer.backend.device?.adapterInfo:null,adapter=deviceInfo?Object.fromEntries(['vendor','architecture','device','description'].map(k=>[k,deviceInfo[k]??null])):null;b.dispose();target.dispose();renderer.dispose();return {backend,browser:navigator.userAgent,threeRevision:T.REVISION,canvas:[640,480],adapter,captures,persistence,cpu,renderAB,info};
 },{base,backend});
 for(const c of result.captures){await writeFile(new URL(`results/balloons-${backend}-${c.id}.png`,import.meta.url),Buffer.from(c.image.split(',')[1],'base64'));delete c.image;}
 assert.ok(result.info.impacts>0);assert.ok(result.info.liquid.patches>0);assert.equal(result.persistence.samplesBefore,result.persistence.samplesAfter);assert.ok(result.persistence.changedPixels<100,'World-origin rebasing changed deposited liquid');
 const critical=errors.filter(e=>!e.includes('404'));assert.deepEqual(critical,[]);await writeFile(new URL(`results/balloons-${backend}.json`,import.meta.url),JSON.stringify({...result,environment:'headless Chromium, SwiftShader; offscreen render/readback; CPU draw timing excludes GPU and presentation'},null,2));console.log(JSON.stringify({...result,captures:result.captures.map(c=>({id:c.id,info:c.info}))}));
}finally{await browser.close();server.close();}
