import{createVehicle,stepVehicle}from '../src/vehicle.js';import{movingSecond}from '../src/initial-state.js';import{selectorInputForce}from '../src/selector-input.js';
const results=[];
for(const blip of [false,true]){
 const s=movingSecond({mode:'open'});for(let i=0;i<250;i++){s.gearbox.driverForce=selectorInputForce(s.gearbox,new Set(['n']));stepVehicle(s);}
 s.gearbox.driverForce=0;if(blip){s.flywheel.engagement=1;for(let i=0;i<102;i++)stepVehicle(s,{drive:30});s.flywheel.engagement=0;}
 const before=s.gearbox.impactHeat,contacts=s.gearbox.impactCount;
 for(let i=0;i<3000;i++){s.gearbox.driverForce=120;stepVehicle(s);if(s.gearbox.selected==='1')break;}
 results.push({scenario:blip?'double-declutch':'missed-blip',actual:s.gearbox.selected,time_s:s.time,impactLoss_J:s.gearbox.impactHeat-before,contacts:s.gearbox.impactCount-contacts,engine_rad_s:s.flywheel.omega,input_rad_s:s.flywheel.transmissionSpeed});
}
for(const worn of [false,true])for(const hold of [false,true]){const s=createVehicle({worn});s.gearbox.driverForce=-120;for(let i=0;i<500;i++)stepVehicle(s);s.flywheel.engagement=1;for(let i=0;i<500;i++){s.gearbox.driverForce=hold?-120:0;stepVehicle(s,{drive:20});}results.push({worn,hold,actual:s.gearbox.selected,selector_m:s.gearbox.q,driverWork_J:s.gearbox.driverWork});}
console.log(JSON.stringify({step_s:.001,initial:'movingSecond: v=1.6 m/s; engine/input=10 rad/s; rear=5 rad/s; phase=1.86 rad',results},null,2));
