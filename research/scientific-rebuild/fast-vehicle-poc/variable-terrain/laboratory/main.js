import {createLaboratory,advance,presentation,capture} from './adapter.js';
import {bindControls} from './controls.js';import {createView3D} from './view3d.js';
import {SimulationClock} from '../../../procedural-terrain/src/clock.js';
import {createInstrument} from '../../../procedural-terrain/src/instruments.js';
import {TireObservatory} from '../../../tire-road-observatory-prototype/src/tracks.js';
import {drawFrictionCircles} from '../../../tire-road-observatory-prototype/src/observatory-panel.js';
import {setEnvironment} from '../../../procedural-terrain/src/application-vehicle.js';
const $=id=>document.getElementById(id),clock=new SimulationClock({budgetMs:20,maxSteps:128,maxDebt:Infinity}),observatory=new TireObservatory();
let lab,view,previous,last=performance.now(),paused=false,lastPanel=0,renderMs=0,lastPhysicsMs=0,totalPhysicsMs=0,stepTimes=[],maxIterations=0,attemptedInput=null;
let measurement=null,report=null,framePhysics=0,frameRecording=0,previousFrame=null;
function diagnosticSettings(){return {mode:$('diag-mode').value,terrain:$('diag-terrain').checked,vehicle:$('diag-vehicle').checked,lighting:$('diag-lighting').checked,tracks:$('diag-tracks').checked,other:$('diag-other').checked,gpu:$('diag-gpu').checked,submission:$('diag-submit').checked,scene:$('diag-scene').checked,dashboard:$('diag-panel').checked,paused,environment:lab.terrain.settings,canvas:view.contextInfo(),camera:$('camera').value,marks:$('show-marks').checked,vectors:$('contact-overlay').checked,xray:$('xray').checked,recording:$('record-contacts').checked};}
$('diag-start').onclick=()=>{view.clearGpu();measurement={start:performance.now(),settings:diagnosticSettings(),frames:[],gpu:[],gpuEpoch:view.gpuStatus().epoch,gpuInvalid:false,changed:false,hidden:false};previousFrame=null;$('diag-output').textContent='Measuring…';};
$('diag-download').onclick=()=>{if(!report)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));a.download='frame-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
function summarize(values){const sorted=values.slice().sort((a,b)=>a-b),n=sorted.length;return {median:n?sorted[Math.floor((n-1)/2)]:0,mean:n?values.reduce((a,b)=>a+b,0)/n:0,p95:sorted[Math.max(0,Math.ceil(n*.95)-1)]??0,p99:sorted[Math.max(0,Math.ceil(n*.99)-1)]??0};}
const gauges={engine:createInstrument($('engine-dial'),{label:'ENGINE',unit:'rpm',max:3000}),input:createInstrument($('input-dial'),{label:'FIXED GEAR INPUT',unit:'rpm',max:3000}),speed:createInstrument($('speed-dial'),{label:'ROAD SPEED',unit:'km/h',max:60})};
const controls=bindControls(document,()=>reset());
function reset(speed=0){
 try{
  const settings={preset:$('terrain').value,seed:Number($('terrain-seed').value),amplitude:Number($('terrain-amplitude').value),roughness:Number($('terrain-roughness').value)},next=createLaboratory(settings,{speed});
  // The old track mesh reads this presentation-only sampler singleton; it is
  // configured identically, but no legacy vehicle is created or stepped.
  if(['flat','hills','rough','road'].includes(settings.preset))setEnvironment(settings);view?.dispose();view=createView3D($('perspective'),next.terrain,$('render-scale').value);view.resetCamera($('camera').value);lab=next;previous=capture(lab);observatory.clear();controls.reset();view.draw(presentation(lab),observatory);clock.reset();last=performance.now();stepTimes=[];totalPhysicsMs=0;maxIterations=0;$('warning').textContent='';lastPanel=-Infinity;
 }catch(e){clock.fail(e,lab?.state??null);$('warning').textContent=e.message;}
}
for(const id of ['regenerate','rest'])$(id).addEventListener('click',()=>reset());$('coast').addEventListener('click',()=>reset(3));$('terrain').addEventListener('change',()=>{const isAuthored=['mountain','yard','rally'].includes($('terrain').value);for(const id of ['terrain-seed','terrain-amplitude','terrain-roughness'])$(id).disabled=isAuthored;reset();});
$('pause').addEventListener('click',()=>{paused=!paused;controls.clear();$('pause').textContent=paused?'Resume':'Pause';});
$('record-contacts').addEventListener('change',()=>observatory.breakContinuity());
$('render-scale').addEventListener('change',()=>view?.setQuality($('render-scale').value));
$('camera').addEventListener('change',()=>view?.resetCamera($('camera').value));$('reset-camera').addEventListener('click',()=>view?.resetCamera());$('clear-tracks').addEventListener('click',()=>{observatory.clear();previous=capture(lab);});
for(const key of ['throttle','engagement'])$(key).addEventListener('input',()=>$(key+'-value').textContent=Math.round(100*$(key).value)+'%');for(const b of document.querySelectorAll('[data-clutch]'))b.addEventListener('click',()=>{$('engagement').value=b.dataset.clutch;$('engagement').dispatchEvent(new Event('input'));});
document.addEventListener('visibilitychange',()=>{if(measurement&&document.hidden)measurement.hidden=true;controls.clear();const now=performance.now();clock.pausedWall+=Math.max(0,(now-last)/1000);clock.wall+=Math.max(0,(now-last)/1000);last=now;});
function physicalStep(h){
 const input=controls.sample(h);attemptedInput={...input};const begin=performance.now();advance(lab,input,h);lastPhysicsMs=performance.now()-begin;framePhysics+=lastPhysicsMs;totalPhysicsMs+=lastPhysicsMs;stepTimes.push(lastPhysicsMs);if(stepTimes.length>1000)stepTimes.shift();maxIterations=Math.max(maxIterations,lab.state.consistency.iterations);
 const recordStart=performance.now(),end=capture(lab,h);if($('record-contacts')?.checked!==false)observatory.record({start:previous,end,h});previous=end;frameRecording+=performance.now()-recordStart;return {};
}
function panel(p){
 const sorted=stepTimes.slice().sort((a,b)=>a-b),q=f=>sorted[Math.max(0,Math.ceil(sorted.length*f)-1)]??0,mean=stepTimes.reduce((a,x)=>a+x,0)/(stepTimes.length||1),s=lab.state.consistency;
 $('live-performance').textContent=`Physics ${clock.frequency} Hz · ${clock.stepsPerSecond.toFixed(0)} accepted steps/wall s · sim speed ${clock.realtimeRatio.toFixed(2)}× · ${clock.fps.toFixed(1)} FPS\nPhysics JS elapsed (CPU proxy) ${mean.toFixed(3)} ms/step · p95 ${q(.95).toFixed(3)} · p99 ${q(.99).toFixed(3)} ms · ${(lab.state.time?totalPhysicsMs/lab.state.time:0).toFixed(1)} ms/sim s · render ${renderMs.toFixed(2)} ms\nConvergence ${s?.iterations??0}/${maxIterations} last/max of 24 · force residual ${(s?.forceResidual??0).toExponential(2)} N · debt ${clock.debt.toFixed(3)} s · rejected ${clock.rejected}`;
 $('clock-status').textContent=`${clock.status} · ${lab.state.time.toFixed(3)} sim s / ${clock.wall.toFixed(2)} wall s · no dropped debt`;
 gauges.engine(p.engineOmega*60/(2*Math.PI));gauges.input(1.75*(p.wheels[2].omega+p.wheels[3].omega)*60/(2*Math.PI));gauges.speed(Math.hypot(p.planar.u,p.planar.v)*3.6);
 $('clutch-reading').textContent=`Clutch ${p.clutch} · heat ${p.heat.clutch.toFixed(2)} J\nBrake heat ${p.heat.brakes.toFixed(2)} J`;
 $('energy-reading').textContent=`E ${p.energy.toFixed(3)} J\nWork residual ${p.energyResidual.toExponential(3)} J\nYaw ${(p.planar.heading*180/Math.PI).toFixed(1)}°\nSteer ${(lab.steer*180/Math.PI).toFixed(1)}°`;
 $('contacts').replaceChildren(...p.wheels.map(w=>{const tr=document.createElement('tr');for(const value of [w.name,...[w.omega,w.normal,w.fx,w.fy,w.slipX,w.slipY,w.compression,w.mu].map(x=>x.toFixed(3)),w.mode]){const td=document.createElement('td');td.textContent=value;tr.append(td);}return tr;}));drawFrictionCircles($('friction-circles'),observatory.latest);
 if(clock.fault)$('warning').textContent=`PAUSED: ${clock.fault.message}. Last accepted state retained; reset to retry. Snapshot available via runtimeSnapshot().clock.fault.`;
}
function loop(now){
 const frameStart=performance.now(),interval=previousFrame===null?null:now-previousFrame;previousFrame=now;framePhysics=frameRecording=0;
 const elapsed=(now-last)/1000;last=now;clock.frame(elapsed,physicalStep,()=>({state:lab?.state,angles:lab?.angles,input:attemptedInput??lab?.lastInput,terrain:lab?.terrain.settings}),paused||document.hidden);
 let conversion=0,dashboard=0,stages={scene:0,tracks:0,webgl:0};const diag={mode:$('diag-mode').value,terrain:$('diag-terrain').checked,vehicle:$('diag-vehicle').checked,lighting:$('diag-lighting').checked,tracks:$('diag-tracks').checked,other:$('diag-other').checked,gpu:$('diag-gpu').checked};if(measurement&&JSON.stringify(diagnosticSettings())!==JSON.stringify(measurement.settings))measurement.changed=true;if(measurement&&document.hidden)measurement.hidden=true;
 if(lab&&view){try{let begin=performance.now();const p=presentation(lab);conversion=performance.now()-begin;begin=performance.now();view.draw(p,observatory,{marks:$('show-marks').checked,vectors:$('contact-overlay').checked,xray:$('xray').checked,sceneUpdates:$('diag-scene').checked,submission:$('diag-submit').checked,timings:stages,diagnostic:diag,frameId:measurement?.frames.length??0,gpuTiming:!!measurement&&diag.gpu});renderMs=performance.now()-begin;if($('diag-panel').checked&&now-lastPanel>=200){begin=performance.now();panel(p);dashboard=performance.now()-begin;lastPanel=now;}}catch(e){clock.fail(e,lab.state);$('warning').textContent=e.message;}}
 if(measurement){
  const gpuSamples=diag.gpu?view.pollGpu():[];if(view.gpuStatus().epoch!==measurement.gpuEpoch){measurement.gpuInvalid=true;measurement.gpu=[];measurement.gpuEpoch=view.gpuStatus().epoch;}measurement.gpu.push(...gpuSamples);measurement.frames.push({interval,physics:framePhysics,recording:frameRecording,conversion,scene:stages.scene,tracks:stages.tracks,webgl:stages.webgl,dashboard,callback:performance.now()-frameStart,steps:clock.frameSteps});
  if(performance.now()-measurement.start>=10000){const rows=measurement.frames.filter(f=>f.interval!==null),keys=['interval','physics','recording','conversion','scene','tracks','webgl','dashboard','callback'],gpu=view.gpuStatus(),mean=rows.reduce((a,f)=>a+f.interval,0)/rows.length;report={settings:measurement.settings,settingsChanged:measurement.changed,hiddenDuringRun:measurement.hidden,backend:view.snapshot().backend,userAgent:navigator.userAgent,visibility:document.visibilityState,frames:rows.length,meanFps:1000/mean,estimatedMissedRefreshes:rows.reduce((a,f)=>a+Math.max(0,Math.round(f.interval/(1000/240))-1),0),refreshAssumptionHz:240,estimatedDroppedPercent:100*rows.reduce((a,f)=>a+Math.max(0,Math.round(f.interval/(1000/240))-1),0)/(rows.length+rows.reduce((a,f)=>a+Math.max(0,Math.round(f.interval/(1000/240))-1),0)),stats:Object.fromEntries(keys.map(k=>[k,summarize(rows.map(f=>f[k]))])),gpu:{...gpu,disjointDuringRun:measurement.gpuInvalid,samples:measurement.gpu.length,stats:!measurement.gpuInvalid&&measurement.gpu.length?summarize(measurement.gpu.map(x=>x.ms)):null,raw:measurement.gpu},raw:rows};$('diag-output').textContent=JSON.stringify({...report,raw:undefined,gpu:{...report.gpu,raw:undefined}},null,2);measurement=null;}
 }

 requestAnimationFrame(loop);
}
export const simulationSnapshot=()=>structuredClone(lab.state);
export const visualSnapshot=()=>structuredClone(presentation(lab));
export const rendererSnapshot=()=>view.snapshot();
export const runtimeSnapshot=()=>({clock:{...clock},physicsMs:totalPhysicsMs,lastPhysicsMs,renderMs,maxIterations,held:controls.held(),tracks:observatory.stats(),terrain:{...lab.terrain.settings}});
reset();requestAnimationFrame(loop);
