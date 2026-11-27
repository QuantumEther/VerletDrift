const $ = id => document.getElementById(id);
const latest = '0.187.0';
let report;
function stats(values) {
  const a=values.toSorted((x,y)=>x-y),n=a.length;
  const q=p=>a[Math.max(0,Math.ceil(n*p)-1)]??null;
  const mean=a.reduce((s,v)=>s+v,0)/n;
  const slow=a.slice(-Math.max(1,Math.ceil(n*.01)));
  return {mean,median:q(.5),p95:q(.95),p99:q(.99),p999:q(.999),max:a.at(-1),fps:1000/mean,onePercentLowFps:1000/(slow.reduce((s,v)=>s+v,0)/slow.length)};
}
async function sample(render,duration=2000) {
  const intervals=[],cpu=[];let previous=null,start=null;
  await new Promise((resolve,reject)=>{
    function frame(now) {
      if(document.hidden){reject(Error('Tab became hidden'));return;}
      start??=now;
      const begin=performance.now();
      try{render();}catch(e){reject(e);return;}
      if(now-start>500){if(previous!==null)intervals.push(now-previous);cpu.push(performance.now()-begin);}
      previous=now;
      if(now-start<duration)requestAnimationFrame(frame);else resolve();
    }
    requestAnimationFrame(frame);
  });
  return {interval:stats(intervals),cpuSubmission:stats(cpu),rawIntervals:intervals,rawCpu:cpu,scope:'Animation callbacks and CPU submission. Presented frames are not independently counted.'};
}
function triangle(T) {
  const scene=new T.Scene(),camera=new T.Camera(),g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([-.7,-.7,0,.7,-.7,0,0,.7,0],3));
  const material=new T.MeshBasicMaterial({color:0xff7026});
  scene.add(new T.Mesh(g,material));
  return {scene,camera,dispose(){g.dispose();material.dispose();}};
}
async function nativeGL(canvas,c) {
  const gl=canvas.getContext('webgl2',{antialias:c.aa,alpha:false});
  if(!gl)throw Error('WebGL2 unavailable');
  const program=gl.createProgram(),shaders=[];
  for(const [type,source] of [[gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p[3]=vec2[3](vec2(-.7,-.7),vec2(.7,-.7),vec2(0,.7));gl_Position=vec4(p[gl_VertexID],0,1);}'],[gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;out vec4 color;void main(){color=vec4(1.,.439,.149,1.);}']]){
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
    shaders.push(shader);gl.attachShader(program,shader);
  }
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {info:{adapter:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),attributes:gl.getContextAttributes()},render(){gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.drawArrays(gl.TRIANGLES,0,3);},dispose(){shaders.forEach(s=>gl.deleteShader(s));gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}
async function nativeGPU(canvas,c) {
  const adapter=await navigator.gpu?.requestAdapter(c.power?{powerPreference:c.power}:{});
  if(!adapter)throw Error('WebGPU adapter unavailable');
  const device=await adapter.requestDevice();
  const context=c.offscreen?null:canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();
  context?.configure({device,format,alphaMode:'opaque'});
  const usage=GPUTextureUsage.RENDER_ATTACHMENT;
  const target=c.offscreen?device.createTexture({size:[canvas.width,canvas.height],format,usage}):null;
  const msaa=c.aa?device.createTexture({size:[canvas.width,canvas.height],format,usage,sampleCount:4}):null;
  const module=device.createShaderModule({code:'@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{var p=array<vec2f,3>(vec2f(-.7,-.7),vec2f(.7,-.7),vec2f(0,.7));return vec4f(p[i],0,1);}@fragment fn fs()->@location(0) vec4f{return vec4f(1.,.439,.149,1.);}'});
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format}]},multisample:{count:c.aa?4:1}});
  return {info:{adapter:{vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,device:adapter.info?.device,description:adapter.info?.description},timestampSupport:adapter.features.has('timestamp-query'),gpuTiming:'Not measured in raw path'},render(){const view=(target??context.getCurrentTexture()).createView(),encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:msaa?msaa.createView():view,resolveTarget:msaa?view:undefined,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(pipeline);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);},dispose(){target?.destroy();msaa?.destroy();context?.unconfigure();device.destroy();}};
}
async function three(canvas,c) {
  const source=c.kind==='three-new'?'https://cdn.jsdelivr.net/npm/three@'+latest+'/build/three.webgpu.js':c.kind==='three-gl'?'../vendor/three-r180/three.module.js':'../vendor/three-r180/three.webgpu.js';
  const T=await import(source);
  const renderer=c.kind==='three-gl'?new T.WebGLRenderer({canvas,antialias:c.aa,alpha:false}):new T.WebGPURenderer({canvas,antialias:c.aa,forceWebGL:false,powerPreference:c.power,trackTimestamp:c.timestamp});
  try {
    if(c.kind!=='three-gl'){await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Unexpected WebGL fallback');}
    renderer.setPixelRatio(1);renderer.setSize(canvas.width,canvas.height,false);
    const mesh=triangle(T),target=c.offscreen?new T.RenderTarget(canvas.width,canvas.height):null;
    if(target){target.samples=c.aa?4:0;renderer.setRenderTarget(target);}
    const adapter=renderer.backend?.device?.adapterInfo;
    return {info:{revision:T.REVISION,adapter:adapter?{vendor:adapter.vendor,architecture:adapter.architecture,device:adapter.device,description:adapter.description}:null,timestampRequested:c.timestamp,gpuTiming:'Tracking overhead only; GPU duration not resolved in this case',resizeCalls:1,pixelRatioCalls:1},render(){renderer.render(mesh.scene,mesh.camera);},dispose(){mesh.dispose();target?.dispose();renderer.dispose();}};
  }catch(error){renderer.dispose();throw error;}
}
$('run').onclick=async()=>{
  $('run').disabled=true;$('save').disabled=true;$('results').replaceChildren();
  report={schema:1,latestThree:latest,browser:navigator.userAgent,dpr:devicePixelRatio,screen:{width:screen.width,height:screen.height},records:[],limitations:['Raw WebGPU GPU timestamps are not measured. Three timestamp variants measure tracking overhead only. Native hardware conclusions require the exported target-device results.']};
  const cases=[{kind:'cadence',size:[640,360]}];
  for(const kind of ['native-gl','native-gpu','three-gl','three-gpu','three-new']){
    const gpu=!kind.endsWith('-gl');
    for(const size of [[640,360],[1280,720]])for(const aa of [false,true])for(const offscreen of (gpu?[false,true]:[false]))for(const power of (gpu?[undefined,'high-performance']:[undefined]))for(const timestamp of (kind.startsWith('three-')&&gpu?[false,true]:[false]))cases.push({kind,size,aa,offscreen,power,timestamp});
  }
  const smoke = new URLSearchParams(location.search).get('smoke');
  if(smoke==='gpu')cases.splice(0,cases.length,...cases.filter(c=>c.kind==='native-gpu').slice(0,2));
  else if(smoke!==null)cases.splice(5);
  for(const c of cases) {
    const canvas=document.createElement('canvas');canvas.width=c.size[0];canvas.height=c.size[1];$('surface').replaceChildren(canvas);
    let backend;
    const record={configuration:c,drawingBuffer:c.size,pixelRatio:1};
    $('status').textContent=(report.records.length+1)+' / '+cases.length+' · '+c.kind;
    try {
      if(c.kind==='cadence'){canvas.remove();record.measurement=await sample(()=>{});}
      else {backend=c.kind==='native-gl'?await nativeGL(canvas,c):c.kind==='native-gpu'?await nativeGPU(canvas,c):await three(canvas,c);record.info=backend.info;record.measurement=await sample(backend.render);}
    }catch(error){record.error=error.message;}
    finally{backend?.dispose();canvas.remove();}
    report.records.push(record);
    const row=document.createElement('tr');
    for(const text of [c.kind+(c.offscreen?' offscreen':''),record.measurement?.interval.fps.toFixed(1)??record.error,record.measurement?.interval.p99.toFixed(2)??'—',record.measurement?.cpuSubmission.mean.toFixed(3)??'—']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
    $('results').append(row);
    if(document.hidden)break;
  }
  $('status').textContent='Complete · '+report.records.length+' cases';
  $('save').disabled=false;$('run').disabled=false;
};
$('save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gpu-isolation.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
