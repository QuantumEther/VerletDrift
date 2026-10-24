import{createVehicle,stepVehicle}from '../src/vehicle.js';import{stepPlanar}from '../src/planar.js';
const results=[];
for(const scenario of ['free','engage','static','overload','backdrive','turn'])for(const mode of ['open','locked']){
 const s=createVehicle({mode}),p=s.flywheel;
 p.engagement=scenario==='free'?0:scenario==='overload'?.1:1;
 if(scenario==='engage')p.omega=100;
 if(scenario==='backdrive')s.wheels[2].omega=s.wheels[3].omega=10;
 const motor=['engage','backdrive'].includes(scenario)?0:scenario==='overload'?100:20;
 for(let i=0;i<1000;i++)if(scenario==='turn')stepVehicle(s,{drive:motor,steer:.3});else stepPlanar(s.planar,s.wheels,[0,0,0,0],104,{drive:motor},.001,s.drivetrain,p);
 results.push({scenario,mode,engine_rad_s:p.omega,shaft_rad_s:p.transmissionSpeed,clutchState:p.state,torque_Nm:p.torque,heat_J:p.heat,rear_rad_s:s.wheels.slice(2).map(w=>w.omega)});
}
console.log(JSON.stringify({step_s:.001,duration_s:1,ratio:4,results},null,2));
