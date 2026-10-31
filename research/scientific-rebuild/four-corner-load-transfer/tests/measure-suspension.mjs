import {createVehicle,stepVehicle} from '../src/combined-vehicle.js';
import {modalDampingReference,suspensionDiagnostics} from '../src/suspension-diagnostics.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
import {writeFileSync} from 'node:fs';import {gzipSync} from 'node:zlib';
export function measure(name,h=.001,duration=6){
 const s=createVehicle({mode:'open'});s.engine.ignition=false;const base=[...s.vertical.q];let coordinate=0,amplitude=.01;
 if(name==='pitch'){coordinate=1;amplitude=.005;}if(name==='roll'){coordinate=2;amplitude=.005;}
 if(['heave','pitch','roll'].includes(name))s.vertical.q[coordinate]+=amplitude;
 if(name==='corner-release'){coordinate=3;amplitude=.02;s.vertical.q[3]+=.02;}
 const driving=['progressive-braking','emergency-braking','reversal','acceleration','mixed'].includes(name);
 if(driving){s.v=4;s.wheels.forEach(w=>w.omega=4/w.radius);}
 if(['acceleration','mixed'].includes(name)){s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=.5;s.flywheel.omega=80;s.engine.ignition=true;}
 const trace=[],peaks=[];let fault=null;let heat=0,lastPower=suspensionDiagnostics(s).damperPower,maxContactResidual=0;const metrics={maxPitch:0,maxRoll:0,maxPitchRate:0,maxRollRate:0,maxTravel:0,maxRelativeVelocity:0,minNormal:Infinity,maxNormal:0,unloadedSamples:0,recontacts:0};let unloaded=Array(4).fill(false);
 for(let i=0;i<Math.round(duration/h);i++){
  const t=i*h,ports={};if(name==='progressive-braking')ports.serviceBrake=Math.min(t,1)*.5;if(name==='emergency-braking')ports.serviceBrake=t>.1?1:0;if(name==='reversal')ports.steer=t<.5?.2:-.2;if(name==='acceleration')ports.throttle=.5;
  if(name==='mixed'){ports.throttle=t%4<2?.5:0;ports.serviceBrake=t%4>3?.3:0;ports.handbrake=t%4>2.5&&t%4<2.7?1:0;ports.steer=Math.sin(t*2)*.15;}
  try{stepVehicle(s,ports,h);}catch(e){fault={time:s.time,message:e.message};break;}const d=suspensionDiagnostics(s);heat+=h*(lastPower+d.damperPower)/2;lastPower=d.damperPower;maxContactResidual=Math.max(maxContactResidual,Math.abs(s.planar.contact.energyResidual));
  for(const [key,value] of [['maxPitch',s.pitch],['maxRoll',s.roll],['maxPitchRate',s.pitchRate],['maxRollRate',s.rollRate]])metrics[key]=Math.max(metrics[key],Math.abs(value));
  d.corners.forEach((c,j)=>{metrics.maxTravel=Math.max(metrics.maxTravel,Math.abs(c.compression));metrics.maxRelativeVelocity=Math.max(metrics.maxRelativeVelocity,Math.abs(c.relativeVelocity));metrics.minNormal=Math.min(metrics.minNormal,c.normal);metrics.maxNormal=Math.max(metrics.maxNormal,c.normal);if(c.normal===0){metrics.unloadedSamples++;unloaded[j]=true;}else if(unloaded[j]){metrics.recontacts++;unloaded[j]=false;}});
  if(i%Math.max(1,Math.round(.005/h))===0)trace.push({t:s.time,q:[...s.vertical.q],rates:[...s.vertical.v],normal:d.corners.map(c=>c.normal),compression:d.corners.map(c=>c.compression),damperPower:d.damperPower,springEnergy:d.springEnergy,value:s.vertical.q[coordinate]-base[coordinate]});
 }
 for(let i=1;i<trace.length-1;i++)if(trace[i].value>0&&trace[i].value>trace[i-1].value&&trace[i].value>=trace[i+1].value)peaks.push(trace[i]);
 const usable=peaks.slice(0,4),period=usable.length>1?(usable.at(-1).t-usable[0].t)/(usable.length-1):null,delta=usable.length>1?Math.log(usable[0].value/usable.at(-1).value)/(usable.length-1):null;
 const threshold=.02*amplitude,lastOutside=trace.findLast(r=>Math.abs(r.value)>threshold);
 return {summary:{name,h,duration,completed:!fault,acceptedTime:s.time,fault,...metrics,period:['heave','pitch','roll'].includes(name)?period:null,observedHz:['heave','pitch','roll'].includes(name)&&period?1/period:null,dampingRatio:['heave','pitch','roll'].includes(name)&&delta!==null?delta/Math.sqrt(4*Math.PI**2+delta**2):null,settlingTolerance:threshold,settlingTime:['heave','pitch','roll','corner-release'].includes(name)&&Math.abs(trace.at(-1).value)<=threshold?(lastOutside?.t||0):null,oppositePeak:Math.min(...trace.map(r=>r.value)),damperEnergy:heat,maxContactResidual,verticalResidual:s.verticalLedger.residual,reference:suspensionDiagnostics(s).modalHz,dampingReference:modalDampingReference(s.vertical)},trace};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const cases=['heave','pitch','roll','corner-release','progressive-braking','emergency-braking','acceleration','reversal','mixed'];const results=cases.map(n=>measure(n,.001,n==='mixed'?12:6));const root=new URL('../results/',import.meta.url);writeFileSync(new URL('suspension-traces.json.gz',root),gzipSync(JSON.stringify(results)));writeFileSync(new URL('suspension-summary.json',root),JSON.stringify(results.map(r=>r.summary),null,2)+'\n');console.log(JSON.stringify(results.map(r=>r.summary)));}
