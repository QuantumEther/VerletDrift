import {readFileSync,writeFileSync} from 'node:fs';import {derivative} from './model.mjs';import {parameters as p} from './parameters.mjs';
const roots=JSON.parse(readFileSync(new URL('./results/equilibria.json',import.meta.url))),results=[];
for(const [name,r]of Object.entries(roots)){
 const c=Math.cos(r.gamma),s=Math.sin(r.gamma),[v,z,w,,Of]=r.seed;
 // Eq.27 at equilibrium requires Fx,f=0; Eq.20 then requires Sx,f=0.
 const Vxf=v*c+(z+p.q*w)*s;
 const rounding=.005*Math.abs(c)+(.005+p.q*.005)*Math.abs(s);
 const centerInterval=[Vxf-rounding,Vxf+rounding],rollingInterval=[p.r*(Of-.005),p.r*(Of+.005)];
 results.push({name,seed:r.seed,seedResidual:derivative(r.seed,p,{gamma:r.gamma,Md:r.Md}).dx,root:r.state,rootMinusSeed:r.state.map((v,i)=>v-r.seed[i]),assumption:'all printed state entries rounded to nearest 0.01; gamma/radius fixed as specified',centerInterval,rollingInterval,printedFrontRollingConsistency:centerInterval[1]<rollingInterval[0]||centerInterval[0]>rollingInterval[1]?'FAIL':'not contradicted by this interval test',cause:'UNRESOLVED; author data/code needed; no parameter substitution made'});
}
writeFileSync(new URL('./results/source-table-audit.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(results);
