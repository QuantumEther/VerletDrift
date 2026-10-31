import {createTerrainVehicle,respawnTerrain,stepTerrainVehicle} from '../src/vehicle.js';
import {engageDogs} from '../../tire-road-observatory-prototype/src/gearbox.js';
const duration=Number(process.env.STUDY_SECONDS||1),reports=[];
for(const scenario of ['starter','acceleration','steering','braking','handbrake','clutch','recontact'])for(const hz of [2000,1000,500,250,200,100]){
 const v=createTerrainVehicle({preset:'road',seed:42,amplitude:.001,roughness:.1});if(!respawnTerrain(v,v.terrainSettings).success)throw Error('respawn');
 const s=v.state;if(scenario!=='starter'){s.engine.mode='running';s.flywheel.omega=40;s.gearbox.q=.025;engageDogs(s,'1');s.flywheel.engagement=.3;}
 if(['braking','handbrake'].includes(scenario)){s.v=.5;s.wheels.forEach(w=>w.omega=.5/w.radius);}
 if(scenario==='recontact')s.vertical.q[3]=.35;
 const times=[],samples=[];let fault=null,residual=0,absoluteResidual=0,iterations=0,opened=false,recontact=false;
 for(let i=0;i<Math.round(duration*hz);i++){
  const t=i/hz;if(scenario==='clutch')v.state.flywheel.engagement=t<duration/2?.5:0;
  const ports={starter:scenario==='starter',throttle:['acceleration','steering'].includes(scenario)?.2:0,steer:scenario==='steering'?.01:0,serviceBrake:scenario==='braking'?.1:0,handbrake:scenario==='handbrake'?.1:0};
  const start=performance.now();try{stepTerrainVehicle(v,ports,1/hz);}catch(e){fault={time:v.state.time,message:e.message,candidate:e.candidate};break;}
  times.push(performance.now()-start);const q=v.state,r=Math.abs(q.terrainLedger.residual);residual=Math.max(residual,r);absoluteResidual+=r;iterations+=q.terrainLedger.contactIterations;if(q.wheels[0].normal===0)opened=true;else if(opened)recontact=true;
  if((i+1)%(hz/10)===0)samples.push({time:q.time,position:[q.planar.x,q.planar.y,q.planar.heading],velocity:[q.planar.u,q.planar.v,q.planar.r],omega:q.wheels.map(w=>w.omega),engine:q.flywheel.omega,engineMode:q.engine.mode,clutch:q.flywheel.state,gear:q.gearbox.selected,vertical:q.vertical.q,loads:q.wheels.map(w=>w.normal),slip:q.wheels.map(w=>[w.slipX,w.slipY,w.utilization]),heat:q.flywheel.heat,ledger:q.terrainLedger});
 }
 times.sort((a,b)=>a-b);reports.push({scenario,hz,duration,accepted:times.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:times[Math.floor(times.length*.95)],worstMs:times.at(-1),residual,absoluteResidual,iterations,opened,recontact,fault,samples});console.error(scenario,hz,fault?.message||'pass');
}
for(const r of reports){const reference=reports.find(x=>x.scenario===r.scenario&&x.hz===2000);r.errors=r.samples.map((s,i)=>{const ref=reference.samples[i];return ref?{time:s.time,position:Math.hypot(...s.position.map((x,j)=>x-ref.position[j])),velocity:Math.hypot(...s.velocity.map((x,j)=>x-ref.velocity[j])),suspension:Math.max(...s.vertical.map((x,j)=>Math.abs(x-ref.vertical[j]))),load:Math.max(...s.loads.map((x,j)=>Math.abs(x-ref.loads[j])))}:null;});}
console.log(JSON.stringify(reports,null,2));
