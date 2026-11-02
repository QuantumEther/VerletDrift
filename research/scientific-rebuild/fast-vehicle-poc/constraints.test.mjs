import {test} from 'node:test';import assert from 'node:assert/strict';
import {rotorFlow,reactions} from './constraints.js';import {create,step,energy,P} from './constrained-model.js';
const close=(a,b,t=1e-11)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`),zero=[0,0,0,0,0],none=[0,0,0,0];
const run=(s,ports,t=1,h=.001)=>{for(let i=0;i<Math.round(t/h);i++)step(s,typeof ports==='function'?ports(i*h):ports,h);return s;};
test('independent clutch engagement momentum and lost-energy formula',()=>{
 const w=[0,0,2,6,50],h=2,g=1.75,D=1/.3+2*g*g,r=rotorFlow(w,zero,none,30,h),j=(50-g*8)/D;
 close(r.clutchImpulse,j);close(r.w[2],2+g*j);close(r.w[3],6+g*j);close(r.w[4],50-j/.3);assert.equal(r.w[4],g*(r.w[2]+r.w[3]));
 close(.3*r.w[4]+(r.w[2]+r.w[3])/3.5,.3*50+8/3.5);close(r.clutchHeat,.5*(50-g*8)**2/D);close(r.w[3]-r.w[2],4);assert.equal(r.clutchMode,'locked');assert.ok(r.segments<=2);
});
test('bounded slip, capacity release and reopening',()=>{
 const a=rotorFlow([0,0,0,0,100],zero,none,1,.1);close(a.clutchImpulse,.1);assert.equal(a.clutchMode,'slipping');assert.ok(a.clutchHeat>0);
 const b=rotorFlow(zero,[0,0,0,0,100],none,1,.1);assert.equal(b.clutchMode,'slipping');assert.ok(b.w[4]>1.75*(b.w[2]+b.w[3]));
 const c=rotorFlow([0,0,0,0,100],zero,none,0,.1);assert.deepEqual(c.w,[0,0,0,0,100]);assert.equal(c.clutchMode,'open');
});
test('brake stop event, exact hold, breakaway and release in both directions',()=>{
 for(const sign of [-1,1]){
 const r=rotorFlow([sign*3,0,0,0,0],zero,[2,0,0,0],0,2);assert.equal(r.w[0],0);close(r.brakeHeat,4.5);assert.equal(r.brakeModes[0],'holding');
 const hold=rotorFlow(zero,[sign*1,0,0,0,0],[2,0,0,0],0,3);assert.equal(hold.w[0],0);assert.equal(hold.brakeHeat,0);
 const release=rotorFlow(zero,[sign*3,0,0,0,0],[2,0,0,0],0,1);close(release.w[0],sign);assert.equal(release.brakeModes[0],'slipping');
 const off=rotorFlow(zero,[sign*1,0,0,0,0],none,0,1);close(off.w[0],sign);
 }
});
// Test-only enumeration of all 27 static box faces, with independent dense algebra.
function linear(A,b){const n=b.length,M=A.map((r,i)=>[...r,b[i]]);for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(M[i][k])>Math.abs(M[p][k]))p=i;[M[p],M[k]]=[M[k],M[p]];const v=M[k][k];assert.ok(Math.abs(v)>1e-12);for(let j=k;j<=n;j++)M[k][j]/=v;for(let i=0;i<n;i++)if(i!==k){const f=M[i][k];for(let j=k;j<=n;j++)M[i][j]-=f*M[k][j];}}return M.map(r=>r[n]);}
function oracle(T,B,C){const g=1.75,A=[[1,0,-g],[0,1,-g],[-g,-g,1/.3+2*g*g]],rhs=[T[2],T[3],T[4]/.3-g*(T[2]+T[3])],bound=[B[2],B[3],C];
 for(let mask=0;mask<27;mask++){let n=mask;const mode=Array.from({length:3},()=>{const m=n%3-1;n=Math.floor(n/3);return m;}),p=mode.map((m,i)=>m*bound[i]),free=[0,1,2].filter(i=>mode[i]===0);const x=linear(free.map(i=>free.map(j=>A[i][j])),free.map(i=>rhs[i]-[0,1,2].filter(j=>mode[j]!==0).reduce((s,j)=>s+A[i][j]*p[j],0)));free.forEach((i,k)=>p[i]=x[k]);const grad=A.map((r,i)=>r.reduce((s,x,j)=>s+x*p[j],0)-rhs[i]);if(p.every((x,i)=>Math.abs(x)<=bound[i]+1e-9)&&grad.every((x,i)=>mode[i]===0?Math.abs(x)<1e-9:mode[i]*x<=1e-9))return p;}
 throw Error('No independent static solution');
}
test('rear static reaction agrees with 27-face independent oracle',()=>{
 for(const L of [-50,0,50])for(const R of [-30,0,30])for(const E of [-20,0,20])for(const B of [0,15,80])for(const C of [0,10,30]){
 const t=[0,0,L,R,E],b=[0,0,B,B/2],r=reactions(zero,t,b,C),p=oracle(t,b,C);close(r.brakes[2],p[0],1e-9);close(r.brakes[3],p[1],1e-9);close(r.clutch,p[2],1e-9);
 }
});
test('coupled clutch and brakes hold engine torque; asymmetric rear release',()=>{
 const held=rotorFlow(zero,[0,0,0,0,8],[0,0,20,20],30,1);assert.deepEqual(held.w,zero);assert.equal(held.clutchMode,'locked');close(held.clutchImpulse,8);close(held.brakeImpulse[2],14);
 const release=rotorFlow(zero,[0,0,0,0,8],[0,0,1,20],30,.1);assert.equal(release.w[3],0);assert.ok(release.w[2]>0);assert.equal(release.w[4],1.75*release.w[2]);
});
test('fixed-seed rotor challenges: dissipation, impulse balance, bounded events',()=>{
 let seed=12345,max=0;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let k=0;k<1000;k++){const w=Array.from({length:5},()=>rand()<.3?0:(rand()-.5)*100),T=Array.from({length:5},()=>(rand()-.5)*200),B=Array.from({length:4},()=>rand()*100),C=rand()*30,h=rand()*.1,r=rotorFlow(w,T,B,C,h);max=Math.max(max,r.segments);assert.ok(r.brakeHeat>=-1e-10&&r.clutchHeat>=-1e-10);for(let i=0;i<4;i++)close(r.w[i]-w[i],T[i]*h+(i>=2?1.75*r.clutchImpulse:0)-r.brakeImpulse[i],1e-10);close(.3*(r.w[4]-w[4]),T[4]*h-r.clutchImpulse,1e-10);}
 console.log('fixed seed maximum rotor segments:',max);
});
test('vehicle static brakes with driven starter, exact lock and release',()=>{
 const s=create({engine:0});run(s,{starter:true,clutch:1,serviceBrake:1},2);assert.deepEqual(s.y.slice(20,25),zero);close(s.y[0],0);assert.equal(s.constraints.clutchMode,'locked');assert.deepEqual(s.constraints.brakeModes,Array(4).fill('holding'));run(s,{starter:true,clutch:1},.5);assert.ok(s.y[3]>0);assert.ok(s.y[24]>0);
});
test('wheel locking under braking, reverse, rear handbrake and steering symmetry',()=>{
 const s=run(create({speed:5}),{ignition:false,clutch:1,serviceBrake:1},2);assert.deepEqual(s.y.slice(20,25),zero);assert.ok(Math.abs(s.y[3])<.02);assert.ok(s.y[27]<0);
 const a=run(create({speed:5}),{steer:.08,throttle:.2}),b=run(create({speed:5}),{steer:-.08,throttle:.2});assert.ok(a.y[2]>0);close(a.y[2],-b.y[2],1e-12);
 const reverse=run(create({speed:-5,engine:0}),{ignition:false,clutch:0,serviceBrake:1});assert.ok(reverse.y[3]>-1);assert.ok(reverse.y.slice(20,24).every(x=>x<=0));
 const hand=run(create({speed:5}),{ignition:false,clutch:0,handbrake:1},.3);assert.equal(hand.constraints.brakeModes[0],'open');assert.equal(hand.y[22],0);assert.equal(hand.y[23],0);
});
test('work and matched-time refinement at braking and recontact',()=>{
 for(const scenario of ['braking','recontact']){const rows=[.001,.0005,.00025].map(h=>{const s=create({speed:scenario==='braking'?5:0,engine:0});if(scenario==='recontact')s.y[9]=.35;const E=energy(s);run(s,{ignition:false,clutch:0,serviceBrake:scenario==='braking'?1:0},1,h);const residual=Math.abs(energy(s)-E-s.y.slice(25).reduce((a,x)=>a+x,0));return {s,residual};});console.log(scenario,'energy residuals J',rows.map(r=>r.residual));assert.ok(rows[0].residual<.01);assert.ok(rows[2].residual<rows[0].residual);const error=(a,b)=>Math.hypot(...a.s.y.slice(0,25).map((x,i)=>x-b.s.y[i]));assert.ok(error(rows[1],rows[2])<error(rows[0],rows[2]));}
});
test('determinism and atomic failure preserve state and constraint diagnostics',()=>{
 const a=run(create(),{throttle:.2}),b=run(create(),{throttle:.2});assert.deepEqual(a,b);const snapshot=structuredClone(a);assert.throws(()=>step(a,{steer:NaN}));assert.deepEqual(a,snapshot);assert.throws(()=>step(a,{serviceBrake:NaN}));assert.deepEqual(a,snapshot);
});
