import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrument} from './shader.js';
const source=await readFile(new URL('../pbf.wgsl',import.meta.url),'utf8');
test('telemetry retains original correction and final velocity reconstruction',()=>{const s=instrument(source);for(const line of ['let after=(p+delta-x[i].xyz)/u.p.y;','let q=boundary(p+delta,x[i].xyz);','v[i]=vec4f((predicted[i].xyz-x[i].xyz)/u.p.y,0.);'])assert.ok(s.includes(line));assert.ok(!s.includes('fn chooseTrial'));});
test('search is bounded, has a final independent residual gate and no velocity cap',()=>{const s=instrument(source,true);for(const code of ['cost<=base-.0001*dotStep+roundoff','if(residual>.001)','atomicStore(&heads[32771],1)','if(atomicLoad(&heads[32771])!=0){return;}'])assert.ok(s.includes(code));assert.ok(!s.includes('clamp(v['));assert.throws(()=>instrument(source.replace('motionWork:vec4f }','changed')));});
test('position corrections can preserve total momentum while creating kinetic energy',()=>{const m=.01,h=1/960,d=.005,v=4,velocities=[v+d/h,v-d/h];const before=m*v*v,after=.5*m*velocities.reduce((a,b)=>a+b*b,0);assert.ok(Math.abs(m*(velocities[0]+velocities[1])-2*m*v)<1e-15);assert.ok(Math.abs(after-before-m*(d/h)**2)<1e-14);assert.ok(after>before);});
test('signed boundary work separates moving-wall supply from relative dissipation',()=>{const m=.02,wall=-2,before=1,after=-2,J=m*(after-before),work=J*wall,deltaK=.5*m*(after*after-before*before);assert.ok(Math.abs((work-deltaK)-.5*m*(before-wall)**2)<1e-15);});
test('frozen diagonal density correction is a descent direction, not an energy guarantee',()=>{const J=[[2,-2],[1,-1]],C=[.1,.2],D=J.map(r=>r.reduce((a,b)=>a+b*b,0)+1e-6),gradient=[0,1].map(k=>J.reduce((s,row,i)=>s+row[k]*C[i]/D[i],0)),delta=gradient.map(a=>-a);assert.ok(gradient.reduce((s,g,i)=>s+g*delta[i],0)<0);});
test('independent all-pairs calculation reproduces the first measured explosive correction',async()=>{
 const {correction}=await import('./independent.mjs'),data=JSON.parse(await readFile(new URL('results/minimal-impact.json',import.meta.url),'utf8'));
 const r=data.records.find(r=>r.dt===1/240&&r.boundaryVelocity===0&&!r.guard),pred=r.trace.find(t=>t.label==='force-and-predictor-collision'),measured=r.trace.find(t=>t.label==='density-and-collision');
 const independent=correction(pred.predictedPositions,r.config.nominalMass/4,r.config.constraintDensity),delta=Math.max(...independent.delta.map(d=>Math.hypot(...d)));
 assert.equal(r.trace[0].storedState.maxCompression,0);assert.ok(delta>8);assert.ok(Math.abs(delta/measured.maxPositionCorrection-1)<.001,'float32 shader / float64 independent correction within 0.1%');
 assert.ok(r.final.kineticJ>1000*r.trace[0].storedState.kineticJ);assert.ok(Math.abs(measured.densityImpulse[0])<1e-4,'near-zero internal net impulse does not imply energy passivity');
});
