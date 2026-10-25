import{createVehicle}from './vehicle.js';import{engageDogs}from './gearbox.js';
// A documented initial condition, not a running shift or matching assistant.
export function movingSecond(options={}){
 const s=createVehicle(options);s.v=1.6;s.wheels.forEach(w=>{w.omega=5;w.angle=.93;});
 s.gearbox.q=-.025;s.gearbox.neutralOmega=10;s.gearbox.neutralAngle=1.86;engageDogs(s,'2');
 s.flywheel.omega=10;s.flywheel.angle=1.86;return s;
}
