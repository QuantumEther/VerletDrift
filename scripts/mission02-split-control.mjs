// Negative control: apply a prescribed-body contact solve to a freely moving
// chassis. This intentionally violates that option's fixture contract, to
// reproduce the numerical defect corrected by coupled contact integration.
import fs from 'node:fs';
import * as physics from '../js/physics/index.js';
import { CAR_HALF_LENGTH,CAR_HALF_WIDTH } from '../js/constants.js';
import { reset,state,inertia } from '../tests/helpers/numerical-chassis.js';
const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const marker='function runPhysicsStep(dt) {';
const begin=main.indexOf(marker)+marker.length,end=main.indexOf('  // 16. Camera:',begin);
const controls=JSON.parse(fs.readFileSync(new URL('../docs/physics-recovery/mission-01/audited-controls.json',import.meta.url),'utf8'));
const energy=()=>.5*state.params.carMassKg*state.body.speed**2+.5*inertia()*state.body.angularVelocity**2
 +Object.values(state.wheelOmega).reduce((s,w)=>s+.5*state.params.wheelInertia*w*w,0);
const results=[];
for(const split of [true,false]) {
 reset({dt:.02,vy:-.1,center:1000,params:controls});
 state.engine.currentGear='N';state.engine.clutchEngagement=0;
 state.steering.isDragging=true;state.steering.wheelAngle=.22/state.params.maxFrontWheelAngle*Math.PI*2.5;
 for(const n of Object.keys(state.wheelOmega))state.wheelOmega[n]=.1/.35;
 const env={...physics,state,CAR_HALF_LENGTH,CAR_HALF_WIDTH,
  computeTireForces:(dt,options)=>physics.computeTireForces(dt,{...options,prescribedBody:split})};
 const step=new Function(...Object.keys(env),'dt',main.slice(begin,end)).bind(null,...Object.values(env));
 const initial=energy(),trace=[];let maximum=initial;
 for(let i=0;i<150;i++) {step(.02);maximum=Math.max(maximum,energy());trace.push({t:(i+1)*.02,energy:energy()});}
 results.push({mode:split?'negative control: split/frozen body':'production coupled contacts',initial,final:energy(),maximum,trace});
}
fs.writeFileSync(process.argv[2]||new URL('../docs/physics-recovery/mission-02/split-contact-control.json',import.meta.url),JSON.stringify({note:'Model experiment, not a production preset. Includes unchanged drag, yaw damping and sleep.',results},null,2)+'\n');
console.log(results.map(({trace,...row})=>row));
