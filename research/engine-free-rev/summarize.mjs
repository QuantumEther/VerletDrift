import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
const path='docs/engine-free-rev-data/browser.json.gz';
const data=JSON.parse(gunzipSync(await readFile(path)));
if(data.storage)throw Error('Already downsampled: regenerate full browser measurements first');
const quantile=(a,q)=>a.toSorted((a,b)=>a-b)[Math.min(a.length-1,Math.floor(q*a.length))];
const isolated=data.isolated.map(run=>{
 const rows=run.rows,at=t=>rows[Math.min(rows.length-1,Math.max(0,Math.round(t*run.hz)-1))];
 const transitions=rows.filter((r,i)=>i===0||r.mode!==rows[i-1].mode).map(r=>({t:r.t,mode:r.mode,rpm:r.rpm}));
 return {name:run.name,hz:run.hz,initialRpm:run.initialRpm,final:rows.at(-1),maxRpm:Math.max(...rows.map(r=>r.rpm)),minRpm:Math.min(...rows.map(r=>r.rpm)),
   to1000:rows.find(r=>r.rpm<=1000)?.t??null,to810:rows.find(r=>r.rpm<=810)?.t??null,toZero:rows.find(r=>r.rpm===0)?.t??null,
   maxEnergyResidual:Math.max(...rows.map(r=>Math.abs(r.energyResidual))),work:run.work,transitions,
   snapshots:[.2,.5,1,2,4,8,12,16].filter(t=>t<=rows.at(-1).t).map(at)};
});
const ix=k=>data.loaded.columns.indexOf(k);
const loaded=data.loaded.runs.map(run=>{
 const pick=r=>Object.fromEntries(['t','rpm','crank','mode','clutchSlip','clutchTorque','clutchPedal','gear','longV','yaw','clutchHeat','frictionHeat'].map(k=>[k,r[ix(k)]]));
 const costs=run.rows.map(r=>r[ix('tickMs')]);
 return {name:run.name,hz:run.hz,anomalies:run.anomalies,transitions:run.transitions,final:pick(run.rows.at(-1)),
   maxAbsYaw:Math.max(...run.rows.map(r=>Math.abs(r[ix('yaw')]))),maxRpm:Math.max(...run.rows.map(r=>r[ix('rpm')])),
   tickMs:{mean:costs.reduce((a,b)=>a+b,0)/costs.length,p95:quantile(costs,.95),worst:Math.max(...costs)},
   snapshots:[.5,1,2,4,6].filter(t=>t<=run.rows.at(-1)[0]).map(t=>pick(run.rows[Math.round(t*run.hz)-1]))};
});
await writeFile('docs/engine-free-rev-data/summary.json',JSON.stringify({isolated,loaded,errors:data.errors},null,2)+'\n');
// Keep 20 Hz diagnostic trajectories, transition rows and final rows. All metrics
// above were computed from every tick. Full-resolution capture is reproducible.
for(const run of data.isolated)run.rows=run.rows.filter((r,i,a)=>i%Math.round(run.hz/20)===0||i===a.length-1||i>0&&r.mode!==a[i-1].mode);
for(const run of data.loaded.runs)run.rows=run.rows.filter((r,i,a)=>i%Math.round(run.hz/20)===0||i===a.length-1||i>0&&r[ix('mode')]!==a[i-1][ix('mode')]);
data.storage='Trajectories retained at approximately 20 Hz plus transitions/endpoints; summary metrics use every simulation tick. 50 Hz retains 25 Hz.';
await writeFile(path,gzipSync(JSON.stringify(data),{level:9}));
for(const hz of [50,100,200,400]){
 console.log(hz,isolated.filter(r=>r.hz===hz&&['release-redline','release-4000','release-2000','shutdown','full-throttle','restart'].includes(r.name)).map(r=>({name:r.name,final:r.final.rpm,max:r.maxRpm,t1000:r.to1000,t810:r.to810,zero:r.toZero,rpm4:r.snapshots.find(s=>s.t===4)?.rpm})));
}
console.log('LOADED100',JSON.stringify(loaded.filter(r=>r.hz===100),null,2));
