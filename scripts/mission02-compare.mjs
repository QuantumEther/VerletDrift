// Controlled model experiments, not real-world tire calibration.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resetTire, settleTire, lateralProbe, state, computeTireForces } from '../tests/helpers/tire-probe.js';
import { reset as resetChassis, observe, inertia } from '../tests/helpers/numerical-chassis.js';
import { mechanicalStep } from '../tests/helpers/mechanical-step.js';
import { tireGripLimit } from '../js/physics/tire-load.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = f => createHash('sha256').update(fs.readFileSync(new URL('../' + f, import.meta.url))).digest('hex');
const sourceFiles = ['js/state.js','js/main.js','js/physics/tires.js','js/physics/wheel.js','js/physics/tire-load.js',
  ...['tire-model.js','tire-config.js'].filter(f => fs.existsSync(new URL('../js/physics/' + f, import.meta.url))).map(f => 'js/physics/' + f)];
const report = { revision: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sourceFiles: Object.fromEntries(sourceFiles.map(f => [f,hash(f)])),
  curves: [], combined: [], loadSweep: [], transients: [], handling: [] };
for (const load of [1000,2943,6000]) for (const peak of [2,8,20]) {
  for (const angle of [.01,.1,.15,.5,1,2,4,6,8,10,12,16,20,30,45,60,80]) {
    const out=lateralProbe(angle,{peakSlipAngleDeg:peak},load);
    report.curves.push({axis:'lateral',load,peak,input:angle,alpha:out.alpha,kappa:out.kappa,fx:out.wheel.fx,fy:out.wheel.fy,sat:out.sat});
  }
}
for (const ratio of [.5,.85,1]) for (const angle of [8,12,16,24,40,80]) {
  const out=lateralProbe(angle,{tireSlidingFrictionRatio:ratio});
  report.curves.push({axis:'sliding',ratio,input:angle,fx:out.wheel.fx,fy:out.wheel.fy});
}
for (const peak of [.05,.12,.3]) for (const kappa of [-1,-.5,-.3,-.24,-.16,-.12,-.09,-.06,-.03,-.013,-.005,-.0022,0,.0022,.005,.013,.03,.06,.09,.12,.16,.24,.3,.5,.9]) {
  const surface = kappa >= 0 ? 20/(1-kappa) : 20*(1+kappa);
  resetTire({omega:surface/.35,params:{peakSlipRatio:peak},frozen:true});
  const out=settleTire();report.curves.push({axis:'longitudinal',peak,input:kappa,alpha:out.alpha,kappa:out.kappa,fx:out.wheel.fx,fy:out.wheel.fy});
}
for (const kappa of [-1,-.12,0,.12,.9]) for (const angle of [-60,-8,0,8,60]) {
  const vlat=20*Math.tan(angle*Math.PI/180),surface=kappa>=0?20/(1-kappa):20*(1+kappa);
  resetTire({lateral:vlat,omega:surface/.35,frozen:true});const out=settleTire();
  report.combined.push({kappa,angle,fx:out.wheel.fx,fy:out.wheel.fy,
    power:out.wheel.fx*vlat-out.wheel.fy*(20-surface),bound:tireGripLimit(2943,1,2943,.12)});
}
for (const sensitivity of [0,.12,.3]) for (const load of [0,.000001,1,100,500,1000,2000,2943,4000,6000,12000]) {
  const out=lateralProbe(8,{tireLoadSensitivity:sensitivity},load);
  report.loadSweep.push({sensitivity,load,fx:out.wheel.fx,fy:out.wheel.fy,bound:tireGripLimit(load,1,2943,sensitivity)});
}
for (const speed of [0,.1,1,10,30]) for (const dt of [.02,.01,.005,.0025]) {
  resetTire({longitudinal:speed,lateral:.1,frozen:true});
  const trace=[];
  for(let i=0;i<Math.round(1/dt);i++) {
    if(i*dt>=.5)state.body.velocityX=-.1;
    const out=computeTireForces(dt); const f=state.wheelForces.frontLeft;
    trace.push({t:(i+1)*dt,fx:f.fx,fy:f.fy,history:{...state.prevTireForce.frontLeft},alpha:state.wheelSlipAngle.frontLeft,
      sat:state.steering.selfAligningTorque,power:f.fx*state.body.velocityX-f.fy*speed});
  }
  report.transients.push({speed,dt,trace});
}
const controls=JSON.parse(fs.readFileSync(new URL('../docs/physics-recovery/mission-01/audited-controls.json',import.meta.url),'utf8'));
for (const dt of [.02,.01,.005,.0025]) for (const maneuver of ['cornering','accel-turn','brake-turn','handbrake','countersteer','steering-release','rest-steering','slow-turn','pure-yaw','off-center-yaw','reverse','stop']) {
  const speed=maneuver==='steering-release'?1:maneuver==='rest-steering'||maneuver==='pure-yaw'?0:maneuver==='slow-turn'?.1:maneuver==='reverse'?-5:maneuver==='stop'?2:18;
  const yaw=['pure-yaw','off-center-yaw'].includes(maneuver)?2:maneuver==='countersteer'?.5:0;
  resetChassis({dt,vy:-speed,vx:maneuver==='countersteer'?5:0,omega:yaw,center:1000,params:controls});
  state.engine.currentGear='N';state.engine.clutchEngagement=0;
  const lock=maneuver==='steering-release'?.01:maneuver==='rest-steering'?.3: ['pure-yaw','stop'].includes(maneuver)?0:.22;
  state.steering.frontWheelAngle=lock;state.steering.wheelAngle=lock/state.params.maxFrontWheelAngle*Math.PI*2.5;
  for (const [n,w] of Object.entries(state.wheels)) state.wheelOmega[n]=(speed-yaw*(w.x-state.body.centerX))/state.params.wheelRadius;
  if(maneuver==='accel-turn') { state.engine.currentGear='2';state.engine.clutchEngagement=1; }
  const initial=observe();let last=initial,maxYaw=0,maxDelta=0,minLoad=Infinity,maxWorkResidual=0,maxWheelImpulseResidual=0,patchWork=0,positivePatchWork=0,bodyWork=0,rotorWork=0,driveAndBrakeWork=0,flips=0,sign=1;
  const samples=[],duration=['steering-release','rest-steering'].includes(maneuver)?10:3;
  for(let i=0;i<Math.round(duration/dt);i++) {
    const t=i*dt;
    state.steering.isDragging=!['steering-release','rest-steering'].includes(maneuver);
    if(maneuver==='countersteer'&&t>=1.5)state.steering.wheelAngle=-.22/state.params.maxFrontWheelAngle*Math.PI*2.5;
    state.input.handbrakeKeyHeld=maneuver==='handbrake'&&t>=.5&&t<.8;
    state.input.brakeKeyHeld=['brake-turn','stop'].includes(maneuver)&&t>=.5;
    state.input.throttleKeyHeld=maneuver==='accel-turn';
    const oldOmega={...state.wheelOmega},oldWheelEnergy=Object.values(oldOmega).reduce((s,w)=>s+.5*state.params.wheelInertia*w*w,0);
    mechanicalStep(dt);
    const next=observe(),wheelEnergy=Object.values(state.wheelOmega).reduce((s,w)=>s+.5*state.params.wheelInertia*w*w,0);
    let contactBody=0,contactRotor=0,externalRotor=0;
    for(const n of Object.keys(state.wheels)) {
      const f=state.wheelForces[n],k=state.wheelKinematics[n],R=state.params.wheelRadius;
      const lon=f.fx*k.wheelForwardX+f.fy*k.wheelForwardY;
      const midOmega=(oldOmega[n]+state.wheelOmega[n])/2;
      const bwork=dt*(f.fx*(last.vx+next.vx)/2+f.fy*(last.vy+next.vy)/2);
      // Add yaw work separately through r x F using the positions used by tires.
      contactBody+=bwork;
      contactRotor+=-R*lon*dt*midOmega;
      const p=dt*(f.fx*k.wheelVelX+f.fy*k.wheelVelY-R*lon*midOmega);
      patchWork+=p;positivePatchWork+=Math.max(0,p);
      const d=state.wheelContactDiagnostics?.[n];
      if(d) {
        maxWheelImpulseResidual=Math.max(maxWheelImpulseResidual,Math.abs(d.impulseResidual));
        externalRotor+=d.driveWork+d.brakeWork;
      }
    }
    // Tire yaw moment can be recovered from the body angular impulse after
    // subtracting unchanged explicit yaw damping (no boundary/sleep at high yaw).
    const I=inertia(),yawDampingTorque=-state.params.yawDamping*I*last.omega;
    const totalYawTorque=I*(next.omega-last.omega)/dt;
    contactBody+=(totalYawTorque-yawDampingTorque)*dt*(last.omega+next.omega)/2;
    bodyWork+=contactBody;rotorWork+=contactRotor;driveAndBrakeWork+=externalRotor;
    maxWorkResidual=Math.max(maxWorkResidual,Math.abs((wheelEnergy-oldWheelEnergy)-contactRotor-externalRotor));
    maxYaw=Math.max(maxYaw,Math.abs(next.omega));maxDelta=Math.max(maxDelta,Math.abs(state.steering.frontWheelAngle));
    minLoad=Math.min(minLoad,...Object.values(state.wheelLoads));
    const delta=state.steering.frontWheelAngle;if(Math.abs(delta)>1e-6){if(Math.sign(delta)!==sign)flips++;sign=Math.sign(delta);}
    if(i%Math.max(1,Math.round(.1/dt))===0||i===Math.round(duration/dt)-1)samples.push({t:(i+1)*dt,...next,delta,sat:state.steering.selfAligningTorque,loads:{...state.wheelLoads},wheelEnergy});
    if(![next.energy,delta,...Object.values(state.wheelOmega)].every(Number.isFinite))throw Error(maneuver+' nonfinite');
    last=next;
  }
  report.handling.push({dt,maneuver,initial,final:last,maxYaw,maxDelta,minLoad,flips,patchWork,positivePatchWork,bodyWork,rotorWork,driveAndBrakeWork,maxWorkResidual,maxWheelImpulseResidual,samples});
}
fs.writeFileSync(process.argv[2]||new URL('../docs/physics-recovery/mission-02/measurements.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
