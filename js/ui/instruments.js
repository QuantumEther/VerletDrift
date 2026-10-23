import { updateCompactReadouts } from './workspace.js';
const elements = new Map();
function element(id) { if (!elements.has(id)) elements.set(id,document.getElementById(id)); return elements.get(id); }
let rpmSegments,gearLabels,lastUpdate=-Infinity;
const setText = (id, text) => { const el=element(id); if(el.textContent!==String(text))el.textContent=text; };
const signed = (value, decimals=2) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(decimals)}`;
function pill(id, text, tone='normal') { const el = element(id); el.textContent = text; el.dataset.tone = tone; }
function fillMeter(id, value, threshold=Infinity) {
 const el = element(id+'-fill');
 el.style.transform = `scaleX(${Math.max(0,Math.min(1,value))})`;
 el.dataset.tone = value >= threshold ? 'danger' : 'normal';
}
function movePointer(id, normalized) {
 element(id+'-pointer').style.left = `${Math.max(0,Math.min(1,normalized))*100}%`;
}
function renderInstruments(s) {
 updateCompactReadouts(s);
 setText('instrument-speed',Math.round(s.speed));
 setText('instrument-rpm',Math.round(s.rpm).toLocaleString('en-US'));
 setText('instrument-gear',s.requestedGear&&s.requestedGear!==s.gear?`${s.gear} → ${s.requestedGear}`:s.gear);
 gearLabels.forEach(el=>el.classList.toggle('active',el.dataset.gear===s.gear));
 const speedAngle = -30 + (s.speed / 400)*240;
 element('speed-needle').setAttribute('transform',`translate(150 143) rotate(${speedAngle})`);
 element('speed-progress').setAttribute('stroke-dashoffset',400-s.speed);
 element('speed-chart').setAttribute('aria-label',`Speed ${Math.round(s.speed)} kilometers per hour; scale 0 to 400`);
 rpmSegments.forEach((el,i)=>{el.classList.toggle('lit',s.rpm/250>i);el.classList.toggle('red-zone',i*250>=s.redlineRpm)});
 element('rpmRedlineNote').textContent=`Redline ${Math.round(s.redlineRpm).toLocaleString('en-US')} RPM · scale 0—10,000`;
 // The decorative marker may be absent in an older/cached dashboard template.
 const redlineMarker=document.querySelector('.redline-marker');
 if(redlineMarker)redlineMarker.style.left=`${s.redlineRpm/100}%`;
 element('slipPeakNote').textContent=`slip peak |κ| = ${s.peakSlipRatio.toFixed(2)}`;
 pill('rpm-state',s.engineState==='starting'?'ENGINE STARTING':s.engineState==='stalled'?'ENGINE STALLED':s.engineState==='off'?'ENGINE OFF':s.rpm>=s.redlineRpm?'REDLINE EXCEEDED':'BELOW REDLINE',s.engineState==='stalled'||s.rpm>=s.redlineRpm?'danger':'normal');
 setText('instrument-lateral',s.lateral.toFixed(2)+' g');
 pill('lateral-state',s.lateral>=1?'ABOVE 1.0 g':'BELOW 1.0 g',s.lateral>=1?'danger':'normal');
 fillMeter('lateral',s.lateral/1.5,1/1.5);
 setText('instrument-yaw',signed(s.yaw)+' rad/s');
 pill('yaw-state',`${Math.round(Math.abs(s.yaw)/2*100)}% LIMIT USED`,Math.abs(s.yaw)>=1.5?'danger':'normal');
 movePointer('yaw',(s.yaw+2)/4);
 setText('instrument-beta',signed(s.beta,1)+'°');movePointer('beta',(s.beta+45)/90);
 for(let i=0;i<4;i++) {
  setText('wheel-util-'+i,Math.round(s.util[i]*100)+'%');fillMeter('wheel-util-'+i,s.util[i],.8);
  setText('wheel-slip-'+i,signed(s.slip[i]));movePointer('wheel-slip-'+i,(s.slip[i]+1)/2);
  const peak=s.peakSlipRatio, rolling=Math.min(.08,peak);
  const track=element('wheel-slip-'+i+'-pointer').parentElement;
  track.style.background=`linear-gradient(90deg,rgba(250,138,117,.15) 0 ${50-peak*50}%,rgba(232,196,74,.16) ${50-peak*50}% ${50-rolling*50}%,rgba(72,212,232,.12) ${50-rolling*50}% ${50+rolling*50}%,rgba(232,196,74,.16) ${50+rolling*50}% ${50+peak*50}%,rgba(250,138,117,.15) ${50+peak*50}%)`;
  const footnote=element('wheel-state-'+i).parentElement;
  footnote.lastChild.textContent=` · nominal |κ| < ${rolling.toFixed(2)}`;
  const abs=Math.abs(s.slip[i]);
  pill('wheel-state-'+i,abs>=s.peakSlipRatio?(s.slip[i]<0?'BRAKING SLIP':'WHEELSPIN'):abs>=Math.min(.08,s.peakSlipRatio)?'NEAR PEAK':'ROLLING',abs>=s.peakSlipRatio?'danger':abs>=Math.min(.08,s.peakSlipRatio)?'warning':'normal');
 }
 for(const axle of ['front','rear']) {
  const [fx,fy]=s[axle];const x=130+fy*77,y=105-fx*77;const saturation=Math.hypot(fx,fy);
  element(axle+'-vector').setAttribute('x2',x);element(axle+'-vector').setAttribute('y2',y);
  element(axle+'-dot').setAttribute('transform',`translate(${x} ${y})`);
  element(axle+'-dot').querySelector('circle:last-child').setAttribute('fill',saturation>1?'#fa8a75':'#48d4e8');
  const value=element(axle+'-force-value');
  value.firstChild.textContent=`${saturation.toFixed(2)} × μN`;
  value.style.color=saturation>1?'#fa8a75':'';
  element(axle+'-chart').setAttribute('aria-label',`${axle} grip: longitudinal ${fx.toFixed(2)}, lateral ${fy.toFixed(2)}, resultant ${saturation.toFixed(2)} times mu N; nominal limit 1`);
 }
 const radar=[Math.min(Math.abs(s.yaw)/2,1.25)/1.25,Math.min(Math.hypot(...s.rear),1.25)/1.25,1-Math.min(Math.hypot(...s.front),1),Math.min(Math.abs(s.beta)/35,1),s.alignment,Math.min(s.speed/90,1)];
 element('drift-polygon').setAttribute('points',radar.map((value,i)=>{const angle=-Math.PI/2+i*Math.PI/3;return `${130+76*value*Math.cos(angle)},${108+76*value*Math.sin(angle)}`}).join(' '));
 element('radar-chart').setAttribute('aria-label',`Drift radar; normalized values: ${['yaw','rear saturation','front authority','slip angle','steering alignment','speed'].map((name,i)=>`${name} ${radar[i].toFixed(2)}`).join(', ')}`);
 for(const [name,max,threshold] of [['jerk',500,.8],['drift',1,.7],['blur',1,.8]]) {
  setText('motion-'+name,name==='jerk'?Math.round(s[name])+' m/s³':s[name].toFixed(2));fillMeter('motion-'+name,s[name]/max,threshold);
 }
}

export function readTelemetry(state) {
 const body=state.body, p=state.params;
 const heading=body.heading;
 const longitudinal=body.velocityX*Math.sin(heading)-body.velocityY*Math.cos(heading);
 const lateral=body.velocityX*Math.cos(heading)+body.velocityY*Math.sin(heading);
 const beta=Math.atan2(lateral,Math.max(Math.abs(longitudinal),.25));
 const force=axle=>{const f=state.axleForces[axle], divisor=p.tireFrictionCoeff*f.N; return divisor>0?[f.fx/divisor,f.fy/divisor]:[0,0];};
 const names=['frontLeft','frontRight','rearLeft','rearRight'];
 return {speed:body.speed*3.6,rpm:state.engine.rpm,
 engineState:state.engine.mode==='starting'?'starting':state.engine.isStalled?'stalled':state.engine.isRunning?'running':'off',gear:state.engine.currentGear,requestedGear:state.engine.requestedGear,lateral:Math.abs(body.lateralAccel)/9.81,yaw:body.angularVelocity,
 beta:beta*180/Math.PI,util:names.map(name=>state.wheelFrictionUtil[name]),slip:names.map(name=>state.wheelSlipRatio[name]),
 front:force('front'),rear:force('rear'),jerk:body.jerkMagnitude,drift:state.driftIntensity,
 blur:state.blurAccumulator||0,alignment:Math.max(1-Math.abs(Math.sign(beta)*state.steering.frontWheelAngle)/.35,0),
 peakSlipRatio:p.peakSlipRatio,redlineRpm:p.redlineRpm};
}
export function updateInstruments(state, now=performance.now()) {
 // DOM telemetry is independent of the physics tick rate. Cap it at 30Hz.
 if (now-lastUpdate < 1000/30) return;
 lastUpdate=now;
 if(!rpmSegments){rpmSegments=document.querySelectorAll('.rpm-segment');gearLabels=document.querySelectorAll('[data-gear]');}
 const telemetry=readTelemetry(state);
 const valid=Object.values(telemetry).flat().every(value=>typeof value!=='number'||Number.isFinite(value));
 if(valid)renderInstruments(telemetry);
 document.querySelector('.instrument-dashboard').style.setProperty('--gauge-label-scale',state.params.gaugeLabelScale);
 const button=element('engineToggle');
 button.textContent=state.engine.mode==='starting'?'Engine STARTING':state.engine.isStalled?'Engine STALLED · Restart':state.engine.isRunning?'Engine ON':'Engine OFF · Start';
 button.setAttribute('aria-pressed',String(state.engine.isRunning||state.engine.mode==='starting'));
 element('telemetryStatus').textContent=!valid?'Invalid telemetry · inspect diagnostics':state.debug.faults.isFrozen?'Simulation frozen · inspect diagnostics':'Live vehicle telemetry';
}
