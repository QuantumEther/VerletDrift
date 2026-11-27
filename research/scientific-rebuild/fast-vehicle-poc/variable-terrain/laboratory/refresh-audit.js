const find = id => document.getElementById(id);
let result;
function distribution(values) {
  const sorted = values.toSorted((a,b)=>a-b);
  const percentile = p => sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)] ?? null;
  const mean = values.reduce((sum,value)=>sum+value,0)/values.length;
  const slow = sorted.slice(-Math.max(1,Math.ceil(sorted.length*.01)));
  const histogram = Object.fromEntries([4.5,8.5,12.5,16.8,33.5,Infinity].map(bound=>[String(bound),0]));
  for(const value of values) {
    const bound = Object.keys(histogram).find(key=>value<=Number(key));
    histogram[bound]++;
  }
  return {callbacks:values.length,mean,median:percentile(.5),p95:percentile(.95),p99:percentile(.99),p999:percentile(.999),maximum:sorted.at(-1),meanFps:1000/mean,onePercentLowFps:1000/(slow.reduce((s,x)=>s+x,0)/slow.length),histogramUpperBoundsMs:histogram,rawIntervals:values};
}
async function cadence(duration) {
  const values=[];let last=null;
  const start=performance.now();
  await new Promise(resolve=>{
    function frame(now) {
      if(last!==null)values.push(now-last);
      last=now;
      if(now-start<duration)requestAnimationFrame(frame);else resolve();
    }
    requestAnimationFrame(frame);
  });
  return distribution(values);
}
find('run').onclick=async()=>{
  find('run').disabled=true;find('save').disabled=true;
  try {
    find('lab').src='about:blank';
    find('status').textContent='Measuring empty-page requestAnimationFrame cadence…';
    result={schema:1,date:new Date().toISOString(),browser:navigator.userAgent,screen:{width:screen.width,height:screen.height,dpr:devicePixelRatio},scope:'Animation callbacks and CPU wall timing. GPU render batches and presentation events are distinct.',cadence:await cadence(5000)};
    const url=new URL('./index.html',location.href);
    url.searchParams.set('backend',find('backend').value);
    if(find('layout').value)url.searchParams.set('layout','legacy');
    const frame=find('lab');frame.src=url.href;
    await new Promise((resolve,reject)=>{
      const deadline=performance.now()+90000;
      const timer=setInterval(()=>{
        if(performance.now()>deadline){clearInterval(timer);reject(Error('Laboratory initialization timeout'));return;}
        try {if(frame.contentDocument?.querySelector('#diag-audit')){clearInterval(timer);resolve();}}catch{}
      },100);
    });
    const app=await frame.contentWindow.eval("import('./main.js')");
    await new Promise((resolve,reject)=>{
      const deadline=performance.now()+90000;
      const timer=setInterval(()=>{
        try {const state=app.rendererSnapshot();if(state.assetStatus!=='loading'){clearInterval(timer);resolve();}}catch{}
        if(performance.now()>deadline){clearInterval(timer);reject(Error('Renderer/model initialization timeout'));}
      },100);
    });
    result.renderer=app.rendererSnapshot();
    find('status').textContent='Running paused identical-state rendering matrix…';
    result.audit=await app.runPerformanceAudit({durationMs:3000,warmupMs:1000});
    for(const record of result.audit.records) {
      record.intervals=distribution(record.report.raw.map(row=>row.interval).filter(Number.isFinite));
    }
    result.finalRuntime=app.runtimeSnapshot();
    find('status').textContent=JSON.stringify({cadence:result.cadence.meanFps,backend:result.renderer.activeBackend,cases:result.audit.records.map(r=>({name:r.mode,fps:r.intervals.meanFps,p99:r.intervals.p99}))},null,2);
  }catch(error){result??={};result.error=error.message;find('status').textContent=error.message;}
  finally{find('run').disabled=false;find('save').disabled=false;}
};
find('save').onclick=()=>{
 const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='refresh-hardware-audit.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
