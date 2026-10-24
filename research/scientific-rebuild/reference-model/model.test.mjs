import test from 'node:test';import assert from 'node:assert/strict';
import {parameters as p} from './parameters.mjs';import {derivative,energy,checkDomain} from './model.mjs';
export const counterState=[8.5723209223564647401,.455,.3,28.574403074521549134,28.685010796556446357];
const u={gamma:Math.PI/36,Md:0};
test('Mission 15 counterexample: source reproduction PASS, global passivity known FAIL',()=>{
 const {diagnostics:d}=derivative(counterState,p,u);
 assert.ok(d.contact>0);assert.ok(Math.abs(d.contact-.230852970243096)<1e-11);
 const values=[[-23.28369090656149,.772981436992145,-.116418454532807,.231894431097643],[-23.207797733927347,.771386607826321,-.116038988669637,.231415982347896]];
 for(const [i,name]of ['rear','front'].entries()){
  const t=d.contacts[name];assert.ok(Math.abs(t.Fx)<1e-9);
  const actual=[t.Fy,t.Mz,d.force[i],d.moment[i]];
  actual.forEach((v,j)=>assert.ok(Math.abs(v-values[i][j])<512*Number.EPSILON*(j<2?4500:450)));
 }
 assert.ok(Math.abs(d.energyRate-d.total)<512*Number.EPSILON*1000);
});
test('pure derivative, source straight rolling, mirror and evaluation-order invariance',()=>{
 const x=Object.freeze([14.96,-.84,.29,50.56,49.75]),input=Object.freeze({gamma:Math.PI/36,Md:200});
 const a=derivative(x,p,input),b=derivative(x,p,input,{},['front','rear']);assert.deepEqual(a,b);
 const c=derivative([x[0],-x[1],-x[2],x[3],x[4]],p,{...input,gamma:-input.gamma});
 a.dx.forEach((v,i)=>assert.ok(Math.abs(v-c.dx[i]*([1,-1,-1,1,1][i]))<1e-11));
 assert.ok(derivative([15,0,0,50,50],p,{gamma:0,Md:0}).dx.every(v=>v===0));
});
test('energy equals independent three-body kinetic sum',()=>{
 const [v,s,w,Or,Of]=counterState;
 const E=p.mv*(v*v+s*s)/2+p.JG*w*w/2+p.mw*(v*v+(s-p.d*w)**2)/2+p.mw*(v*v+(s+p.q*w)**2)/2+p.C*w*w+p.D*(Or*Or+Of*Of)/2;
 assert.ok(Math.abs(energy(counterState)-E)<1e-9);
});
test('domain rejects nonfinite, singular/low rotors, excessive slip and unapproved steering dynamics',()=>{
 for(const [x,u,status]of [[[15,0,0,0,50],{gamma:0,Md:0},'OUT OF DOMAIN'],[[NaN,0,0,50,50],{gamma:0,Md:0},'FAIL'],[[25,8,2,20,20],{gamma:0,Md:0},'OUT OF DOMAIN'],[[15,0,0,50,50],{gamma:0,Md:0,gammaDot:1},'OUT OF DOMAIN']])assert.throws(()=>checkDomain(x,u),e=>e.status===status);
});
test('independently refined source roots satisfy JavaScript equations',async()=>{
 const {readFileSync}=await import('node:fs');const roots=JSON.parse(readFileSync(new URL('./results/equilibria.json',import.meta.url)));
 for(const r of Object.values(roots)){
  const z=derivative(r.state,p,{gamma:r.gamma,Md:r.Md});
  assert.ok(Math.max(...z.dx.map((v,i)=>Math.abs(v)/[1e-4,1e-4,1e-6,1e-3,1e-3][i]))<=1e-3);
  if(r.id==='drifting'){assert.equal(z.diagnostics.contacts.rear.branch,'sliding');assert.equal(z.diagnostics.contacts.front.branch,'adhesion');}
 }
});
