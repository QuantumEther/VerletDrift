export async function applicationCase(container, configuration) {
  const frame=document.createElement('iframe');
  frame.title='VerletDrift WebGPU comparison';
  frame.style.cssText='width:100%;height:900px;border:0';
  container.replaceChildren(frame);
  frame.src=new URL('../index.html?backend=webgpu'+(configuration.offscreen?'&presentation=offscreen':''),import.meta.url).href;
  async function wait(predicate,timeout=90000){
    const deadline=performance.now()+timeout;
    while(performance.now()<deadline){
      try{const value=predicate();if(value)return value;}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Application comparison timed out');
  }
  try{
    await wait(()=>frame.contentDocument?.getElementById('pause'));
    const app=await frame.contentWindow.eval('import('+JSON.stringify(new URL('../main.js',import.meta.url).href)+')');
    await wait(()=>app.rendererSnapshot().activeBackend==='webgpu'&&app.rendererSnapshot().assetStatus==='ready'&&app.rendererSnapshot().graphics.status==='ready');
    const d=frame.contentDocument;
    if(d.getElementById('pause').textContent!=='Resume')d.getElementById('pause').click();
    const canvas=d.getElementById('perspective');
    const scale=d.getElementById('render-scale');
    scale.value='1';scale.dispatchEvent(new Event('change'));
    const ratio=Math.min(frame.contentWindow.devicePixelRatio,1.5);
    canvas.style.setProperty('width',(configuration.size[0]/ratio+.01)+'px','important');
    canvas.style.setProperty('height',(configuration.size[1]/ratio+.01)+'px','important');
    const mode=d.getElementById('diag-mode');
    mode.value=configuration.kind==='app-minimal'?'minimal':'full';
    const duration=d.getElementById('diag-duration');
    duration.add(new Option('Benchmark 3 seconds','3'));duration.value='3';
    await new Promise(resolve=>setTimeout(resolve,1500));
    const probe=d.createElement('canvas');probe.width=32;probe.height=32;
    const context=probe.getContext('2d');
    context.drawImage(canvas,0,0,32,32);
    const pixels=configuration.offscreen?(await app.rendererReadback()).pixels:context.getImageData(0,0,32,32).data;
    const colors=new Set();
    for(let i=0;i<pixels.length;i+=4*Math.max(1,Math.floor(pixels.length/16384)))colors.add(pixels[i]+','+pixels[i+1]+','+pixels[i+2]);
    if(colors.size<2)throw Error('Application rendered-output validation failed');
    const before=app.rendererSnapshot();
    if(canvas.width!==configuration.size[0]||canvas.height!==configuration.size[1])throw Error('Application drawing buffer mismatch: '+canvas.width+'x'+canvas.height);
    d.getElementById('diag-start').click();
    const report=await wait(()=>app.performanceReport(),30000);
    return {info:{...before,actualBuffer:[canvas.width,canvas.height],antialias:'Application default; verify context metadata in report',scene:configuration.kind},applicationReport:report,validation:{status:'PASS',scope:'Actual WebGPU backend and nonuniform canvas pixels verified before timing; screenshot review remains necessary',distinctProbeColors:colors.size}};
  }finally{frame.remove();}
}
