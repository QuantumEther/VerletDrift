// Deliberately exposes a limitation: no rolling contact-patch renewal is modeled.
import {create,step,energy,totalWork} from './vehicle.js';
import {init,ports} from '../efficiency/fixtures.mjs';import {step as baselineStep} from '../consistent-model.js';
import {bristleFlow} from './bristle.js';import {writeFile} from 'node:fs/promises';
let z=[0,0],loss=0;const rows=[];
for(let i=0;i<20000;i++){const r=bristleFlow(z,[.001,0],250,.9,.001);z=r.next;loss+=r.viscous+r.plastic;if([99,999,4999,11999,19999].includes(i))rows.push({timeSeconds:(i+1)*.001,slipMS:.001,forceN:r.force[0],elasticJ:r.elasticAfter,dissipatedJ:loss,mode:r.mode});}
await writeFile(new URL('results/rolling-memory-limit.json',import.meta.url),JSON.stringify({meaning:'Prescribed constant slip at one lumped contact, NOT a driving trajectory. A dry elasto-plastic contact eventually reaches Coulomb yield even at tiny sustained slip. Pneumatic rolling-patch renewal and a calibrated slip-ratio curve are not implemented.',normalN:250,mu:.9,rows},null,2));console.log(rows);

const b=init('braking');let stop=null,oldSpeed=b.y[3],oldX=b.y[0],minimumSpeed=0;
for(let i=0;i<1000;i++){baselineStep(b,ports('braking',i*.001));if(stop===null&&oldSpeed>.01&&b.y[3]<=.01){const f=(oldSpeed-.01)/(oldSpeed-b.y[3]);stop={time:(i+f)*.001,distance:oldX+f*(b.y[0]-oldX)};}minimumSpeed=Math.min(minimumSpeed,b.y[3]);oldSpeed=b.y[3];oldX=b.y[0];}
await writeFile(new URL('results/baseline-braking.json',import.meta.url),JSON.stringify({meaning:'Untimed baseline 71cfb6c matched braking case',stop,minimumBodySpeedMS:minimumSpeed,final:b.y},null,2));

const rear=create({angle:5*Math.PI/180,engine:0}),initialEnergy=energy(rear);for(let i=0;i<5000;i++)step(rear,{ignition:false,clutch:1,handbrake:1});
await writeFile(new URL('results/rear-handbrake-hold.json',import.meta.url),JSON.stringify({duration:5,final:rear.y,forces:rear.consistency.forces,brakeModes:rear.constraints.brakeModes,energyWorkResidualJ:energy(rear)-initialEnergy-totalWork(rear)},null,2));
