import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {tire} from './tire.mjs';import {parameters as p,units} from './parameters.mjs';
const close=(a,b,scale)=>assert.ok(Math.abs(a-b)<=512*Number.EPSILON*scale,`${a} != ${b}`);
const at=(sx,sy)=>tire(15*(1-sx),-15*sy,50,5000);
test('independent 70-digit pure/combined/negative slip fixtures, including moments',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures.json',import.meta.url)));
 for(const f of fixtures.points){const t=at(...f.slip);assert.equal(t.branch,f.branch);for(const [i,k]of ['Fx','Fy','Mz'].entries())close(t[k],f.force[i],k==='Mz'?450:4500);}
});
test('exact zero slip has no dead zone; stiffness and moment analytic limits',()=>{
 const t=at(0,0);assert.deepEqual([t.Fx,t.Fy,t.Mz],[0,0,0]);
 // finite difference error is O(eps); bound it from scale, not a loose curve tolerance.
 const e=1e-8;assert.ok(Math.abs(at(e,0).Fx/e-80000)<.1);assert.ok(Math.abs(at(0,e).Fy/e-40000)<.1);
 assert.ok(Math.abs(at(0,e).Mz/e+2/3*p.a**3*p.ky)<.02);
 assert.notEqual(at(1e-12,0).Fx,0);
});
test('reflection, force signs and passive force work',()=>{
 for(const x of [-.6,-.05,0,.05,.6])for(const y of [-.4,-.02,0,.02,.4]){
  const a=at(x,y),b=at(x,-y);close(a.Fx,b.Fx,4500);close(a.Fy,-b.Fy,4500);close(a.Mz,-b.Mz,450);
  assert.ok(a.Fx*x>=0&&a.Fy*y>=0);assert.ok(a.Fx*(-15*x)+a.Fy*(-15*y)<=1e-10);
 }
});
test('adhesion/sliding continuity and saturated magnitude/direction',()=>{
 const cr=3*p.mu0*5000/(2*p.a**2*p.kx);
 const below=at(cr*(1-1e-7),0),above=at(cr*(1+1e-7),0);assert.ok(Math.abs(below.Fx-above.Fx)<.001);
 const t=at(.5,.3);close(Math.hypot(t.Fx,t.Fy),3000,4500);close(t.Fx/t.Fy,.5/.3,5);assert.equal(t.Mz,0);
});
test('units and constitutive operation count; invalid inputs are rejected',()=>{
 assert.equal(units.kx,'N/m^2');const c={};tire(15,-.1,50,5000,p,c);assert.equal(c.tires,1);
 assert.throws(()=>tire(15,0,0,5000));assert.throws(()=>tire(15,0,50,-1));assert.throws(()=>tire(15,0,50,5000,{...p,kx:-1}));
});
test('dimensional homogeneity: length unit transformation preserves force and scales moment',()=>{
 const t=tire(14,-.3,50,5000),p2={...p,r:p.r*2,a:p.a*2,kx:p.kx/4,ky:p.ky/4};
 const t2=tire(28,-.6,50,5000,p2);close(t.Fx,t2.Fx,4500);close(t.Fy,t2.Fy,4500);close(t.Mz*2,t2.Mz,900);
});
