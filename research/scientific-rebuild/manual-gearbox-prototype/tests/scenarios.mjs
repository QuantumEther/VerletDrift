import{createVehicle,stepVehicle}from '../src/vehicle.js';import{requestGear,armGear,shaftState}from '../src/gearbox.js';
const result=[];
for(const gear of ['1','2']){const s=createVehicle({mode:'open'});requestGear(s,'N');requestGear(s,gear);s.flywheel.engagement=1;for(let i=0;i<1000;i++)stepVehicle(s,{drive:20});result.push({gear,speed:s.v,engine:s.flywheel.omega,input:shaftState(s).omega,powerIn:s.gearbox.inputPower,powerOut:s.gearbox.outputPower});}
const s=createVehicle({mode:'open'});s.flywheel.engagement=1;for(let i=0;i<1000;i++)stepVehicle(s,{drive:20});s.flywheel.engagement=0;requestGear(s,'N');const rejected=!requestGear(s,'2');armGear(s,'2');let wait=0;for(;wait<20000&&s.gearbox.selected==='N';wait++)stepVehicle(s);result.push({movingShift:{rejectedInitially:rejected,wait_s:wait*.001,selected:s.gearbox.selected,transitionEnergy_J:s.gearbox.transitionEnergy}});
console.log(JSON.stringify(result,null,2));
