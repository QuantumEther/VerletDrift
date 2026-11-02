import {readFile,writeFile} from 'node:fs/promises';
const [,,directory='/tmp/vehicle-efficiency-profile',label='baseline']=process.argv;
const p=JSON.parse(await readFile(directory+'/cpu.json')),heap=JSON.parse(await readFile(directory+'/heap.json'));
const nodes=new Map(p.nodes.map(n=>[n.id,n])),cpu=new Map(),allocations=new Map();
const key=f=>JSON.stringify({function:f.functionName,file:f.url.startsWith('data:')?'git:a8be5c9/consistent-model.js':f.url.split('/').at(-1),line:f.lineNumber+1});
for(let i=0;i<p.samples.length;i++){const k=key(nodes.get(p.samples[i]).callFrame);cpu.set(k,(cpu.get(k)||0)+p.timeDeltas[i]);}
function walk(n){const k=key(n.callFrame);allocations.set(k,(allocations.get(k)||0)+n.selfSize);for(const c of n.children||[])walk(c);}walk(heap.profile.head);
const totalCpu=[...cpu.values()].reduce((a,x)=>a+x,0),totalBytes=[...allocations.values()].reduce((a,x)=>a+x,0),rows=m=>[...m].map(([k,value])=>({...JSON.parse(k),value})).sort((a,b)=>b.value-a.value);
await writeFile(new URL('results/profile-'+label+'.json',import.meta.url),JSON.stringify({label,simulatedSeconds:35,protocol:'One warmup pass across seven cases, five measured passes. Inspector CPU interval100us and heap sampling16KiB including collected objects. Sampling overhead included: not throughput timing. Bytes are statistical allocation estimates, not retained heap.',totalCpuSampleUs:totalCpu,totalSampledAllocationBytes:totalBytes,cpuSelf:rows(cpu).map(r=>({...r,percent:100*r.value/totalCpu})),allocations:rows(allocations)},null,2));
console.log(label,totalBytes,'estimated allocated bytes,',totalCpu,'sampled CPU us');
