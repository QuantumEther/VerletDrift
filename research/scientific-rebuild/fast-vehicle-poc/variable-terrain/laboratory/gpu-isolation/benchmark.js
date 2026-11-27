import {sampleCanvasTexture} from './output-check.js';
import {applicationCase} from './application.js';
import { sources, laboratoryAvailable } from './dependencies.js';
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
async function sample(render,duration=new URLSearchParams(location.search).has('verify')?600:2000) {
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
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,.1,10),g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([-.7,-.7,0,.7,-.7,0,0,.7,0],3));
  const material=new T.MeshBasicMaterial({color:0xff7026});
  camera.position.z=1;
  camera.updateProjectionMatrix();
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
  context?.configure({device,format,alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const usage=GPUTextureUsage.RENDER_ATTACHMENT;
  const target=(c.offscreen||c.compose)?device.createTexture({size:[canvas.width,canvas.height],format,usage:usage|GPUTextureUsage.COPY_SRC}):null;
  if(c.compose)context.configure({device,format,alphaMode:'opaque',usage:usage|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});
  const msaa=c.aa?device.createTexture({size:[canvas.width,canvas.height],format,usage,sampleCount:4}):null;
  const module=device.createShaderModule({code:'@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{var p=array<vec2f,3>(vec2f(-.7,-.7),vec2f(.7,-.7),vec2f(0,.7));return vec4f(p[i],0,1);}@fragment fn fs()->@location(0) vec4f{return vec4f(1.,.439,.149,1.);}'});
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format}]},multisample:{count:c.aa?4:1}});
  return {async verifyOffscreen(){
    this.render();
    const buf=device.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    try{
      const enc=device.createCommandEncoder();
      enc.copyTextureToBuffer({texture:target,origin:[canvas.width>>1,canvas.height>>1]},{buffer:buf,bytesPerRow:256},[1,1]);
      device.queue.submit([enc.finish()]);await buf.mapAsync(GPUMapMode.READ);
      const pixel=Array.from(new Uint8Array(buf.getMappedRange(),0,4));
      const red=format.startsWith('bgra')?pixel[2]:pixel[0];
      if(red<200||pixel[1]<80||pixel[1]>150)throw Error('Offscreen triangle check failed: '+pixel);
      return {status:'PASS',pixel,format,scope:'Untimed readback of the measured target'};
    }finally{buf.destroy();}
  },info:{adapter:{vendor:adapter.info?.vendor,architecture:adapter.info?.architecture,device:adapter.info?.device,description:adapter.info?.description},timestampSupport:adapter.features.has('timestamp-query'),gpuTiming:'Not measured in raw path'},render(){const view=(target??context.getCurrentTexture()).createView(),encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:msaa?msaa.createView():view,resolveTarget:msaa?view:undefined,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});pass.setPipeline(pipeline);pass.draw(3);pass.end();if(c.compose)encoder.copyTextureToTexture({texture:target},{texture:context.getCurrentTexture()},[canvas.width,canvas.height]);device.queue.submit([encoder.finish()]);},dispose(){target?.destroy();msaa?.destroy();context?.unconfigure();device.destroy();}};
}
async function three(canvas,c) {
  const T=await import(sources[c.kind]);
  const renderer=c.kind==='three-gl'?new T.WebGLRenderer({canvas,antialias:c.aa,alpha:false}):new T.WebGPURenderer({canvas,antialias:c.aa,forceWebGL:false,powerPreference:c.power,trackTimestamp:c.timestamp});
  const resizeCounts={setSize:0,setPixelRatio:0};
  for(const method of ['setSize','setPixelRatio']){
    const original=renderer[method].bind(renderer);
    renderer[method]=(...args)=>{resizeCounts[method]++;return original(...args);};
  }
  try {
    if(c.kind!=='three-gl'){await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Unexpected WebGL fallback');}
    renderer.setPixelRatio(1);renderer.setSize(canvas.width,canvas.height,false);
    const mesh=triangle(T),target=(c.offscreen||c.compose)?new T.RenderTarget(canvas.width,canvas.height):null;
    if(target){target.samples=c.aa?4:0;renderer.setRenderTarget(target);}
    const composition=c.compose?new T.QuadMesh(new T.MeshBasicMaterial({map:target.texture,depthTest:false,depthWrite:false,toneMapped:false})):null;
    const adapter=renderer.backend?.device?.adapterInfo;
    return {async verify(){
      const probe=target??new T.RenderTarget(32,32);
      try {
        renderer.setRenderTarget(probe);
        renderer.render(mesh.scene,mesh.camera);
        const pixels=await renderer.readRenderTargetPixelsAsync(probe,probe.width>>1,probe.height>>1,1,1);
        const visible=pixels[0]>100&&pixels[0]>pixels[2]*1.5&&pixels[3]>200;
        if(!visible)throw Error('Triangle center pixel validation failed: '+Array.from(pixels));
        return {status:'PASS',centerPixel:Array.from(pixels),scope:'One untimed offscreen readback validates triangle output; native presentation is not independently verified'};
      }finally{renderer.setRenderTarget(target);if(probe!==target)probe.dispose();}
    },info:{revision:T.REVISION,adapter:adapter?{vendor:adapter.vendor,architecture:adapter.architecture,device:adapter.device,description:adapter.description}:null,timestampRequested:c.timestamp,gpuTiming:'Tracking overhead only; GPU duration not resolved in this case',resizeCounts},render(){if(composition)renderer.setRenderTarget(target);renderer.render(mesh.scene,mesh.camera);if(composition){renderer.setRenderTarget(null);composition.render(renderer);}},async dispose(){if(renderer.backend?.device)await renderer.backend.device.queue.onSubmittedWorkDone().catch(()=>{});mesh.dispose();composition?.material.dispose();target?.dispose();renderer.dispose();}};
  }catch(error){renderer.dispose();throw error;}
}
async function visibleTriangle(canvas,webgpu){
  let center,corner;
  if(webgpu){
    [center,corner]=await sampleCanvasTexture(canvas);
  }else{
  const probe=document.createElement('canvas');probe.width=probe.height=16;
  const ctx=probe.getContext('2d');ctx.drawImage(canvas,0,0,16,16);
  center=Array.from(ctx.getImageData(8,8,1,1).data);corner=Array.from(ctx.getImageData(0,0,1,1).data);
  }
  if(center[0]<100||center[0]<center[2]*1.5||corner[0]>32)throw Error('Canvas triangle check failed: '+center+' / '+corner);
  return {status:'PASS',center,corner,scope:'Untimed canvas-content check before compositing'};
}
if(!laboratoryAvailable){
  for(const value of ['application','all'])$('group').querySelector('option[value="'+value+'"]').disabled=true;
  $('status').textContent='Portable independent tests ready. Use the checkout for the two laboratory cases.';
}
$('run').onclick=async()=>{
  if(!$('buffer-width').checkValidity()||!$('buffer-height').checkValidity()){ $('status').textContent='Enter valid drawing-buffer dimensions';return; }
  $('run').disabled=true;$('save').disabled=true;$('results').replaceChildren();
  report={schema:2,latestThree:latest,browser:navigator.userAgent,dpr:devicePixelRatio,screen:{width:screen.width,height:screen.height},records:[],limitations:['Raw WebGPU GPU timestamps are not measured. Three timestamp variants measure tracking overhead only. Native hardware conclusions require the exported target-device results.']};
  const group=$('group').value;
  report.selectedGroup=group;
  const cases=[{kind:'cadence',size:[640,360]}];
  for(const kind of ['native-gl','native-gpu','three-gl','three-gpu','three-new']){
    const gpu=!kind.endsWith('-gl');
    for(const size of [[640,360],[1280,720],[Number($('buffer-width').value),Number($('buffer-height').value)]])for(const aa of [false,true])for(const offscreen of (gpu?[false,true]:[false]))for(const power of (gpu?[undefined,'high-performance']:[undefined]))for(const timestamp of (kind.startsWith('three-')&&gpu?[false,true]:[false]))cases.push({kind,size,aa,offscreen,power,timestamp});
  }
  if(new URLSearchParams(location.search).has('verify'))cases.splice(0,cases.length,...cases.filter(c=>c.kind==='three-gpu'||c.kind==='three-new'));
  if(!new URLSearchParams(location.search).has('verify')){
    const size=[Number($('buffer-width').value),Number($('buffer-height').value)];
    for(const offscreen of [false,true])cases.push({kind:'app-minimal',size,aa:true,offscreen},{kind:'app-full',size,aa:true,offscreen});
  }
  if(new URLSearchParams(location.search).has('appverify'))cases.splice(0,cases.length,...cases.filter(c=>c.kind.startsWith('app-')));
  const smoke = new URLSearchParams(location.search).get('smoke');
  if(smoke==='gpu')cases.splice(0,cases.length,...cases.filter(c=>c.kind==='native-gpu').slice(0,2));
  else if(smoke!==null)cases.splice(5);
  const groupFor = kind => ({
    cadence:'cadence','native-gl':'native','native-gpu':'native',
    'three-gl':'r180','three-gpu':'r180','three-new':'r187',
    'app-minimal':'application','app-full':'application',
  })[kind];
  const query=new URLSearchParams(location.search);
  if(!['verify','appverify','smoke'].some(key=>query.has(key))&&group!=='all'){
    let selected=group==='paired'
      ? cases.filter(c=>['three-gpu','three-new'].includes(c.kind)&&c.aa&&!c.offscreen&&!c.timestamp&&c.power==='high-performance'&&c.size[0]===Number($('buffer-width').value)&&c.size[1]===Number($('buffer-height').value))
      : cases.filter(c=>groupFor(c.kind)===group);
    if(group==='paired')selected=[...new Map(selected.map(c=>[c.kind,c])).values()];
    cases.splice(0,cases.length,...new Set([cases[0],...selected]));
  }
  if(group==='presentation'&&!['verify','appverify','smoke'].some(key=>query.has(key))){
    const size=[Number($('buffer-width').value),Number($('buffer-height').value)];
    cases.splice(0,cases.length,{kind:'cadence',size});
    for(const kind of ['native-gpu','three-gpu','three-new']){
      for(const path of ['direct','offscreen','compose']){
        cases.push({kind,size,aa:true,power:'high-performance',timestamp:false,offscreen:path==='offscreen',compose:path==='compose',path});
      }
    }
    if(laboratoryAvailable)for(const kind of ['app-minimal','app-full'])cases.push({kind,size,aa:true,offscreen:false});
  }
  const required=new Set(cases.map(c=>c.kind).filter(kind=>sources[kind]));
  if(cases.some(c=>c.kind.startsWith('app-')))required.add('three-gpu');
  report.preflight={};
  report.timeOrigin=performance.timeOrigin;
  try{
    for(const kind of required){
      const T=await import(sources[kind]);
      if(String(T.REVISION)!==(kind==='three-new'?'187':'180'))throw Error('Unexpected Three revision '+T.REVISION);
      report.preflight[kind]={revision:T.REVISION,url:new URL(sources[kind],import.meta.url).href};
    }
  }catch(error){
    report.preflightError=error.message;
    $('status').textContent='Dependency check failed before timing: '+error.message;
    $('save').disabled=false;$('run').disabled=false;return;
  }
  const expected={};
  for(const c of cases){
    const key=groupFor(c.kind);
    expected[key]=(expected[key]??0)+1;
  }
  for(const c of cases) {
    const canvas=document.createElement('canvas');canvas.width=c.size[0];canvas.height=c.size[1];$('surface').replaceChildren(canvas);
    if(group==='presentation'){
      const ratio=Math.min(devicePixelRatio,1.5);
      canvas.style.cssText='width:'+Math.round(c.size[0]/ratio)+'px;height:'+Math.round(c.size[1]/ratio)+'px;max-width:none';
    }
    let backend;
    const record={configuration:c,drawingBuffer:c.size,pixelRatio:1,cssSize:[canvas.clientWidth,canvas.clientHeight]};
    const traceLabel='VD '+(report.records.length+1)+' '+c.kind+' '+(c.path??(c.offscreen?'offscreen':'direct'));
    performance.mark(traceLabel+' begin');
    $('status').textContent=(report.records.length+1)+' / '+cases.length+' · '+c.kind;
    try {
      if(c.kind.startsWith('app-')){
        Object.assign(record,await applicationCase($('surface'),c));
        const rows=record.applicationReport.raw;
        record.measurement={interval:stats(rows.map(r=>r.interval)),cpuSubmission:stats(rows.map(r=>r.webgl)),rawIntervals:rows.map(r=>r.interval),scope:'Application report uses actual render-submission CPU wall duration. Presentation events unmeasured.'};
      }
      else if(c.kind==='cadence'){canvas.remove();record.measurement=await sample(()=>{});}
      else {
        if(c.kind==='native-gl')backend=await nativeGL(canvas,c);
        else if(c.kind==='native-gpu')backend=await nativeGPU(canvas,c);
        else backend=await three(canvas,c);
        record.info=backend.info;
        if(backend.verify)record.validation=await backend.verify();
        if(!c.offscreen){backend.render();record.validation=await visibleTriangle(canvas,!c.kind.endsWith('-gl'));}
        else if(backend.verifyOffscreen)record.validation=await backend.verifyOffscreen();
        if(!c.offscreen&&!c.kind.endsWith('-gl')){
          const {format,alphaMode,usage,colorSpace}=canvas.getContext('webgpu').getConfiguration();
          record.canvasConfiguration={format,alphaMode,usage,colorSpace};
        }
        performance.mark(traceLabel+' timing start');
        record.measurement=await sample(backend.render);
        performance.mark(traceLabel+' timing end');
      }
    }catch(error){record.error=error.message;}
    finally{
      try{if(backend)await backend.dispose();}catch(error){record.error??='Cleanup: '+error.message;}
      canvas.remove();
    }
    performance.mark(traceLabel+' end');
    record.traceLabel=traceLabel;
    record.group=groupFor(c.kind);
    record.validationStatus=record.error?'failed':record.validation?.status==='PASS'?'passed':'timed-without-pixel-check';
    report.records.push(record);
    const row=document.createElement('tr');
    for(const text of [c.kind+' '+(c.path??(c.offscreen?'offscreen':'')),record.measurement?.interval.fps.toFixed(1)??record.error,record.measurement?.interval.p99.toFixed(2)??'—',record.measurement?.cpuSubmission.mean.toFixed(3)??'—']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
    $('results').append(row);
    if(document.hidden)break;
  }
  report.groups=Object.fromEntries(Object.entries(expected).map(([group,count])=>{
    const records=report.records.filter(record=>record.group===group);
    const failed=records.filter(record=>record.error).length;
    const validated=records.filter(record=>record.validationStatus==='passed').length;
    const status=records.length<count?'incomplete':failed?'failed':validated===count?'passed':'completed';
    return [group,{status,expected:count,recorded:records.length,failed,validated}];
  }));
  $('status').textContent=Object.entries(report.groups).map(([group,result])=>group+': '+result.status+' ('+result.recorded+'/'+result.expected+')').join(' · ')+' — '+report.records.filter(r=>!r.error).length+' successful / '+report.records.length+' cases';
  $('save').disabled=false;$('run').disabled=false;
};
$('save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gpu-isolation-'+report.selectedGroup+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
