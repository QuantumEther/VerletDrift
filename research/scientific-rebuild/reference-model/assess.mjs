import {readFileSync,writeFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {derivative,checkDomain} from './model.mjs';import {parameters as p} from './parameters.mjs';
const read=n=>JSON.parse(readFileSync(new URL('./results/'+n,import.meta.url)));
const v=read('validation.json'),roots=read('equilibria.json'),plan=read('plan.json'),ref=JSON.parse(gunzipSync(readFileSync(new URL('./results/references.json.gz',import.meta.url))));
const rows=[];
for(const [name,r]of Object.entries(roots)){
 const z=derivative(r.state,p,{gamma:r.gamma,Md:r.Md}),bounds=[[5,25],[-8,8],[-2,2],[20,200],[20,200]];
 rows.push({id:name,state:r.state,stability:Math.max(...r.eigenvalues.map(e=>e[0]))<0?'stable':'unstable',eigenvalues:r.eigenvalues,
  stateMargins:r.state.map((x,i)=>({lower:x-bounds[i][0],upper:bounds[i][1]-x})),tireMargins:Object.fromEntries(Object.entries(z.diagnostics.contacts).map(([n,t])=>[n,{load:t.Fz,slipRemaining:2-t.B,adhesionResidual:t.Kcrit-t.K}])),diagnostics:z.diagnostics});
}
const summary={provenance:v.provenance,globalContactPassivity:'FAIL (expected source limitation)',counterexample:read('counterexample.json').reproduction,referenceCases:ref.cases.length,referenceGate:ref.cases.every(c=>c.status==='PASS')?'PASS':'UNRESOLVED',roots:rows,
 rates:[100,200,400,800].map(hz=>{const a=v.runs.filter(r=>r.hz===hz);return {hz,cases:a.length,passed:a.filter(r=>r.status==='PASS'&&r.numericalStatus==='PASS').length,domain:a.filter(r=>r.status==='OUT OF DOMAIN').length,maxNormalizedError:Math.max(...a.map(r=>r.normalizedError??Infinity)),maxLedgerJ:Math.max(...a.map(r=>r.energyResidualMaxJ??Infinity))};})};
summary.finestGate=summary.rates.find(r=>r.hz===800).passed===plan.cases.length?'PASS':'FAIL';
writeFileSync(new URL('./results/assessment.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');console.log(summary.rates);
if(summary.referenceGate!=='PASS'||summary.finestGate!=='PASS')process.exitCode=1;
