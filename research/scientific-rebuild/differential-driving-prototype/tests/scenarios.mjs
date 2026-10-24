import{createVehicle,stepVehicle,cornerForces}from '../src/vehicle.js';
const results=[];
for(const scenario of ['uniform','turn','asymmetric','unload'])for(const mode of ['independent','open','locked']){
 const s=createVehicle({mode,scenario});let peakDifference=0,minimumRL=Infinity,maxEnergyResidual=0;
 for(let i=0;i<2000;i++){stepVehicle(s,{drive:20,steer:scenario==='turn'?.3:0});peakDifference=Math.max(peakDifference,Math.abs(s.wheels[2].omega-s.wheels[3].omega));minimumRL=Math.min(minimumRL,s.wheels[2].normal);maxEnergyResidual=Math.max(maxEnergyResidual,Math.abs(s.drivetrain.energyResidual));}
 results.push({scenario,mode,time_s:s.time,speed_m_s:s.v,rear_rad_s:s.wheels.slice(2).map(w=>w.omega),output_Nm:s.drivetrain.outputs,peakDifference_rad_s:peakDifference,minimumRL_N:minimumRL,maxRotorEnergyResidual_J:maxEnergyResidual});
}
const s=createVehicle();s.v=5;s.wheels.forEach(w=>w.omega=5/w.radius);s.bump=1.3;let anomaly;
for(let i=0;i<2000;i++){stepVehicle(s);const f=cornerForces(s,s.corners[0]);if(f.normal===0&&!anomaly)anomaly={time_s:s.time,frontNormal_N:f.normal,rearPerWheel_N:cornerForces(s,s.corners[1]).normal/2,tireCompression_m:f.delta,frontHubVerticalVelocity_m_s:s.corners[0].vz,pitch_rad:s.pitch};}
console.log(JSON.stringify({configuration:'1 ms, 2 s; rear torque 20 Nm; turn steer .3 rad; support retract .5–1.0 s',results,anomaly},null,2));
