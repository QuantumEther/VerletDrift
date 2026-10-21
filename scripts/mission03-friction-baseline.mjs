// Run against the archived Mission 02 source, never against corrected steering.
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {reset,state} from '../tests/helpers/numerical-chassis.js';
import {updateSteering} from '../js/physics/steering.js';
const sourceHash=createHash('sha256').update(fs.readFileSync(new URL('../js/physics/steering.js',import.meta.url))).digest('hex');
if(sourceHash!==process.argv[3])throw Error('Expected the pinned legacy steering source hash');
const results=[];
for(const hz of [50,100,200,400]){
 const I=.08,C=2,b=.1,k=I*5,dt=1/hz;reset({params:{steeringColumnInertia:I,steeringCoulombFriction:C,steeringViscousDamping:b,steeringSelfCenterRate:5}});const s=state.steering;s.frontWheelAngle=.3;
 let frictionEndpointWork=0,positiveFrictionEndpointWork=0,frictionMidpointWork=0,positiveFrictionMidpointWork=0,viscousWork=0,maxEnergy=.5*k*.3**2,maxLateAngle=0,maxResidual=0,flips=0,rateFlips=0,sign=1,rateSign=0;
 for(let i=0;i<10*hz;i++){
  const a=s.frontWheelAngle,w=s.angularVelocity,E=.5*I*w*w+.5*k*a*a,net=-k*a-b*w,cf=C*Math.sign(w);
  const Qf=Math.abs(w)>.01 && (Math.sign(cf)!==Math.sign(net)||Math.abs(net)>Math.abs(cf)*2)?-cf:0;
  updateSteering(dt);const displacement=s.frontWheelAngle-a,Wf=Qf*displacement,Wv=-b*s.angularVelocity*displacement,Wmid=Qf*(w+s.angularVelocity)*dt*.5;
  frictionEndpointWork+=Wf;positiveFrictionEndpointWork+=Math.max(0,Wf);viscousWork+=Wv;frictionMidpointWork+=Wmid;positiveFrictionMidpointWork+=Math.max(0,Wmid);
  const nextE=.5*I*s.angularVelocity**2+.5*k*s.frontWheelAngle**2,discrete=-.5*I*(s.angularVelocity-w)**2+.5*k*displacement**2;
  maxResidual=Math.max(maxResidual,Math.abs(nextE-E-Wf-Wv-discrete));maxEnergy=Math.max(maxEnergy,nextE);
  if(i>=hz)maxLateAngle=Math.max(maxLateAngle,Math.abs(s.frontWheelAngle));
  if(Math.abs(s.frontWheelAngle)>1e-6){const sg=Math.sign(s.frontWheelAngle);if(sg!==sign)flips++;sign=sg;}
  if(Math.abs(s.angularVelocity)>1e-6){const sg=Math.sign(s.angularVelocity);if(rateSign&&sg!==rateSign)rateFlips++;rateSign=sg;}
 }
 results.push({hz,initialEnergy:.5*k*.3**2,finalAngle:s.frontWheelAngle,finalRate:s.angularVelocity,finalEnergy:.5*I*s.angularVelocity**2+.5*k*s.frontWheelAngle**2,maxEnergy,maxLateAngle,flips,rateFlips,frictionEndpointWork,positiveFrictionEndpointWork,frictionMidpointWork,positiveFrictionMidpointWork,viscousWork,maxResidual});
}
fs.writeFileSync(process.argv[2],JSON.stringify({sourceHash,results},null,2)+'\n');
