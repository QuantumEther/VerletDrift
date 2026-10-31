import {createVehicle,stepVehicle} from '../../four-corner-load-transfer/src/combined-vehicle.js';
import {createTerrain} from './terrain.js';
import {evaluateSuspension} from './vertical.js';
import {discreteTerrainNormal,evaluateTerrainNormal} from './normal-contact.js';
import {terrainContactFrame} from './contact-frame.js';
import {stepPlanar} from './combined-planar.js';
import {advanceSteering,steeringJacobian} from '../../tire-road-observatory-prototype/src/steering.js';
import {prepareEngine,finishEngine} from '../../tire-road-observatory-prototype/src/engine.js';
import {GEOMETRY} from '../../tire-road-observatory-prototype/src/gearbox.js';
import {brakeActuation} from '../../tire-road-observatory-prototype/src/brakes.js';
// Experiment-11 adapter. Geometry observations are external to the mechanical
// state so the inherited clone/rollback path never encounters sampler functions.
export function createTerrainVehicle(settings={},options={}){
 const terrain=createTerrain(settings);return {state:createVehicle(options),terrainSettings:{...terrain.settings},contacts:[]};
}
export function sampleWheelTerrain(vehicle){
 const s=vehicle.state,p=s.planar,t=vehicle.terrain||createTerrain(vehicle.terrainSettings),co=Math.cos(p.heading),si=Math.sin(p.heading);
 return s.wheels.map((w,i)=>{const angle=i===0?s.steering.leftAngle:i===1?s.steering.rightAngle:0,trail=i<2?s.steering.dynamics.trail:0,x=w.x+trail*(1-Math.cos(angle))+.5*s.vertical.q[1],y=w.y-trail*Math.sin(angle)+.5*s.vertical.q[2],world=[p.x+co*x-si*y,p.y+si*x+co*y];return {wheel:i,world,wheelHeight:s.vertical.q[3+i],...t.sample(...world)};});
}
// Trial state is private until acceptance, including diagnostic mutations made
// by the inherited gear-event path. Sampler settings remain plain cloneable data.
function cloneMechanical(s){const c=structuredClone(s);Object.defineProperties(c,{x:{enumerable:true,get(){return this.planar.x;},set(v){this.planar.x=v;}},v:{enumerable:true,get(){return this.planar.u;},set(v){this.planar.u=v;}}});c.flywheel.gearbox=c.gearbox;return c;}
export function candidateTerrainStep(vehicle,ports={},h=.001,observer=null){
 if(!(Number.isFinite(h)&&h>0))throw Error('Invalid candidate timestep');
 const trial={...vehicle,state:cloneMechanical(vehicle.state),contacts:structuredClone(vehicle.contacts)},accepted=[];
 const proxy=observer?{capture:s=>observer.capture(cloneMechanical(s)),accept:ss=>accepted.push(...structuredClone(ss))}:null;
 const start=sampleWheelTerrain(trial);
 const nonflat=start.some(c=>Math.abs(c.height)>1e-12||Math.abs(c.normal[0])+Math.abs(c.normal[1])>1e-12||c.friction!==.9);
 if(nonflat){
  const terrain=vehicle.terrain||createTerrain(vehicle.terrainSettings),initial=vehicle.state,vs=initial.vertical;
  const positions=s=>sampleWheelTerrain({...vehicle,state:s}).map((c,i)=>[...c.world,s.vertical.q[3+i]]),begin=positions(initial);let guess=cloneMechanical(initial),prior=null;
  // Backward-Euler kinematics: q1=q0+h*v1. Linear spring forces use
  // endpoint-averaged compression (exact discrete spring gradient); damping
  // uses endpoint relative velocity. Terrain uses its discrete potential gradient.
  // Reject after 80 iterations; accept only at 1e-11 m, 1e-10 velocity,
  // 1e-9 J local-work and 1e-7 J full mechanical-ledger tolerances.
  for(let iteration=0;iteration<80;iteration++){
   const q=cloneMechanical(initial),reaction=Array(18).fill(0),end=positions(guess),frames=[],loads=[];let U0=0,U1=0,identity=0,damping=0;
   reaction[11]=-vs.mass*vs.g;for(let i=0;i<4;i++)reaction[14+i]=-vs.wheelMass*vs.g;
   vs.corners.forEach(([x,y],i)=>{const compression=z=>vs.length-z[0]-x*z[1]-y*z[2]+z[3+i],rate=guess.vertical.v[0]+x*guess.vertical.v[1]+y*guess.vertical.v[2]-guess.vertical.v[3+i];const force=vs.ks*(compression(vs.q)+compression(guess.vertical.q))/2-vs.damping*rate;reaction[11]+=force;reaction[12]+=x*force;reaction[13]+=y*force;reaction[14+i]-=force;damping+=h*vs.damping*rate*rate;});
   const co=Math.cos(initial.planar.heading),si=Math.sin(initial.planar.heading),sj=steeringJacobian(initial.steering);
   q.wheels.forEach((w,i)=>{const contact=discreteTerrainNormal(terrain,begin[i],end[i],w.radius,vs.kt),sample=terrain.sample(end[i][0],end[i][1]),rows=Array.from({length:3},()=>Array(18).fill(0));
    rows[0][7]=co;rows[0][8]=-si;rows[1][7]=si;rows[1][8]=co;rows[0][9]=-si*w.x-co*w.y;rows[1][9]=co*w.x-si*w.y;rows[0][12]=.5*co;rows[1][12]=.5*si;rows[0][13]=-.5*si;rows[1][13]=.5*co;rows[2][14+i]=1;
    if(i<2){const angle=i===0?initial.steering.leftAngle:initial.steering.rightAngle,t=initial.steering.dynamics.trail,dx=t*Math.sin(angle)*sj[i],dy=-t*Math.cos(angle)*sj[i];rows[0][10]=co*dx-si*dy;rows[1][10]=si*dx+co*dy;}
    for(let j=0;j<18;j++)for(let k=0;k<3;k++)reaction[j]+=rows[k][j]*contact.force[k];
    const angle=i===0?q.steering.leftAngle:i===1?q.steering.rightAngle:0;frames.push(terrainContactFrame(sample,initial.planar.heading+angle,rows,i,w.radius));loads.push(Math.hypot(...contact.force));w.mu=sample.friction;U0+=contact.energyBefore;U1+=contact.energyAfter;identity=Math.max(identity,Math.abs(contact.residual));
   });
   q.gearbox.eventIterations=0;q.gearbox.lastAngularImpulse=0;q.gearbox.inputMomentumChange=0;q.gearbox.lastImpulse=0;q.gearbox.lastImpactEnergy=0;q.gearbox.contactForce=0;
   const angles=advanceSteering(q.steering,(ports.steer||0)/.4,h);q.brakes=brakeActuation(ports.serviceBrake||0,ports.handbrake||0);let drive=ports.drive||0;if(q.engine)drive=prepareEngine(q.engine,q.flywheel.omega,{throttle:ports.throttle||0,starter:ports.starter||false},h);
   stepPlanar(q.planar,q.wheels,loads,q.mass+4*vs.wheelMass,{...ports,drive,steeringAngles:angles,steeringSystem:q.steering,verticalState:q.vertical,terrainFrames:frames,normalReaction:reaction,brakeMechanism:q.brakes},h,q.drivetrain,q.flywheel);
   q.vertical.q=vs.q.map((v,i)=>v+h*q.vertical.v[i]);
   const after=evaluateSuspension(q.vertical),before=evaluateSuspension(initial.vertical),velocity=[...q.wheels.map(w=>w.omega),q.gearbox.velocity,q.flywheel.omega,q.gearbox.neutralOmega||0,co*q.planar.u+si*q.planar.v,-si*q.planar.u+co*q.planar.v,q.planar.r,q.steering.angularVelocity,...q.vertical.v];
   // Use pre-yaw-rotation body velocities for the impulse-work identity.
   const turn=q.planar.heading-initial.planar.heading;velocity[7]=Math.cos(turn)*q.planar.u-Math.sin(turn)*q.planar.v;velocity[8]=Math.sin(turn)*q.planar.u+Math.cos(turn)*q.planar.v;
   const forceWork=h*reaction.reduce((n,f,i)=>n+f*velocity[i],0),potentialChange=after.springEnergy+after.gravityEnergy-before.springEnergy-before.gravityEnergy+U1-U0;
   const actualElastic=positions(q).reduce((sum,point,i)=>sum+evaluateTerrainNormal(terrain,point,q.wheels[i].radius,vs.kt).elasticEnergy,0);
   const residual=q.planar.contact.energyResidual+forceWork+potentialChange+(actualElastic-U1)+damping;
   const pos=positions(q),error=Math.max(...pos.flatMap((r,i)=>r.map((v,k)=>Math.abs(v-end[i][k])))),vError=prior?Math.max(...velocity.map((v,i)=>Math.abs(v-prior[i]))):Infinity;
   if(error<1e-11&&vError<1e-10&&identity<1e-9){
    if(Math.abs(residual)>1e-7)throw Object.assign(Error('Terrain candidate energy mismatch'),{candidate:{accepted:false,residual,forceWork,potentialChange,damping,error,vError}});
    if((q.gearbox.selected==='N'&&Math.abs(q.gearbox.q)>=GEOMETRY.mouth-1e-9)||(q.gearbox.selected!=='N'&&Math.abs(q.gearbox.q)<GEOMETRY.release))throw Error('Terrain step crosses a gear event: subdivision is required');
    q.gearbox.lastStepCases=q.gearbox.lastSolveCases;
    q.time+=h;q.z=q.vertical.q[0];q.vz=q.vertical.v[0];q.pitch=q.vertical.q[1];q.roll=q.vertical.q[2];q.pitchRate=q.vertical.v[1];q.rollRate=q.vertical.v[2];if(q.engine)finishEngine(q.engine,q.flywheel.omega,h);
    q.terrainLedger={residual,accumulatedResidual:(initial.terrainLedger?.accumulatedResidual||0)+residual,iterations:iteration+1,forceWork,potentialChange,springChange:after.springEnergy-before.springEnergy,gravityChange:after.gravityEnergy-before.gravityEnergy,terrainChange:actualElastic-U0,damping,numericalLoss:q.planar.contact.numericalLoss,elasticEnergy:actualElastic};
    const accepted=observer?[{start:observer.capture(cloneMechanical(initial)),end:observer.capture(cloneMechanical(q)),h}]:[];
    return {state:q,contacts:sampleWheelTerrain({...vehicle,state:q}),accepted,energyResidual:residual};
   }
   guess=q;prior=velocity;
  }
  throw Error('Terrain endpoint iteration failed to converge');

 }
 stepVehicle(trial.state,ports,h,proxy);
 if(!Number.isFinite(trial.state.planar.contact.energyResidual)||Math.abs(trial.state.planar.contact.energyResidual)>1e-7)throw Error('Candidate contact energy check failed');
 trial.contacts=sampleWheelTerrain(trial);
 return {state:trial.state,contacts:trial.contacts,accepted,energyResidual:trial.state.planar.contact.energyResidual};
}
export function stepTerrainVehicle(vehicle,ports={},h=.001,observer=null){
 const candidate=candidateTerrainStep(vehicle,ports,h,observer);
 vehicle.state=candidate.state;vehicle.contacts=candidate.contacts;
 if(observer)observer.accept(candidate.accepted);
 return vehicle;
}
