import {createVehicle,stepVehicle} from '../../four-corner-load-transfer/src/combined-vehicle.js';
import {createTerrain} from './terrain.js';
import {evaluateSuspension} from './vertical.js';
import {discreteTerrainNormal,evaluateTerrainNormal} from './normal-contact.js';
import {terrainContactFrame} from './contact-frame.js';
import {stepPlanar} from './combined-planar.js';
import {advanceSteering,steeringJacobian} from '../../tire-road-observatory-prototype/src/steering.js';
import {prepareEngine,finishEngine} from '../../tire-road-observatory-prototype/src/engine.js';
import {GEOMETRY,selectorForces} from '../../tire-road-observatory-prototype/src/gearbox.js';
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
// Mechanical state consists of plain records and arrays. Preserve aliases and
// cycles, but avoid native structured-clone serialization on every iteration.
// Non-record extension data retains native cloning rather than being aliased.
function copyRecord(value,seen){
 if(value===null||typeof value!=='object'){
  if(typeof value==='function'||typeof value==='symbol')throw Error('Non-cloneable mechanical state');
  return value;
 }
 if(seen.has(value))return seen.get(value);
 const plain=Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null;
 if(!Array.isArray(value)&&!plain){const copy=structuredClone(value);seen.set(value,copy);return copy;}
 const copy=Array.isArray(value)?[]:{};seen.set(value,copy);
 for(const key of Object.keys(value))copy[key]=copyRecord(value[key],seen);
 return copy;
}
export function cloneMechanical(s){const c=copyRecord(s,new Map());Object.defineProperties(c,{x:{enumerable:true,get(){return this.planar.x;},set(v){this.planar.x=v;}},v:{enumerable:true,get(){return this.planar.u;},set(v){this.planar.u=v;}}});c.flywheel.gearbox=c.gearbox;return c;}
// One detached basis per candidate. Endpoint trials copy the records mutated
// by the inherited solver. Geometry/configuration and previous diagnostics are
// read-only within a trial; their owning basis is already isolated from callers.
// No basis/workspace survives across candidates, accepted or rejected.
function endpointTrial(base){
 const q={...base,vertical:{...base.vertical},planar:{...base.planar},
  wheels:base.wheels.map(w=>({...w})),gearbox:{...base.gearbox},
  drivetrain:{...base.drivetrain},steering:{...base.steering},
  flywheel:{...base.flywheel,actuator:base.flywheel.actuator?{...base.flywheel.actuator}:undefined}};
 if(base.engine)q.engine={...base.engine};
 Object.defineProperties(q,{x:{enumerable:true,get(){return this.planar.x;},set(v){this.planar.x=v;}},v:{enumerable:true,get(){return this.planar.u;},set(v){this.planar.u=v;}}});
 q.flywheel.gearbox=q.gearbox;return q;
}
function freezeRecords(value,seen=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return;
 seen.add(value);for(const child of Object.values(value))freezeRecords(child,seen);Object.freeze(value);
}
// Estimate the linear stop coefficients from the authoritative inherited law.
// No alternate selector force is applied here. Bare selector mass is conservative
// when a worn cam adds reflected inertia. Jury stability: h²*k/m+2*h*c/m<4.
// Also require h*c/m<1 so explicit viscous drag cannot reverse velocity alone.
const selectorStopCoefficients=[false,true].map(worn=>{
 const force=(q,v)=>selectorForces({selected:'1',worn,q,velocity:v,driverForce:0});
 const q=GEOMETRY.stop+.0001,f=force(q,0);
 return {k:-(force(q+.00001,0)-f)/.00001,c:-(force(q,.001)-f)/.001};
});
export function selectorSubsteps(state,h){
 if(!(Number.isFinite(h)&&h>0))throw Error('Invalid candidate timestep');
 const g=state.gearbox,{k,c}=selectorStopCoefficients[Number(!!g.worn)],m=g.selectorMass;
 if(!(m>0&&Number.isFinite(m)))throw Error('Invalid selector inertia');
 const safe=.9*Math.min(4*m/(Math.sqrt(c*c+4*k*m)+c),c>0?m/c:Infinity);
 if(h<=safe)return 1;
 const force=selectorForces({...g}),reach=Math.abs(g.q)+h*Math.abs(g.velocity)+h*h*Math.abs(force)/m;
 if(reach<GEOMETRY.stop&&!(g.worn&&g.selected==='2'))return 1;
 const count=Math.ceil(h/safe);
 if(count>16)throw Error('Selector stop subdivision limit exceeded');
 return count;
}
export function candidateTerrainStep(vehicle,ports={},h=.001,observer=null){
 if(selectorSubsteps(vehicle.state,h)>1)throw Error('Selector stop requires timestep subdivision');
 let lastMark=vehicle.profile?performance.now():0;
 const mark=vehicle.profile?name=>{const now=performance.now();vehicle.profile(name,now-lastMark);lastMark=now;}:null;
 const terrain=vehicle.terrain||createTerrain(vehicle.terrainSettings),context={...vehicle,terrain};
 const start=sampleWheelTerrain(context);
 const nonflat=start.some(c=>Math.abs(c.height)>1e-12||Math.abs(c.normal[0])+Math.abs(c.normal[1])>1e-12||c.friction!==.9);
 if(nonflat){
  const initial=vehicle.state,vs=initial.vertical;
  const begin=start.map(c=>[...c.world,c.wheelHeight]);
  const startContacts=begin.map((point,i)=>evaluateTerrainNormal(terrain,point,initial.wheels[i].radius,vs.kt));
  const before=evaluateSuspension(initial.vertical),co=Math.cos(initial.planar.heading),si=Math.sin(initial.planar.heading),sj=steeringJacobian(initial.steering);
  const pointRows=initial.wheels.map((w,i)=>{const rows=Array.from({length:3},()=>Array(18).fill(0));
    rows[0][7]=co;rows[0][8]=-si;rows[1][7]=si;rows[1][8]=co;rows[0][9]=-si*w.x-co*w.y;rows[1][9]=co*w.x-si*w.y;rows[0][12]=.5*co;rows[1][12]=.5*si;rows[0][13]=-.5*si;rows[1][13]=.5*co;rows[2][14+i]=1;
    if(i<2){const angle=i===0?initial.steering.leftAngle:initial.steering.rightAngle,t=initial.steering.dynamics.trail,dx=t*Math.sin(angle)*sj[i],dy=-t*Math.cos(angle)*sj[i];rows[0][10]=co*dx-si*dy;rows[1][10]=si*dx+co*dy;}
    return rows;
  });
  const basis=cloneMechanical(initial);
  if(vehicle.verifyIsolation)freezeRecords(basis);
  let guess=initial,guessPositions=begin,guessContacts=start,prior=null,lastConvergence=null,contactIterations=0;
  mark?.('setup');
  // Backward-Euler kinematics: q1=q0+h*v1. Linear spring forces use
  // endpoint-averaged compression (exact discrete spring gradient); damping
  // uses endpoint relative velocity. Terrain uses its discrete potential gradient.
  // Reject after 80 iterations; accept only at 1e-11 m, 1e-10 velocity,
  // 1e-9 J local-work and 1e-7 J full mechanical-ledger tolerances.
  for(let iteration=0;iteration<80;iteration++){
   const q=endpointTrial(basis);mark?.('trial-copy');
   const reaction=Array(18).fill(0),end=guessPositions,frames=[],loads=[];let U0=0,U1=0,identity=0,damping=0;
   reaction[11]=-vs.mass*vs.g;for(let i=0;i<4;i++)reaction[14+i]=-vs.wheelMass*vs.g;
   vs.corners.forEach(([x,y],i)=>{const compression=z=>vs.length-z[0]-x*z[1]-y*z[2]+z[3+i],rate=guess.vertical.v[0]+x*guess.vertical.v[1]+y*guess.vertical.v[2]-guess.vertical.v[3+i];const force=vs.ks*(compression(vs.q)+compression(guess.vertical.q))/2-vs.damping*rate;reaction[11]+=force;reaction[12]+=x*force;reaction[13]+=y*force;reaction[14+i]-=force;damping+=h*vs.damping*rate*rate;});
   q.wheels.forEach((w,i)=>{const contact=discreteTerrainNormal(terrain,begin[i],end[i],w.radius,vs.kt,startContacts[i],vehicle.disableTerrainCache?null:guessContacts[i]),sample=vehicle.disableTerrainCache?terrain.sample(end[i][0],end[i][1]):guessContacts[i],rows=pointRows[i];
    for(let j=0;j<18;j++)for(let k=0;k<3;k++)reaction[j]+=rows[k][j]*contact.force[k];
    const angle=i===0?q.steering.leftAngle:i===1?q.steering.rightAngle:0;frames.push(terrainContactFrame(sample,initial.planar.heading+angle,rows,i,w.radius));loads.push(Math.hypot(...contact.force));w.mu=sample.friction;U0+=contact.energyBefore;U1+=contact.energyAfter;identity=Math.max(identity,Math.abs(contact.residual));
   });
   mark?.('terrain-and-reactions');
   q.gearbox.eventIterations=0;q.gearbox.lastAngularImpulse=0;q.gearbox.inputMomentumChange=0;q.gearbox.lastImpulse=0;q.gearbox.lastImpactEnergy=0;q.gearbox.contactForce=0;
   const angles=advanceSteering(q.steering,(ports.steer||0)/.4,h);q.brakes=brakeActuation(ports.serviceBrake||0,ports.handbrake||0);let drive=ports.drive||0;if(q.engine)drive=prepareEngine(q.engine,q.flywheel.omega,{throttle:ports.throttle||0,starter:ports.starter||false},h);
   // A prior endpoint impulse is only an optimization seed. Original physical
   // velocities/inertia remain intact and the same KKT/work gates still apply.
   if(guess!==initial){q.planar.contactImpulse=guess.planar.contactImpulse;q.planar.contactImpulseH=guess.planar.contactImpulseH;}
   stepPlanar(q.planar,q.wheels,loads,q.mass+4*vs.wheelMass,{...ports,drive,steeringAngles:angles,steeringSystem:q.steering,verticalState:q.vertical,terrainFrames:frames,normalReaction:reaction,brakeMechanism:q.brakes},h,q.drivetrain,q.flywheel);
   contactIterations+=q.planar.contact.iterations;
   mark?.('unified-solve');
   q.vertical.q=vs.q.map((v,i)=>v+h*q.vertical.v[i]);
   const after=evaluateSuspension(q.vertical),velocity=[...q.wheels.map(w=>w.omega),q.gearbox.velocity,q.flywheel.omega,q.gearbox.neutralOmega||0,co*q.planar.u+si*q.planar.v,-si*q.planar.u+co*q.planar.v,q.planar.r,q.steering.angularVelocity,...q.vertical.v];
   // Use pre-yaw-rotation body velocities for the impulse-work identity.
   const turn=q.planar.heading-initial.planar.heading;velocity[7]=Math.cos(turn)*q.planar.u-Math.sin(turn)*q.planar.v;velocity[8]=Math.sin(turn)*q.planar.u+Math.cos(turn)*q.planar.v;
   const forceWork=h*reaction.reduce((n,f,i)=>n+f*velocity[i],0),potentialChange=after.springEnergy+after.gravityEnergy-before.springEnergy-before.gravityEnergy+U1-U0;
   const endpointContacts=sampleWheelTerrain({...context,state:q}),pos=endpointContacts.map(c=>[...c.world,c.wheelHeight]),actualElastic=pos.reduce((sum,point,i)=>sum+evaluateTerrainNormal(terrain,point,q.wheels[i].radius,vs.kt,vehicle.disableTerrainCache?null:endpointContacts[i]).elasticEnergy,0);
   const residual=q.planar.contact.energyResidual+forceWork+potentialChange+(actualElastic-U1)+damping;
   const error=Math.max(...pos.flatMap((r,i)=>r.map((v,k)=>Math.abs(v-end[i][k])))),vError=prior?Math.max(...velocity.map((v,i)=>Math.abs(v-prior[i]))):Infinity;
   lastConvergence={iterations:iteration+1,error,vError,identity,residual};
   mark?.('energy-and-endpoint');
   if(error<1e-11&&vError<1e-10&&identity<1e-9){
    if(Math.abs(residual)>1e-7)throw Object.assign(Error('Terrain candidate energy mismatch'),{candidate:{accepted:false,residual,forceWork,potentialChange,damping,error,vError}});
    if((q.gearbox.selected==='N'&&Math.abs(q.gearbox.q)>=GEOMETRY.mouth-1e-9)||(q.gearbox.selected!=='N'&&(Math.abs(q.gearbox.q)<GEOMETRY.release||q.gearbox.q*initial.gearbox.q<0)))throw Error('Terrain step crosses a gear event: subdivision is required');
    q.gearbox.lastStepCases=contactIterations;
    q.time+=h;q.z=q.vertical.q[0];q.vz=q.vertical.v[0];q.pitch=q.vertical.q[1];q.roll=q.vertical.q[2];q.pitchRate=q.vertical.v[1];q.rollRate=q.vertical.v[2];if(q.engine)finishEngine(q.engine,q.flywheel.omega,h);
    q.terrainLedger={contactIterations,normalWorkResidual:identity,endpointPositionError:error,endpointVelocityError:vError,residual,accumulatedResidual:(initial.terrainLedger?.accumulatedResidual||0)+residual,iterations:iteration+1,forceWork,potentialChange,springChange:after.springEnergy-before.springEnergy,gravityChange:after.gravityEnergy-before.gravityEnergy,terrainChange:actualElastic-U0,damping,numericalLoss:q.planar.contact.numericalLoss,elasticEnergy:actualElastic};
    const accepted=observer?[{start:observer.capture(cloneMechanical(initial)),end:observer.capture(cloneMechanical(q)),h}]:[];
    return {state:q,contacts:endpointContacts,accepted,energyResidual:residual};
   }
   guess=q;guessPositions=pos;guessContacts=endpointContacts;prior=velocity;
  }
  throw Object.assign(Error('Terrain endpoint iteration failed to converge'),{candidate:lastConvergence});

 }
 const trial={...context,state:cloneMechanical(vehicle.state)},accepted=[];
 const proxy=observer?{capture:s=>observer.capture(cloneMechanical(s)),accept:ss=>accepted.push(...structuredClone(ss))}:null;
 stepVehicle(trial.state,ports,h,proxy);
 if(!Number.isFinite(trial.state.planar.contact.energyResidual)||Math.abs(trial.state.planar.contact.energyResidual)>1e-7)throw Error('Candidate contact energy check failed');
 trial.contacts=sampleWheelTerrain(trial);
 return {state:trial.state,contacts:trial.contacts,accepted,energyResidual:trial.state.planar.contact.energyResidual};
}
export function stepTerrainVehicle(vehicle,ports={},h=.001,observer=null){
 let count;
 try{count=selectorSubsteps(vehicle.state,h);}catch(error){error.integration={requestedH:h,attemptedSubsteps:0,publishedSubsteps:0};throw error;}
 if(count===1){
  const candidate=candidateTerrainStep(vehicle,ports,h,observer);
  vehicle.state=candidate.state;vehicle.contacts=candidate.contacts;
  vehicle.integration={substeps:1,requestedH:h,internalH:h,energyResidual:candidate.energyResidual,absoluteEnergyResidual:Math.abs(candidate.energyResidual)};
  if(observer)observer.accept(candidate.accepted);
  return vehicle;
 }
 const innerH=h/count,staged={...vehicle},accepted=[];
 const sumFields=['residual','forceWork','potentialChange','springChange','gravityChange','terrainChange','damping','numericalLoss','iterations','contactIterations','normalWorkResidual'];
 const totals=Object.fromEntries(sumFields.map(k=>[k,0]));let energyResidual=0,absoluteEnergyResidual=0,cases=0,searches=0;
 let attempted=0;
 try{for(let i=0;i<count;i++){
  attempted++;
  const candidate=candidateTerrainStep(staged,ports,innerH,observer);
  staged.state=candidate.state;staged.contacts=candidate.contacts;accepted.push(...candidate.accepted);
  energyResidual+=candidate.energyResidual;absoluteEnergyResidual+=Math.abs(candidate.energyResidual);cases+=staged.state.gearbox.lastStepCases||0;searches+=staged.state.gearbox.eventIterations||0;
  if(staged.state.terrainLedger)for(const key of sumFields)totals[key]+=staged.state.terrainLedger[key]||0;
 }
 }catch(error){error.integration={requestedH:h,plannedSubsteps:count,attemptedSubsteps:attempted,publishedSubsteps:0};throw error;}
 if(absoluteEnergyResidual>1e-7||totals.normalWorkResidual>1e-9)throw Object.assign(Error('Subdivided terrain work check failed'),{candidate:{residual:energyResidual,absoluteEnergyResidual,normalWorkResidual:totals.normalWorkResidual},integration:{requestedH:h,plannedSubsteps:count,attemptedSubsteps:count,publishedSubsteps:0}});
 if(count>1){
  if(staged.state.terrainLedger)Object.assign(staged.state.terrainLedger,totals,{internalSubsteps:count});
  staged.state.gearbox.lastStepCases=cases;staged.state.gearbox.eventIterations=searches;
 }
 vehicle.state=staged.state;vehicle.contacts=staged.contacts;
 vehicle.integration={substeps:count,requestedH:h,internalH:innerH,energyResidual,absoluteEnergyResidual};
 if(observer)observer.accept(accepted);
 return vehicle;
}

