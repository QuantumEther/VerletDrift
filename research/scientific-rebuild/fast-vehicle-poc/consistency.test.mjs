import {test} from 'node:test';import assert from 'node:assert/strict';
import {create,step,energy,P,normalGradient,contactForces} from './consistent-model.js';import {evaluateVehicle} from './model.js';
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`),run=(s,input,t=1,h=.001)=>{for(let i=0;i<Math.round(t/h);i++)step(s,typeof input==='function'?input(i*h):input,h);return s;};
function independentEnergy(s,y){const q=y.slice(6,13),w=y.slice(13,20),v=s.vertical;let E=.5*104*(y[3]**2+y[4]**2)+.5*60*y[5]**2+.5*.3*y[24]**2+80*9.81*q[0];const mass=[80,45,20,6,6,6,6];for(let i=0;i<7;i++)E+=.5*mass[i]*w[i]**2;for(let i=0;i<4;i++){const [x,z]=v.corners[i],compression=.6-(q[0]+x*q[1]+z*q[2]-q[3+i]);E+=.5*2000*compression**2+.5*20000*Math.max(0,.32-q[3+i])**2+6*9.81*q[3+i]+.5*y[20+i]**2;}return E;}
test('unilateral support secant matches independent spring-energy differences',()=>{
 for(const a of [.28,.30,.32,.34,.36])for(const b of [.28,.30,.32,.34,.36]){const N=normalGradient(a,b,.32,20000),U=z=>10000*Math.max(0,.32-z)**2;assert.ok(N>=0);close(U(b)-U(a),-N*(b-a),1e-12);if(a>=.32&&b>=.32)assert.equal(N,0);}
 close(normalGradient(.34,.30,.32,20000),100,1e-10); // midpoint penetration is zero; average support is not.
});
test('tire transcription matches unchanged law; analytical combined slip and zero support',()=>{
 const s=create({speed:5,lateral:1,yaw:.1});s.y[2]=.3;s.y[14]=.04;s.y[15]=-.07;const old=evaluateVehicle(s,s.y,{steer:.08}),tires=contactForces(s.vertical.corners,old.tires.map(t=>t.N),[s.y[3],s.y[4],s.y[5],s.y[14],s.y[15]],s.y.slice(20,25),s.y[2],.08);tires.forEach((t,i)=>{close(t.fx,old.tires[i].fx,1e-12);close(t.fy,old.tires[i].fy,1e-12);});
 const r=contactForces([[0,0],[0,0]],[100,0],[1,2,0,0,0],[0,0],0,0);close(r[0].fx,-90/Math.sqrt(5));close(r[0].fy,-180/Math.sqrt(5));assert.ok(r[1].fx===0&&r[1].fy===0);
});
test('body, yaw, vertical and rotor impulses use one shared force stage',()=>{
 const s=create({speed:5,lateral:.3,yaw:.1}),old=s.y.slice(),h=.001;step(s,{steer:.08,serviceBrake:.1,clutch:.6},h);const n=s.y,k=s.consistency,R=s.constraints;let fx=0,fy=0,mz=0;
 for(let i=0;i<4;i++){const a=i<2?.08:0,[X,Y]=k.forces[i],x=Math.cos(a)*X-Math.sin(a)*Y,y=Math.sin(a)*X+Math.cos(a)*Y;fx+=x;fy+=y;mz+=s.vertical.corners[i][0]*y-s.vertical.corners[i][1]*x;close(n[20+i]-old[20+i],-h*.32*X+(i>=2?1.75*R.clutchImpulse:0)-R.brakeImpulse[i],1e-12);}
 close(104*(n[3]-old[3]),h*(Math.cos(k.heading)*fx-Math.sin(k.heading)*fy));close(104*(n[4]-old[4]),h*(Math.sin(k.heading)*fx+Math.cos(k.heading)*fy));close(60*(n[5]-old[5]),h*mz);close(.3*(n[24]-old[24]),h*k.engineTorque-R.clutchImpulse,1e-12);
 for(const i of [0,1,2])close(n[i]-old[i],h*(old[3+i]+n[3+i])/2,1e-12);
 const q=old.slice(6,13).map((x,i)=>(x+n[6+i])/2),v=old.slice(13,20).map((x,i)=>(x+n[13+i])/2),f=[-80*9.81,0,0,...Array(4).fill(-6*9.81)],mass=[80,45,20,6,6,6,6];
 for(let i=0;i<4;i++){const [x,z]=s.vertical.corners[i],rate=v[0]+x*v[1]+z*v[2]-v[3+i],F=2000*(.6-q[0]-x*q[1]-z*q[2]+q[3+i])-80*rate;f[0]+=F;f[1]+=x*F;f[2]+=z*F;f[3+i]+=k.normal[i]-F;}
 f[1]+=.5*fx;f[2]+=.5*fy;for(let i=0;i<7;i++){close(mass[i]*(n[13+i]-old[13+i]),h*f[i],1e-11);close(n[6+i]-old[6+i],h*v[i],1e-12);}
});
test('independent energy/work balance; no computed residual is added to work',()=>{
 const s=create({speed:5,lateral:1}),old=s.y.slice(),h=.001;step(s,{steer:.1,handbrake:.3,clutch:1},h);const k=s.consistency,r=s.constraints,n=s.y;const contacts=contactForces(s.vertical.corners,k.normal,[k.bodyAverage[0],k.bodyAverage[1],k.bodyAverage[2],k.bodyAverage[4],k.bodyAverage[5]],k.rotorAverage,k.heading,.1);
 let tire=0,damping=0;for(let i=0;i<4;i++){tire+=h*(k.forces[i][0]*contacts[i].sx+k.forces[i][1]*contacts[i].sy);const [x,z]=s.vertical.corners[i],v=k.bodyAverage.slice(3),rate=v[0]+x*v[1]+z*v[2]-v[3+i];damping+=h*80*rate*rate;assert.ok(Math.hypot(...k.forces[i])<=.9*k.normal[i]+2e-11);}
 const work=[k.engineTorque*r.integral[4],tire,-r.brakeHeat,-r.clutchHeat,-damping];for(let i=0;i<5;i++)close(n[25+i]-old[25+i],work[i],1e-12);close(independentEnergy(s,n)-independentEnergy(s,old),work.reduce((a,x)=>a+x,0),1e-10);assert.ok(tire<=1e-12);
});
test('brake holding/release and exact clutch locking survive shared-stage closure',()=>{
 const s=run(create({engine:0}),{starter:true,clutch:1,serviceBrake:1},1);assert.deepEqual(s.y.slice(20,25),[0,0,0,0,0]);close(s.y[0],0,1e-25);assert.equal(s.constraints.clutchMode,'locked');run(s,{starter:true,clutch:1},.5);assert.ok(s.y[3]>0);assert.equal(s.y[24],1.75*(s.y[22]+s.y[23]));
 const b=run(create({speed:5,engine:0}),{ignition:false,clutch:0,handbrake:1},.4);assert.equal(b.y[22],0);assert.equal(b.y[23],0);assert.equal(b.constraints.brakeModes[0],'open');
});
test('braking, recovery and recontact: finite, dissipative, machine-scale work closure',()=>{
 for(const name of ['braking','recovery','recontact']){const s=create({speed:name==='recontact'?0:5,lateral:name==='recovery'?1:0,engine:0});if(name==='recontact')s.y[9]=.35;const E=energy(s);let residual=0;for(let i=0;i<1000;i++){step(s,{ignition:false,clutch:0,serviceBrake:name==='braking'?1:0,steer:name==='recovery'?(i<400?.05:-.03):0},.001);residual=Math.max(residual,Math.abs(energy(s)-E-s.y.slice(25).reduce((a,x)=>a+x,0)));assert.ok(s.consistency.contactWork<=1e-12);assert.ok(s.y.every(Number.isFinite));}console.log(name,'max cumulative energy error J',residual);assert.ok(residual<1e-8);if(name==='braking'){assert.ok(s.y[3]<.01);assert.ok(s.y.slice(20,24).every(w=>w===0));}}
});
test('matched-time timestep refinement for braking, recovery, contact and clutch transition',()=>{
 for(const name of ['braking','recovery','recontact','clutch']){const rows=[.001,.0005,.00025].map(h=>{const s=create({speed:name==='recontact'?0:5,lateral:name==='recovery'?1:0,engine:name==='clutch'?40:0});if(name==='recontact')s.y[9]=.35;run(s,t=>({ignition:name==='clutch',clutch:name==='clutch'?(t<.2?0:.6):0,serviceBrake:name==='braking'?1:0,steer:name==='recovery'?.05:0}),.4,h);return s;});const error=(a,b)=>Math.hypot(...a.y.slice(0,25).map((x,i)=>x-b.y[i]));console.log(name,'state refinement norms',error(rows[0],rows[2]),error(rows[1],rows[2]));assert.ok(error(rows[1],rows[2])<error(rows[0],rows[2]));}
});
test('bounded nonconvergence and invalid input roll back state, time and both diagnostics',()=>{
 const s=run(create({speed:5}),{throttle:.2},.01),saved=structuredClone(s);assert.throws(()=>step(s,{steer:.1},.001,{maxIterations:1}),/did not converge/);assert.deepEqual(s,saved);assert.throws(()=>step(s,{steer:NaN}));assert.deepEqual(s,saved);assert.throws(()=>step(s,{clutch:2}));assert.deepEqual(s,saved);
});
test('deterministic repeated drives retain exact lock without changing historical implementations',()=>{
 const input=t=>({steer:t<.2?.03:-.02,throttle:.2,clutch:t<.1?0:1}),a=run(create({speed:5}),input,.5),b=run(create({speed:5}),input,.5);assert.deepEqual(a,b);if(a.constraints.clutchMode==='locked')assert.equal(a.y[24],1.75*(a.y[22]+a.y[23]));
});

test('finite components with nonfinite kinetic energy are rejected transactionally',()=>{
 const s=create();s.y[3]=1e200;const snapshot=structuredClone(s);assert.throws(()=>step(s,{}),/Nonfinite mechanical energy/);assert.deepEqual(s,snapshot);
});
