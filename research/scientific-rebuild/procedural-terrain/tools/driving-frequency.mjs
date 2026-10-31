import {reducedKineticEnergy} from '../src/diagnostics.js';
import {evaluateSuspension} from '../src/vertical.js';
import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
const duration=Number(process.env.STUDY_SECONDS||1),reports=[];
for(const scenario of (process.env.STUDY_CASES||'starter,acceleration,steering,braking,handbrake,clutch,recontact,incline,bump').split(','))for(const hz of (process.env.STUDY_HZ||'2000,1000,500,250,200,100').split(',').map(Number)){
 const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});const override=['incline','bump'].includes(scenario)?{sample:(x,y)=>{const a=.001*Math.exp(-((x-1)**2+(y-.6)**2)/.32),height=scenario==='incline'?.001*x:a,dx=scenario==='incline'?.001:-2*(x-1)*a/.32,dy=scenario==='incline'?0:-2*(y-.6)*a/.32,n=Math.hypot(dx,dy,1);return {height,gradient:[dx,dy],normal:[-dx/n,-dy/n,1/n],friction:.9,surface:'asphalt'};}}:null;if(!respawnTerrain(v,v.terrainSettings,null,override).success)throw Error('respawn');
 const s=v.state;if(!['starter','stationary','heave','pitch','roll','wheel-heave'].includes(scenario)){s.engine.mode='running';s.flywheel.omega=40;if(scenario!=='incline'){s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=.3;}}
 if(['braking','handbrake'].includes(scenario)){s.v=.5;s.wheels.forEach(w=>w.omega=.5/w.radius);}
 if(scenario==='incline')s.flywheel.engagement=0;
 if(scenario==='bump'){s.v=.5;s.wheels.forEach(w=>w.omega=.5/w.radius);}
 if(scenario==='wheel-heave')for(let i=3;i<7;i++)s.vertical.q[i]+=.001;
 if(scenario==='heave'){s.vertical.q[0]+=.01;s.z=s.vertical.q[0];}
 if(scenario==='pitch'){s.vertical.q[1]+=.005;s.pitch=s.vertical.q[1];}
 if(scenario==='roll'){s.vertical.q[2]+=.005;s.roll=s.vertical.q[2];}
 if(scenario==='recontact')s.vertical.q[3]=.35;
 const times=[],samples=[];let fault=null,residual=0,absoluteResidual=0,iterations=0,opened=false,recontact=false,dissipation=0,numericalLoss=0;
 for(let i=0;i<Math.round(duration*hz);i++){
  const t=i/hz;if(scenario==='clutch')v.state.flywheel.engagement=t<duration/2?.5:0;
  const ports={starter:scenario==='starter',throttle:['acceleration','steering'].includes(scenario)?.2:0,steer:scenario==='steering'?.01:0,serviceBrake:scenario==='braking'?.1:0,handbrake:scenario==='handbrake'?.1:0};
  const start=performance.now();try{stepTerrainVehicle(v,ports,1/hz);}catch(e){fault={time:v.state.time,message:e.message,candidate:e.candidate};break;}
  times.push(performance.now()-start);const q=v.state,r=Math.abs(q.terrainLedger.residual);residual=Math.max(residual,r);absoluteResidual+=r;iterations+=q.terrainLedger.contactIterations;const c=q.planar.contact;dissipation+=(c.tireDissipation+c.brakeDissipation+c.clutchEndPower+c.bearingEndPower+c.steeringLoss)/hz+q.terrainLedger.damping;numericalLoss+=q.terrainLedger.numericalLoss;if(q.wheels[0].normal===0)opened=true;else if(opened)recontact=true;
  if((i+1)%(hz/Number(process.env.STUDY_SAMPLE_HZ||10))===0)samples.push({kinetic:reducedKineticEnergy(q)+evaluateSuspension(q.vertical).kineticEnergy+.5*q.steering.dynamics.inertia*q.steering.angularVelocity**2,potential:evaluateSuspension(q.vertical).springEnergy+evaluateSuspension(q.vertical).gravityEnergy+q.terrainLedger.elasticEnergy,dissipation,numericalLoss,time:q.time,position:[q.planar.x,q.planar.y,q.planar.heading],velocity:[q.planar.u,q.planar.v,q.planar.r],omega:q.wheels.map(w=>w.omega),engine:q.flywheel.omega,engineMode:q.engine.mode,clutch:q.flywheel.state,gear:q.gearbox.selected,vertical:q.vertical.q,loads:q.wheels.map(w=>w.normal),slip:q.wheels.map(w=>[w.slipX,w.slipY,w.utilization]),heat:q.flywheel.heat,ledger:q.terrainLedger});
 }
 times.sort((a,b)=>a-b);reports.push({scenario,hz,duration,accepted:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.floor(times.length*.95)],worstMs:times.at(-1),residual,absoluteResidual,iterations,dissipation,numericalLoss,opened,recontact,fault,samples});console.error(scenario,hz,fault?.message||'pass');
}
for(const r of reports){const reference=reports.find(x=>x.scenario===r.scenario&&x.hz===Math.max(...reports.filter(y=>y.scenario===r.scenario).map(y=>y.hz)));r.errors=r.samples.map((s,i)=>{const ref=reference.samples[i];return ref?{time:s.time,position:Math.hypot(...s.position.map((x,j)=>x-ref.position[j])),velocity:Math.hypot(...s.velocity.map((x,j)=>x-ref.velocity[j])),suspension:Math.max(...s.vertical.map((x,j)=>Math.abs(x-ref.vertical[j]))),load:Math.max(...s.loads.map((x,j)=>Math.abs(x-ref.loads[j])))}:null;});}
for(const r of reports){const reference=reports.find(x=>x.scenario===r.scenario&&x.hz===Math.max(...reports.filter(y=>y.scenario===r.scenario).map(y=>y.hz)));r.componentErrors=r.samples.map((s,i)=>{const f=reference.samples[i];if(!f)return null;const max=(a,b)=>Math.max(...a.map((v,j)=>Math.abs(v-b[j])));return {time:s.time,positionMetres:max(s.position.slice(0,2),f.position.slice(0,2)),headingRad:Math.abs(s.position[2]-f.position[2]),velocityMetresPerSecond:max(s.velocity.slice(0,2),f.velocity.slice(0,2)),yawRate:Math.abs(s.velocity[2]-f.velocity[2]),wheelRadPerSecond:max(s.omega,f.omega),engineRadPerSecond:Math.abs(s.engine-f.engine),heightMetres:max([s.vertical[0],...s.vertical.slice(3)],[f.vertical[0],...f.vertical.slice(3)]),attitudeRad:max(s.vertical.slice(1,3),f.vertical.slice(1,3)),normalNewtons:max(s.loads,f.loads),kineticJoules:Math.abs(s.kinetic-f.kinetic),potentialJoules:Math.abs(s.potential-f.potential),dissipationJoules:Math.abs(s.dissipation-f.dissipation)};});}
console.log(JSON.stringify(reports,null,2));
