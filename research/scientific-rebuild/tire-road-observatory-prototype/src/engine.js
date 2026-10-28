// Mean four-stroke model, not crank-resolved combustion. No speed assignment,
// idle governor or rev matching. The existing flywheel is the ONLY crank inertia.
export const ENGINE=Object.freeze({displacement:.0006,peakGrossTorque:32,idleStop:.17,
 closedFlowSpeed:100,openFlowSpeed:500,coulomb:1.1,viscous:.012,quadratic:.00005,
 pumping:2,frictionSpeed:5,fireSpeed:22,extinctionSpeed:12,extinctionDelay:.08,
 starterTorque:8,starterNoLoad:45,throttleTime:.08});
export function createEngine(){return {mode:'stopped',ignition:true,throttle:0,throttleOpening:ENGINE.idleStop,lowSpeedTime:0,
 starter:false,starterAngle:0,combustion:0,friction:0,pumping:0,starterTorque:0,netTorque:0,
 combustionWork:0,starterWork:0,lossWork:0};}
export function engineTorques(omega,throttle,running,starter=false,ignition=true){
 const a=Math.max(0,Math.min(1,throttle)),speed=Math.abs(omega),e=ENGINE;
 const flow=e.closedFlowSpeed+(e.openFlowSpeed-e.closedFlowSpeed)*a;
 const charge=e.idleStop+(1-e.idleStop)*a;
 // Gross indicated mean pressure is 4*pi*T/Vd, losses are accounted separately.
 const combustion=running&&ignition&&omega>e.extinctionSpeed?e.peakGrossTorque*charge/(1+(speed/flow)**2):0;
 const friction=e.coulomb*Math.tanh(omega/e.frictionSpeed)+e.viscous*omega+e.quadratic*omega*speed;
 const pumping=e.pumping*(1-a)*omega/(speed+20);
 // A geared DC starter with an overrunning drive; never an RPM reset.
 const start=starter?e.starterTorque*Math.max(0,1-Math.max(0,omega)/e.starterNoLoad):0;
 return {throttleOpening:charge,combustion,friction,pumping,starterTorque:start,netTorque:combustion+start-friction-pumping,
 indicatedMeanPressure:4*Math.PI*combustion/e.displacement};
}
export function prepareEngine(e,omega,{throttle=0,starter=false}={},h){
 e.throttle+=(Math.max(0,Math.min(1,throttle))-e.throttle)*(-Math.expm1(-h/ENGINE.throttleTime));
 e.starter=!!starter;
 if(!e.ignition)e.mode=starter?'starting':'stopped';
 else if(e.mode!=='running'){
  if(omega>=ENGINE.fireSpeed)e.mode='running'; // also permits mechanical push start
  else if(starter)e.mode='starting';
  else if(e.mode==='starting')e.mode='stopped';
 }
 Object.assign(e,engineTorques(omega,e.throttle,e.mode==='running',starter,e.ignition));
 return e.netTorque;
}
export function finishEngine(e,omega,h){
 if(e.mode==='running'){
  e.lowSpeedTime=omega<ENGINE.extinctionSpeed?e.lowSpeedTime+h:0;
  if(e.lowSpeedTime>=ENGINE.extinctionDelay||omega<=0){e.mode='stalled';e.lowSpeedTime=0;}
 }
 if(e.starterTorque>0)e.starterAngle+=h*8*omega;
 // End-stage work, matching the reduced contact ledger. No claim that a single
 // frozen torque can be interpreted as crank-resolved thermodynamic efficiency.
 e.combustionWork+=h*e.combustion*omega;e.starterWork+=h*e.starterTorque*omega;
 e.lossWork+=h*(e.friction+e.pumping)*omega;
}
