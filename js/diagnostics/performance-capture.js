import { getGPURenderStats } from '../gpu-renderer.js';
export const profilingEnabled = new URLSearchParams(globalThis.location?.search || '').get('gpuProfile') === '1';

export function distribution(values) {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!sorted.length) return null;
  const mean = sorted.reduce((a,b) => a+b,0) / sorted.length;
  const quantile = fraction => sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*fraction)-1)];
  return { samples: sorted.length, mean, median: quantile(.5), p95: quantile(.95),
    p99: quantile(.99), max: sorted.at(-1),
    standardDeviation: Math.sqrt(sorted.reduce((sum,x) => sum+(x-mean)**2,0)/sorted.length) };
}
export function recordPerformanceTick(ms) {
  if (capture && capture.tickMs.length < 15000) capture.tickMs.push(ms);
}
let capture = null, lastFrame = null, status, button;
function finish(reason = '30-second capture complete') {
  if (!capture) return;
  const report = capture;
  capture = null;
  report.endReason = reason;
  report.ended = new Date().toISOString();
  const field = key => distribution(report.frames.map(frame => frame[key]));
  report.summary = { frameCadenceMs: field('frameIntervalMs'), cpuFrameMs: field('cpuFrameMs'),
    cpuSimulationLoopMs: field('cpuSimulationLoopMs'), physicsTickMs: distribution(report.tickMs), cpuRenderMs: field('cpuRenderMs'),
    cpuGPUEncodeMs: field('cpuGPUEncodeMs'), uploadedBytesPerFrame: field('uploadedBytes'),
    gpuRenderMs: distribution(report.gpuSamples.map(s => s.renderMs)),
    gpuSmokeComputeMs: distribution(report.gpuSamples.map(s => s.computeMs)),
    droppedSubsteps: report.frames.reduce((sum,f) => sum+f.droppedSubsteps,0) };
  if (report.frames.length) {
    const worst = report.frames.map(f=>f.frameIntervalMs).sort((a,b)=>b-a)
      .slice(0,Math.max(1,Math.ceil(report.frames.length*.01)));
    report.summary.onePercentLowCadenceFps = 1000 / (worst.reduce((a,b)=>a+b,0)/worst.length);
  }
  delete report.startedMs; delete report.lastTimestampSample;
  report.finalRenderer = getGPURenderStats();
  const url = URL.createObjectURL(new Blob([JSON.stringify(report,null,2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download='verlet-performance.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  if (button) button.disabled=false;
  if (status) status.textContent=`${reason}. Report downloaded.`;
}
export function recordPerformanceFrame(timestampMs, intervalMs, cpuSimulationLoopMs, cpuRenderMs, cpuFrameMs, droppedSubsteps) {
  lastFrame = { frameIntervalMs: intervalMs, cpuSimulationLoopMs, cpuRenderMs, cpuFrameMs, droppedSubsteps };
  if (!capture) return;
  if (document.hidden) { finish('Stopped: tab became hidden'); return; }
  const stats = getGPURenderStats();
  if (stats.backend !== capture.initialRenderer.backend) {
    finish('Stopped: renderer changed'); return;
  }
  if (Number.isFinite(intervalMs) && intervalMs>0) capture.frames.push(lastFrame);
  Object.assign(lastFrame, { cpuGPUEncodeMs: stats.cpuEncodeMs,
    uploadedBytes: stats.uploadBytes, drawCalls: stats.drawCalls,
    smokeSlots: stats.smokeSlots ?? 0, computeWorkgroups: stats.computeWorkgroups,
    culledInstances: stats.culledInstances ?? 0 });
  if (stats.gpuTimestampSamples > capture.lastTimestampSample) {
    capture.gpuSamples.push({ elapsedMs: timestampMs-capture.startedMs,
      renderMs: stats.gpuRenderMs, computeMs: stats.gpuComputeMs });
    capture.lastTimestampSample=stats.gpuTimestampSamples;
  }
  if (timestampMs-capture.startedMs>=30000 || capture.frames.length>=15000) finish();
}
export function installPerformanceCapture() {
  if (!profilingEnabled) return;
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label','Optional renderer profiler');
  panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:10000;padding:12px;background:#111d26ee;color:#dce6ed;border:1px solid #65717c;max-width:340px;font:12px/1.5 monospace';
  button=document.createElement('button');button.textContent='Record 30s performance';
  status=document.createElement('div');status.textContent='Drive normally, then record. Keep the tab visible.';
  const close=document.createElement('button');close.textContent='Close';
  close.onclick=()=>{if(capture)finish('Stopped by user');panel.remove();clearInterval(timer);};
  button.onclick=()=>{
    const stats=getGPURenderStats();
    capture={ started:new Date().toISOString(), startedMs:performance.now(),
      lastTimestampSample:stats.gpuTimestampSamples, userAgent:navigator.userAgent,
      devicePixelRatio, canvas: {width: document.querySelector('#simCanvas').width, height: document.querySelector('#simCanvas').height}, initialRenderer:stats, frames:[], gpuSamples:[], tickMs:[],
      scope:'CPU frame is JS execution only. Simulation loop includes snapshots/bookkeeping. GPU timestamps separately measure world render and smoke compute, excluding Canvas, compositing, presentation and driver scheduling gaps. rAF cadence and its 1% low are not independently measured presented FPS. No synchronous GPU waits/readbacks are added by this capture.' };
    button.disabled=true;
  };
  panel.append(button,close,status);document.body.append(panel);
  const timer=setInterval(()=>{
    if(capture)status.textContent=`Recording… ${Math.round((performance.now()-capture.startedMs)/1000)}/30s`;
    else if(lastFrame) {
      const s=getGPURenderStats();
      const ms=x=>Number.isFinite(x)?`${x.toFixed(2)}ms`:'unavailable';
      status.textContent=`${s.backend} · CPU ${ms(lastFrame.cpuFrameMs)} · GPU render ${ms(s.gpuRenderMs)} · smoke compute ${ms(s.gpuComputeMs)}${s.gpuTimingEnabled?'':' · GPU timestamps unsupported'}`;
    }
  },500);
  document.addEventListener('visibilitychange',()=>{if(capture&&document.hidden)finish('Stopped: tab became hidden');});
}