// Entire-vehicle respawn, not preservation of a loaded/running drivetrain.
// Curved-terrain initialization is a declared transient, not static equilibrium.
export function respawnTerrain(vehicle,settings,history=null,terrainOverride=null){
 try{
  const next=createTerrainVehicle(settings);if(terrainOverride)next.terrain=terrainOverride;const vs=next.state.vertical,heights=sampleWheelTerrain(next).map(c=>c.height),base=vs.q.slice();
  vs.q[0]+=heights.reduce((a,b)=>a+b,0)/4;
  vs.q[1]=heights.reduce((a,z,i)=>a+z*vs.corners[i][0],0)/vs.corners.reduce((a,[x])=>a+x*x,0);
  vs.q[2]=heights.reduce((a,z,i)=>a+z*vs.corners[i][1],0)/vs.corners.reduce((a,[,y])=>a+y*y,0);
  for(let i=0;i<4;i++)vs.q[3+i]=base[3+i]+heights[i];
  next.state.z=vs.q[0];next.state.pitch=vs.q[1];next.state.roll=vs.q[2];
  // Validate private advancement before publishing the respawn. Validation
  // time/history does not become part of the returned initial state.
  const balance=wrapper=>{
   const st=wrapper.state,e=evaluateSuspension(st.vertical),forces=[...e.force],terrain=wrapper.terrain||createTerrain(wrapper.terrainSettings);let elastic=0;
   for(const c of sampleWheelTerrain(wrapper)){const n=evaluateTerrainNormal(terrain,[...c.world,c.wheelHeight],st.wheels[c.wheel].radius,st.vertical.kt);elastic+=n.elasticEnergy;forces[3+c.wheel]+=n.force[2];forces[1]+=.5*n.force[0];forces[2]+=.5*n.force[1];}
   return {generalizedVerticalForces:forces,maxResidual:Math.max(...forces.map(Math.abs)),energy:e.energy+elastic,tireElasticEnergy:elastic};
  };
  const initialBalance=balance(next),probe={...next,state:cloneMechanical(next.state)};let maxEnergyResidual=0,maxIterations=0;
  for(let i=0;i<100;i++){stepTerrainVehicle(probe);maxEnergyResidual=Math.max(maxEnergyResidual,Math.abs(probe.state.terrainLedger?.residual||0));maxIterations=Math.max(maxIterations,probe.state.terrainLedger?.iterations||0);}
  const afterValidationBalance=balance(probe);
  const contacts=sampleWheelTerrain(next);history?.clear();
  vehicle.state=next.state;vehicle.terrainSettings=next.terrainSettings;if(terrainOverride)vehicle.terrain=terrainOverride;else delete vehicle.terrain;vehicle.contacts=contacts;
  return {success:true,validatedSteps:100,initialBalance,afterValidationBalance,maxEnergyResidual,maxIterations};
 }catch(error){return {success:false,message:error.message};}
}
