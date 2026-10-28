// Non-servo opposed-shoe hydraulic drums. Force-controlled ideal quasi-static
// pedal/master/cylinders; return springs and lining compliance determine travel.
export const BRAKE_MECHANISM=Object.freeze({pedalRatio:4,pedalForce:250,masterDiameter:.020,
 frontCylinderDiameter:.0202,rearCylinderDiameter:.017,mu:.4,drumRadius:.125,
 returnPreload:20,returnStiffness:10000,liningStiffness:2e7,clearance:.0002,
 handForce:100,handRatio:8,expanderRatio:4,cableStiffness:2e5,cableSlack:.008,leverRadius:.03});
const area=d=>Math.PI*d*d/4,unit=x=>Math.max(0,Math.min(1,x));
export function brakeActuation(service=0,hand=0){
 const p=BRAKE_MECHANISM,pedal=unit(service),lever=unit(hand),pressure=pedal*p.pedalForce*p.pedalRatio/area(p.masterDiameter);
 const cableTension=lever*p.handForce*p.handRatio,perRearCable=cableTension/2;
 const normal=force=>Math.max(0,(force-p.returnPreload-p.returnStiffness*p.clearance)/(1+p.returnStiffness/p.liningStiffness));
 const wheels=Array.from({length:4},(_,i)=>{
  const hydraulic=pressure*area(i<2?p.frontCylinderDiameter:p.rearCylinderDiameter),mechanical=i<2?0:perRearCable*p.expanderRatio;
  // Parallel actuators share shoes: return preload is paid once. The independent
  // capacities allocate total clamp in proportion to actuator force, not twice.
  const total=hydraulic+mechanical,n=normal(total),share=total?hydraulic/total:0;
  return {normalPerShoe:n,shoeTravel:total>p.returnPreload+p.returnStiffness*p.clearance?p.clearance+n/p.liningStiffness:0,
   hydraulicForce:hydraulic,cableForce:mechanical,serviceCapacity:2*p.mu*p.drumRadius*n*share,
   handCapacity:2*p.mu*p.drumRadius*n*(1-share),returnForce:n? p.returnPreload+p.returnStiffness*(p.clearance+n/p.liningStiffness):total};
 });
 const fluidVolume=wheels.reduce((v,w,i)=>v+2*area(i<2?p.frontCylinderDiameter:p.rearCylinderDiameter)*w.shoeTravel,0);
 const cableTravel=lever?(p.cableSlack+perRearCable/p.cableStiffness+p.expanderRatio*wheels[2].shoeTravel):0;
 return {pedal,lever,pressure,cableTension,perRearCable,masterTravel:fluidVolume/area(p.masterDiameter),pedalTravel:p.pedalRatio*fluidVolume/area(p.masterDiameter),
 handAngle:cableTravel/p.leverRadius,cableTravel,wheels};
}
