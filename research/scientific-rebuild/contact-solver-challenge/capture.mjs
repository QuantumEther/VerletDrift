import {readFile,writeFile} from 'node:fs/promises';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {fixture} from '../procedural-terrain/tools/tire-ab-fixtures.mjs';import {stepTerrainVehicle} from '../procedural-terrain/src/vehicle.js';
const source=new URL('../procedural-terrain/results/contact-optimization/baseline-profile.json.gz',import.meta.url),bytes=await readFile(source),old=JSON.parse(gunzipSync(bytes)),problems=[];
function add(t,metadata){const {inverse,free,rows,groups,warm,h}=t;problems.push({id:'qp-'+String(problems.length).padStart(3,'0'),...metadata,h,inverse,free,rows,groups,warm,historical:t.d?{d:t.d,rhs:t.rhs,L:t.L}:null});}
for(const r of old.runs.filter(r=>['acceleration','recovery'].includes(r.scenario)))for(const [i,t] of r.traces.slice(0,2).entries())add(t,{origin:'historical matrix capture',scenario:r.scenario,strategy:r.id,floor:r.floor,mode:t.mode,time:t.time,captureIndex:i});
for(const strategy of ['reference','speed-normalized-anisotropic'])for(const h of [.001,.004])for(const floor of [.25,.5,2])for(const scenario of ['braking','recontact','near-steady']){
 const {v,inputs}=fixture(strategy,floor,scenario,1),targets=scenario==='recontact'?[0,.04]:scenario==='braking'?[.05]:[0];
 for(let i=0;i<=Math.round(targets.at(-1)/h);i++){
  const target=targets.find(t=>i===Math.round(t/h)),captures=[];if(target!==undefined)v.contactCapture=t=>captures.push(t);else v.contactCapture=null;
  stepTerrainVehicle(v,inputs(i*h),h);
  if(target!==undefined){const count=scenario==='near-steady'?1:2;if(captures.length<count)throw Error('Insufficient actual captures');
   for(const [j,t] of captures.slice(0,count).entries())add(t,{origin:'new capture of unchanged existing benchmark fixture',scenario,strategy,floor,mode:t.mode,time:i*h,captureIndex:j,acceptedPhysicalClutchMode:v.state.flywheel.state});
  }
 }
}
if(problems.length!==132)throw Error('Unexpected fixed dataset size '+problems.length);
const metadata={base:'1844f08318d1f61dff76cce14165ecbdc5e580fc',historicalSource:new URL(source).pathname.split('/').slice(-4).join('/'),historicalSha256:createHash('sha256').update(bytes).digest('hex'),protocol:'48 historical locked/slipping acceleration/recovery +24 braking +48 unloaded/recontact +12 near-steady; A/B, h1/4ms, floors0.25/0.5/2. No force, stiffness or initial state changes.',problems};
await writeFile(new URL('results/problems.json.gz',import.meta.url),gzipSync(JSON.stringify(metadata)));console.log(JSON.stringify({problems:problems.length,sourceSha256:metadata.historicalSha256,acceptedLocked:problems.filter(p=>p.scenario==='near-steady'&&p.acceptedPhysicalClutchMode==='locked').length}));
