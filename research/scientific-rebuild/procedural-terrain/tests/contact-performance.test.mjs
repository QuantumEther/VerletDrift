import {test} from 'node:test';import assert from 'node:assert/strict';
import {solveContacts as reference} from '../../tire-road-observatory-prototype/src/contact-solver.js';
import {solveContacts} from '../src/contact-solver.js';
test('allocation-reduced contact implementation exactly matches inherited constrained solves',()=>{
 let seed=7;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32-.5);
 for(let scenario=0;scenario<40;scenario++){
  const n=18,a=Array.from({length:n},()=>Array.from({length:n},random));
  const inverse=a.map((r,i)=>a.map((s,j)=>r.reduce((sum,v,k)=>sum+v*s[k],i===j?1:0)));
  const free=Array.from({length:n},random),rows=Array.from({length:12},(_,i)=>({j:Array.from({length:n},random),compliance:i<8?1.25:0}));
  const groups=[...Array.from({length:4},(_,i)=>({indices:[2*i,2*i+1],limit:.02+i*.01})),{indices:[8],limit:.01},{indices:[9],limit:1,lower:0,upper:1},{indices:[10],limit:.1,fixed:scenario%2?.01:undefined},{indices:[11],limit:scenario%3?.02:0}];
  const options={maxIterations:20000,tolerance:1e-12};const before=structuredClone({inverse,free,rows,groups});
  assert.deepEqual(solveContacts(inverse,free,rows,groups,.001,options),reference(inverse,free,rows,groups,.001,options));assert.deepEqual({inverse,free,rows,groups},before);
 }
});
