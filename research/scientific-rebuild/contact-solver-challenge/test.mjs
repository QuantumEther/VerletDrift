import {test} from 'node:test';import assert from 'node:assert/strict';
import {solveNewton,residualSystem} from './newton.js';import {certify} from './check.js';
test('scalar bounds, equality and zero capacity obey analytic optima',()=>{
 const d=[[2,0,0],[0,3,0],[0,0,4]],rhs=[2,-2,9],groups=[{indices:[0],limit:.2},{indices:[1],fixed:-.3},{indices:[2],limit:0}],s=solveNewton(d,rhs,4,groups);
 assert.ok(s.converged);assert.ok(Math.abs(s.z[0]-.2)<1e-12);assert.equal(s.z[1],-.3);assert.equal(s.z[2],0);
});
test('anisotropic saturated disc agrees with independent multiplier bisection',()=>{
 const d=[[2,.4],[.4,5]],rhs=[2,-3],groups=[{indices:[0,1],limit:.2}];
 const point=lambda=>{const a=2+lambda,b=5+lambda,det=a*b-.16;return [(b*2+.4*3)/det,(-.4*2-a*3)/det];};let lo=0,hi=100;
 for(let i=0;i<200;i++){const mid=(lo+hi)/2;if(Math.hypot(...point(mid))>.2)lo=mid;else hi=mid;}
 const expected=point((lo+hi)/2),s=solveNewton(d,rhs,5.4,groups);assert.ok(s.converged);s.z.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
});
test('generalized Jacobian matches finite differences away from kinks',()=>{
 const d=[[3,.2],[.2,2]],rhs=[2,-1],groups=[{indices:[0,1],limit:.2}],z=[.1,.03],a=residualSystem(d,rhs,3.2,groups,z),e=1e-7;
 for(let j=0;j<2;j++){const x=[...z],y=[...z];x[j]+=e;y[j]-=e;const f=residualSystem(d,rhs,3.2,groups,x,false),g=residualSystem(d,rhs,3.2,groups,y,false);for(let i=0;i<2;i++)assert.ok(Math.abs((f.F[i]-g.F[i])/(2*e)-a.J[i][j])<1e-7);}
});
test('independent KKT and feasibility checker rejects incorrect feasible and infeasible answers',()=>{
 const p={rows:[{j:[1,0]},{j:[0,1]}],inverse:[[1,0],[0,1]],free:[2,0],groups:[{indices:[0,1],limit:1}]};
 assert.ok(certify(p,[1,0],1e-12,1).pass);assert.equal(certify(p,[0,0],1e-12,1).pass,false);assert.equal(certify(p,[2,0],1e-12,1).pass,false);assert.equal(certify(p,[-1,0],1e-12,1).pass,false);
});
test('bounded failure is explicit and does not mutate problem or initial guess',()=>{
 const d=[[2,.4],[.4,5]],rhs=[2,-3],groups=[{indices:[0,1],limit:.2}],initial=[0,0],before=structuredClone({d,rhs,groups,initial});
 const r=solveNewton(d,rhs,5.4,groups,{initial,maxIterations:0});assert.equal(r.converged,false);assert.deepEqual({d,rhs,groups,initial},before);
});
