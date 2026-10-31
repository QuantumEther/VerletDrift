// Mission 13 B fixture: captured before optimization, complete f64 field paths.
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fixture} from './tire-ab-fixtures.mjs';
import {stepTerrainVehicle} from '../src/vehicle.js';
function fields(x,path='$',out=[],seen=new Map()){
 if(typeof x==='number'){const b=Buffer.alloc(8);b.writeDoubleBE(x);out.push([path,'f64',b.toString('hex')]);}
 else if(x&&typeof x==='object'){if(seen.has(x)){out.push([path,'ref',seen.get(x)]);return out;}seen.set(x,path);out.push([path,Array.isArray(x)?'array':'object',Array.isArray(x)?x.length:null]);for(const k of Object.keys(x).sort())fields(x[k],path+'.'+k,out,seen);}
 else out.push([path,typeof x,x]);return out;
}
const cases=[];
for(const scenario of ['acceleration','braking','steering','combined','recovery','drift-recovery','recontact'])for(const h of [.001,.002,.004])for(const floor of [.25,.5,1,2]){
 const {v,inputs}=fixture('speed-normalized-anisotropic',floor,scenario,1),steps=[];if(process.env.VARIANT)v.contactOptimization=process.env.VARIANT;
 for(let i=0;i<20;i++){stepTerrainVehicle(v,inputs(i*h),h);steps.push(fields({state:v.state,contacts:v.contacts,integration:v.integration}));}
 cases.push({scenario,h,floor,steps});
}
const url=new URL('../results/contact-optimization/b-baseline.json.gz',import.meta.url);
if(process.argv.includes('--capture')){await writeFile(url,gzipSync(JSON.stringify({sourceCommit:'59a6ed8',runtime:process.version,cases})));console.log('captured',cases.length,'B fixtures');}
else{
 const ref=JSON.parse(gunzipSync(await readFile(url)));if(ref.runtime!==process.version)throw Error('runtime mismatch');
 let differing=0,maxMechanical=0,maxDiagnostic=0,maxMechanicalField=null,first=null;
 for(let i=0;i<cases.length;i++)for(let j=0;j<20;j++){
  const a=ref.cases[i].steps[j],b=cases[i].steps[j];if(a.length!==b.length)throw Error('field count mismatch');
  for(let k=0;k<a.length;k++)if(JSON.stringify(a[k])!==JSON.stringify(b[k])){
   first??={scenario:cases[i].scenario,h:cases[i].h,floor:cases[i].floor,step:j,expected:a[k],actual:b[k]};differing++;
   if(a[k][0]!==b[k][0]||a[k][1]!=='f64'||b[k][1]!=='f64')throw Error('non-numeric difference '+JSON.stringify(first));
   const x=Buffer.from(a[k][2],'hex').readDoubleBE(),y=Buffer.from(b[k][2],'hex').readDoubleBE(),delta=Math.abs(x-y);
   const diagnostic=/\.contact\.|\.terrainLedger\.|\.lastSolveCases|\.lastStepCases|\.integration\./.test(a[k][0]);
   if(diagnostic)maxDiagnostic=Math.max(maxDiagnostic,delta);else if(delta>maxMechanical){maxMechanical=delta;maxMechanicalField=a[k][0];}
   if(!process.argv.includes('--equivalent'))throw Error('first bit mismatch '+JSON.stringify(first));
   if(!Number.isFinite(delta)||(!diagnostic&&delta>1e-7))throw Error('physical equivalence failure '+JSON.stringify(first));
  }
 }
 console.log(JSON.stringify({runtime:process.version,cases:cases.length,states:cases.length*20,differingFields:differing,maxMechanical,maxMechanicalField,maxDiagnostic,first}));
}
