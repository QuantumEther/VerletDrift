import { LabClock, settingsFrom, IMPACT_TIME, DURATION } from './scene.js';
import { SplashRenderer } from './renderer.js';
const get=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
let settings=settingsFrom(Object.fromEntries(query));
const clock=new LabClock();
if(query.has('time'))clock.seek(Number(query.get('time')));
if(query.get('paused')==='1')clock.playing=false;
let dirty=true,lastUi=0,raf=0;
const renderer=new SplashRenderer(get('splash'),message=>{
  get('failure').hidden=false;get('failure').textContent=`WebGPU renderer stopped.\n${message}\n\nYour simulator is unaffected. On hybrid Linux systems, use the proven NVIDIA/PRIME/X11 browser configuration or try ?gpuPower=low-power.`;
  get('loading').hidden=true;get('backend').textContent='WebGPU unavailable';clock.playing=false;cancelAnimationFrame(raf);
});
function updateControls(){
  for(const key of ['speed','volume','breakup','concentration','seed','quality'])get(key).value=settings[key];
  get('speed-value').textContent=`${settings.speed} m/s`;get('volume-value').textContent=`${settings.volume} L`;
  get('breakup-value').textContent=`${settings.breakup.toFixed(2)}×`;get('concentration-value').textContent=`${settings.concentration.toFixed(2)}×`;
  get('seed-label').textContent=`SEED ${settings.seed}`;
}
function updateUi(now=0){
  get('pause').textContent=clock.playing?'Pause':'Play';get('timeline').value=clock.time;get('time-value').textContent=`${clock.time.toFixed(2)} s`;
  const age=clock.time-IMPACT_TIME;
  get('phase').textContent=age<0?'APPROACH':age<.18?'RUPTURE':age<.8?'MEMBRANE EXPANSION':age<1.8?'FILAMENT BREAKUP':'DROPLET SETTLEMENT';
  if(now-lastUi>250){
    const s=renderer.getStats();const ms=value=>value===null?'—':value.toFixed(2);
    get('backend').textContent=`${s.adapter?.vendor||'WebGPU'} ${s.adapter?.architecture||''} · ${s.quality||settings.quality}${s.adapter?.isFallbackAdapter?' · SOFTWARE ADAPTER':''}`;
    get('timing').textContent=`CPU encode ${ms(s.cpuEncodeMs)} ms · ${s.gpuTimingSupported?`GPU scene ${ms(s.sceneGpuMs)} / splash ${ms(s.splashGpuMs)} ms`:'GPU timestamps unavailable'}`;
    lastUi=now;
  }
}
for(const key of ['speed','volume','breakup','concentration','seed','quality'])get(key).addEventListener('input',()=>{
  settings=settingsFrom({...settings,[key]:get(key).value});updateControls();dirty=true;
});
get('replay').onclick=()=>{clock.replay();dirty=true;};
get('pause').onclick=()=>{clock.toggle();dirty=true;};
get('timeline').oninput=()=>{clock.seek(Number(get('timeline').value));dirty=true;updateUi();};
get('rate').onchange=()=>{clock.rate=Number(get('rate').value);clock.last=null;};
get('new-seed').onclick=()=>{settings=settingsFrom({...settings,seed:(settings.seed*1664525+1013904223)%1000000});updateControls();clock.replay();dirty=true;};
new ResizeObserver(()=>{dirty=true;}).observe(get('splash'));
document.addEventListener('visibilitychange',()=>{clock.last=null;});
function frame(now){
  if(!renderer.ready)return;
  const wasPlaying=clock.playing;if(!document.hidden)clock.tick(now);else clock.last=null;
  if(!document.hidden&&(wasPlaying||dirty)){renderer.render(clock.time,settings);dirty=false;}
  updateUi(now);raf=requestAnimationFrame(frame);
}
updateControls();updateUi();
const ready=renderer.init().then(ok=>{get('loading').hidden=true;if(ok)raf=requestAnimationFrame(frame);return ok;});
// Deliberately public inspection/replay API for this isolated experiment.
window.splashLab=Object.freeze({ready,renderer,clock,getSettings:()=>({...settings}),seek:time=>{clock.seek(time);dirty=true;updateUi();},replay:()=>{clock.replay();dirty=true;},duration:DURATION});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);renderer.dispose();});

window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
