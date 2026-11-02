import {create,step,energy,evaluateVehicle,P} from './model.js';import {writeFile,mkdir} from 'node:fs/promises';
const cases={drive:{initial:{},input:{throttle:.2}},brake:{initial:{speed:5,engine:0},input:{ignition:false,clutch:0,serviceBrake:1}},steer:{initial:{speed:5},input:{throttle:.2,steer:.08}},recovery:{initial:{speed:5,lateral:1,yaw:-.1},input:{ignition:false,clutch:0}},recontact:{initial:{},input:{ignition:false,clutch:0},lift:true},handbrake:{initial:{speed:5,engine:0},input:{ignition:false,clutch:0,handbrake:.3}}};const rows=[];
for(const [name,f] of Object.entries(cases))for(const h of [.001,.0005,.00025]){
 const s=create(f.initial);if(f.lift)s.y[9]=.35;const E=energy(s);let maxContactPower=-Infinity,maxResidual=0,maxPitch=0,maxRoll=0,minN=Infinity,maxN=0,stop=null,prior=5,priorX=0,normalFront=0,normalRear=0;
 for(let i=0;i<Math.round(3/h);i++){
 step(s,f.input,h);const d=evaluateVehicle(s,s.y,f.input);maxContactPower=Math.max(maxContactPower,d.power[1]);maxResidual=Math.max(maxResidual,Math.abs(energy(s)-E-s.y.slice(25).reduce((a,x)=>a+x,0)));maxPitch=Math.max(maxPitch,Math.abs(s.y[7]));maxRoll=Math.max(maxRoll,Math.abs(s.y[8]));for(const t of d.tires){minN=Math.min(minN,t.N);maxN=Math.max(maxN,t.N);}if(name==='brake'&&stop===null&&prior>.01&&s.y[3]<=.01){const a=(prior-.01)/(prior-s.y[3]);stop={time:(i+a)*h,distance:priorX+a*(s.y[0]-priorX)};}prior=s.y[3];priorX=s.y[0];normalFront=d.tires[0].N+d.tires[1].N;normalRear=d.tires[2].N+d.tires[3].N;
 }
 rows.push({name,h,final:s.y.slice(0,25),maxContactPowerW:maxContactPower,maxWorkResidualJ:maxResidual,maxPitchRad:maxPitch,maxRollRad:maxRoll,minNormalN:minN,maxNormalN:maxN,finalFrontLoadN:normalFront,finalRearLoadN:normalRear,stop,finite:s.y.every(Number.isFinite)});
}
await mkdir(new URL('results',import.meta.url),{recursive:true});await writeFile(new URL('results/mechanical.json',import.meta.url),JSON.stringify({duration:3,units:'SI; mechanical model state layout in model.js',rows},null,2));
console.log(rows.map(r=>({name:r.name,h:r.h,energyError:r.maxWorkResidualJ,stop:r.stop,pitch:r.maxPitchRad,roll:r.maxRollRad})));
