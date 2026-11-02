import {candidateTerrainStep,cloneMechanical,sampleWheelTerrain,selectorSubsteps} from '../procedural-terrain/src/vehicle.js';
import {numericalSettings} from '../procedural-terrain/src/numerical-settings.js';
import {evaluateSuspension} from '../procedural-terrain/src/vertical.js';import {evaluateTerrainNormal} from '../procedural-terrain/src/normal-contact.js';
import {finishEngine} from '../tire-road-observatory-prototype/src/engine.js';import {GEOMETRY} from '../tire-road-observatory-prototype/src/gearbox.js';
import {stagePlanar} from './stage-adapter.js';import {createModel} from './model.js';import {solveJointMode} from './joint.js';
export function candidateJointStep(vehicle,ports={},h=.001,observer=null){
 if(selectorSubsteps(vehicle.state,h)>1)throw Error('Selector stop requires timestep subdivision');
 const start=sampleWheelTerrain(vehicle),nonflat=start.some(c=>Math.abs(c.height)>1e-12||Math.abs(c.normal[0])+Math.abs(c.normal[1])>1e-12||c.friction!==.9);
 if(!nonflat){vehicle.jointStats={delegatedFlat:true};return candidateTerrainStep(vehicle,ports,h,observer);}
 const numerics=numericalSettings(vehicle.numerics),model=createModel(vehicle,ports,h);model.initialStep=h;
 const attempts=[],modes=model.base.capacity>0?['locked',1,-1]:[0];let root=null,seed=null;
 for(const mode of modes){
  const trial=solveJointMode(model,mode,numerics,seed),speed=model.base.cj.reduce((s,a,i)=>s+a*trial.v[i],0),torque=trial.z.at(-1)/h;
  attempts.push({mode,slip:speed,torque,endpointWork:h*torque*speed,midpointWork:h*torque*(model.base.slipOld+speed)/2,stats:trial.stats});
  if((mode==='locked'?Math.abs(speed)<1e-8:mode===0||mode*speed>=-1e-9)&&h*torque*speed>=-1e-10){root=trial;root.mode=mode;break;}seed=trial;
 }
 if(!root)throw Object.assign(Error('Joint clutch/contact modes unresolved'),{joint:{attempts,...model.stats}});
 const q=cloneMechanical(model.preparedState),env=root.env;
 q.wheels.forEach((w,i)=>w.mu=env.samples[i].friction);
 q.gearbox.eventIterations=0;q.gearbox.lastAngularImpulse=0;q.gearbox.inputMomentumChange=0;q.gearbox.lastImpulse=0;q.gearbox.lastImpactEnergy=0;q.gearbox.contactForce=0;
 const contactIterations=attempts.reduce((s,a)=>s+a.stats.iterations,0);
 stagePlanar(q.planar,q.wheels,env.loads,q.mass+4*q.vertical.wheelMass,model.stageOptions(env,{state:q,modeOverride:root.mode,solver:()=>({z:[...root.z],velocity:[...root.v],iterations:contactIterations,residual:root.c.residual,prePolishResidual:root.c.residual})}),h,q.drivetrain,q.flywheel);
 q.flywheel.contactCandidates=attempts.map(({stats,...a})=>a);q.vertical.q=model.initial.vertical.q.map((a,i)=>a+h*q.vertical.v[i]);
 const after=evaluateSuspension(q.vertical),forceWork=h*env.reaction.reduce((s,f,i)=>s+f*root.v[i],0),potentialChange=after.springEnergy+after.gravityEnergy-model.before.springEnergy-model.before.gravityEnergy+env.U1-env.U0;
 const endpointContacts=sampleWheelTerrain({state:q,terrain:model.terrain}),pos=endpointContacts.map(c=>[...c.world,c.wheelHeight]),actualElastic=pos.reduce((s,p,i)=>s+evaluateTerrainNormal(model.terrain,p,q.wheels[i].radius,q.vertical.kt,endpointContacts[i]).elasticEnergy,0);
 const residual=q.planar.contact.energyResidual+forceWork+potentialChange+(actualElastic-env.U1)+env.damping,error=Math.max(...pos.flatMap((p,i)=>p.map((v,k)=>Math.abs(v-env.pos[i][k]))));
 if(!(error<numerics.positionTolerance&&env.identity<1e-9))throw Object.assign(Error('Joint endpoint/work check failed'),{candidate:{error,identity:env.identity,residual}});
 if(Math.abs(residual)>1e-7)throw Object.assign(Error('Terrain candidate energy mismatch'),{candidate:{accepted:false,residual,forceWork,potentialChange,damping:env.damping,error,vError:root.momentumError}});
 const initial=model.initial;if((q.gearbox.selected==='N'&&Math.abs(q.gearbox.q)>=GEOMETRY.mouth-1e-9)||(q.gearbox.selected!=='N'&&(Math.abs(q.gearbox.q)<GEOMETRY.release||q.gearbox.q*initial.gearbox.q<0)))throw Error('Terrain step crosses a gear event: subdivision is required');
 q.gearbox.lastStepCases=contactIterations;q.time+=h;q.z=q.vertical.q[0];q.vz=q.vertical.v[0];q.pitch=q.vertical.q[1];q.roll=q.vertical.q[2];q.pitchRate=q.vertical.v[1];q.rollRate=q.vertical.v[2];if(q.engine)finishEngine(q.engine,q.flywheel.omega,h);
 if(model.coefficients)q.planar.contact.tireStrategy=Object.freeze({id:model.strategy.id,corneringStiffness:model.strategy.corneringStiffness,minSpeed:model.strategy.minSpeed,coefficients:model.coefficients});
 q.terrainLedger={contactIterations,normalWorkResidual:env.identity,endpointPositionError:error,endpointVelocityError:root.momentumError,residual,accumulatedResidual:(initial.terrainLedger?.accumulatedResidual||0)+residual,iterations:attempts.reduce((s,a)=>s+a.stats.iterations,0),forceWork,potentialChange,springChange:after.springEnergy-model.before.springEnergy,gravityChange:after.gravityEnergy-model.before.gravityEnergy,terrainChange:actualElastic-env.U0,damping:env.damping,numericalLoss:q.planar.contact.numericalLoss,elasticEnergy:actualElastic};
 vehicle.jointStats={...model.stats,attempts:attempts.map(a=>({mode:a.mode,...a.stats})),fistaIterations:0,contactResidual:root.c.residual,momentumError:root.momentumError};
 if(vehicle.captureJoint)vehicle.captureJoint({problem:root.p,z:root.z,velocity:root.v});
 const accepted=observer?[{start:observer.capture(cloneMechanical(initial)),end:observer.capture(cloneMechanical(q)),h}]:[];
 return {state:q,contacts:endpointContacts,accepted,energyResidual:residual};
}
