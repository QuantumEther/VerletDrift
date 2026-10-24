import {readFileSync,writeFileSync} from 'node:fs';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const state=(await import('../../js/state.js')).default,physics=await import('../../js/physics/index.js'),constants=await import('../../js/constants.js');
const {readPlanarMotion}=await import('../../js/physics/planar-motion.js');
const parameters=JSON.parse(readFileSync('docs/engine-free-rev-data/parameters.json')).parameters;
const initial=structuredClone(state),dt=.01,rows=[];let current;
function energy(){
 const p=state.params,w=Object.values(state.wheels),x=w.reduce((s,w)=>s+w.x,0)/4,y=w.reduce((s,w)=>s+w.y,0)/4,px=w.reduce((s,w)=>s+w.prevX,0)/4,py=w.reduce((s,w)=>s+w.prevY,0)/4;
 const a=state.wheels.frontLeft,b=state.wheels.rearLeft;
 const theta=Math.atan2(a.y-b.y,a.x-b.x),old=Math.atan2(a.prevY-b.prevY,a.prevX-b.prevX);
 const omega=readPlanarMotion(dt).angularVelocity,I=p.carMassKg*(constants.CAR_HALF_LENGTH**2+constants.CAR_HALF_WIDTH**2)/3;
 return {chassis:.5*p.carMassKg*((x-px)**2+(y-py)**2)/dt**2+.5*I*omega**2,
  wheels:Object.values(state.wheelOmega).reduce((s,w)=>s+.5*p.wheelInertia*w*w,0),engine:.5*p.engineInertiaKgM2*(state.engine.omega||0)**2,
  input:.5*p.gearboxInputInertiaKgM2*(state.engine.inputOmega||0)**2,
  px:p.carMassKg*(x-px)/dt,py:p.carMassKg*(y-py)/dt,L:I*omega,
  pitch:state.suspension.pitch,roll:state.suspension.roll,heave:state.suspension.heave};
}
const env={...physics,state,...constants};
for(const name of ['updateSteering','updateEngine','updateSuspension','computeTireForces','synchronizeEngineWithWheels','verletIntegrateAllPoints','solveRigidBodyConstraints','handleBoundaryCollisions','computeBodyDerivedState','applySleepIfNeeded']){
 env[name]=(...args)=>{const before=energy(),result=physics[name](...args),after=energy();current.stages.push({name,before,after,deltaK:['chassis','wheels','engine','input'].reduce((s,k)=>s+after[k]-before[k],0)});return result;};
}
const source=readFileSync('js/main.js','utf8'),marker='function runPhysicsStep(dt) {',start=source.indexOf(marker)+marker.length,end=source.indexOf('  // 16. Camera:',start);
const step=new Function(...Object.keys(env),'dt',source.slice(start,end)).bind(null,...Object.values(env));
for(const spec of [{name:'coast',speed:15,gear:'N'},{name:'engaged-braking',speed:15,gear:'2'},{name:'turn',speed:15,gear:'2',steer:.15},{name:'wall',speed:15,gear:'N',wall:true}]){
 Object.assign(state,structuredClone(initial));Object.assign(state.params,parameters);physics.initializeCarBody(1000,spec.wall?2:1000);
 for(const w of Object.values(state.wheels))w.prevY=w.y+spec.speed*dt;
 physics.computeBodyDerivedState(dt);for(const k of Object.keys(state.wheelOmega))state.wheelOmega[k]=spec.speed/state.params.wheelRadius;
 const g=spec.gear==='N'?0:state.params.gearRatio2*state.params.finalDriveRatio;
 Object.assign(state.engine,{omega:g?g*spec.speed/state.params.wheelRadius:800*Math.PI/30,inputOmega:g*spec.speed/state.params.wheelRadius,currentGear:spec.gear,requestedGear:spec.gear,mode:'running',clutchPedalPosition:g?1:0,clutchEngagement:g?1:0});
 state.input.clutchKeyHeld=!g;state.steering.isDragging=true;state.steering.wheelAngle=(spec.steer||0)/state.params.maxFrontWheelAngle*Math.PI*2.5;
 for(let i=0;i<100;i++){current={scenario:spec.name,t:(i+1)*dt,stages:[]};step(dt);const p=state.params;
 current.tireWorkAtFrozenChassis=Object.keys(state.wheels).reduce((sum,n)=>{const f=state.wheelForces[n],k=state.wheelKinematics[n];return sum+(f.fx*k.wheelVelX+f.fy*k.wheelVelY)*dt;},0);
 current.brakePowerEndpointWork=Object.keys(state.wheelOmega).reduce((sum,n)=>sum+state.wheelBrakeTorque[n]*state.wheelOmega[n]*dt,0);
 const ms=p.carMassKg-4*p.unsprungMassPerWheel,sp=state.suspension,L=constants.CAR_HALF_LENGTH,W=constants.CAR_HALF_WIDTH;
 current.suspensionSmallAngleEnergy=.5*ms*sp.heaveVelocity**2+.5*ms*(L*L+.25*.25)/3*sp.pitchVelocity**2+.5*ms*(W*W+.25*.25)/3*sp.rollVelocity**2;
 for(const [x,y,k]of [[-L,-W,p.springRateFront],[-L,W,p.springRateFront],[L,-W,p.springRateRear],[L,W,p.springRateRear]])current.suspensionSmallAngleEnergy+=.5*k*(sp.heave+x*sp.pitch+y*sp.roll)**2;
 current.suspensionSmallAngleEnergy+=.5*(p.antiRollStiffnessFront+p.antiRollStiffnessRear)*sp.roll**2;
 const I=p.carMassKg*(L*L+W*W)/3,integrator=current.stages.find(s=>s.name==='verletIntegrateAllPoints');
 current.yawDampingWork=-p.yawDamping*integrator.before.L*(integrator.before.L+integrator.after.L)/(2*I)*dt;
 current.engineWork=state.engine.externalWorkJ;current.engineLoss=state.engine.dragWorkJ;current.clutchHeatCumulative=state.engine.clutchHeatJ;current.jointHeatCumulative=state.engine.frictionHeatJ;current.synchronizerHeatCumulative=state.engine.synchronizerHeatJ;rows.push(current);}
}
writeFileSync('research/full-system-forensic/data/ledger.json',JSON.stringify({dt,scope:'Mechanical kinetic energy from position history and shaft states; suspension coordinates retained but no claim of closed global energy ledger. ClutchHeat overlaps frictionHeat; never add both. Frozen chassis contact work and endpoint brake work are diagnostics, not exact total dissipation. Suspension energy is linear small-angle deviation energy excluding bump/droop potential; no closed coupled balance is asserted.',rows}));
