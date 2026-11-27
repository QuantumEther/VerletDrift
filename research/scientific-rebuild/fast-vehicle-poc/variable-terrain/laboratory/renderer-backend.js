// Renderer initialization only. No simulation imports, clocks or state changes.
export async function createRendererBackend(canvas,kind='webgl',{antialias=true}={}){
 if(!['webgl','webgpu'].includes(kind))throw Error(`Unknown renderer backend: ${kind}`);
 const THREE=await import('./vendor/three-r180/three.module.js');
 let renderer;
 if(kind==='webgpu'){
  const {WebGPURenderer}=await import('./vendor/three-r180/three.webgpu.js');
  renderer=new WebGPURenderer({canvas,antialias,forceWebGL:false,powerPreference:'high-performance',trackTimestamp:false});
  try{await renderer.init();if(!renderer.backend.isWebGPUBackend)throw Error('Requested WebGPU but a different backend initialized');}catch(error){renderer.dispose();throw error;}
 }else renderer=new THREE.WebGLRenderer({canvas,antialias});
 const resizeDiagnostics={setSizeCalls:0,setPixelRatioCalls:0,powerPreference:kind==='webgpu'?'high-performance':null};
 const setSize=renderer.setSize.bind(renderer),setPixelRatio=renderer.setPixelRatio.bind(renderer);
 renderer.setSize=(...args)=>{resizeDiagnostics.setSizeCalls++;return setSize(...args);};
 renderer.setPixelRatio=(...args)=>{resizeDiagnostics.setPixelRatioCalls++;return setPixelRatio(...args);};
 renderer.resizeDiagnostics=resizeDiagnostics;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
 let disposed=false;
 return {renderer,kind,async render(scene,camera){if(disposed)throw Error('Renderer disposed');if(kind==='webgpu')await renderer.renderAsync(scene,camera);else renderer.render(scene,camera);},info(){if(kind==='webgpu'){const device=renderer.backend.device;return {requested:kind,active:renderer.backend.isWebGPUBackend?'webgpu':'unexpected',revision:THREE.REVISION,powerPreference:'high-performance',adapter:device?.adapterInfo??null,drawCalls:renderer.info.render.drawCalls??renderer.info.render.calls,memory:{...renderer.info.memory}};}const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {requested:kind,active:'webgl',revision:THREE.REVISION,adapter:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawCalls:renderer.info.render.drawCalls??renderer.info.render.calls,memory:{...renderer.info.memory}};},dispose(){if(disposed)return;disposed=true;renderer.dispose();}};
}
