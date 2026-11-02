// Isolated gearbox synchronizer progression. Not a vehicle drivetrain adapter.
// SI: inertia kg m², speed rad/s, torque Nm, work J.
export const DEFAULT_RATIOS=Object.freeze({forward:Object.freeze([3.8,2.2,1.52,1.16,.92,.76]),reverse:-3.55,finalDrive:3.7});
export function validateRatios(c=DEFAULT_RATIOS){if(c.forward.length!==6||!c.forward.every(x=>Number.isFinite(x)&&x>0)||!Number.isFinite(c.reverse)||c.reverse>=0||!Number.isFinite(c.finalDrive)||c.finalDrive<=0)throw Error('Invalid gearbox ratios');return c;}
export function ratio(gear,c=DEFAULT_RATIOS){validateRatios(c);if(gear==='N')return null;if(gear==='R')return c.reverse;if(!Number.isInteger(gear)||gear<1||gear>6)throw Error('Invalid gear');return c.forward[gear-1];}
// Eliminating an ENGAGED shaft reflects inertia through g², not a speed reset.
export function reflectedInertia(inputInertia,outputInertia,g){if(![inputInertia,outputInertia,g].every(Number.isFinite)||inputInertia<=0||outputInertia<=0||g===0)throw Error('Invalid inertia reduction');return outputInertia+g*g*inputInertia;}
export function shaftFlow(initial,{inputInertia=.08,outputInertia=.12,g=1,capacity=4,inputTorque=0,outputTorque=0,mode='synchronizing'}={},h=.001){
 if(initial.length!==2||![...initial,inputInertia,outputInertia,g,capacity,inputTorque,outputTorque,h].every(Number.isFinite)||inputInertia<=0||outputInertia<=0||g===0||capacity<0||h<=0||!['neutral','synchronizing','engaged'].includes(mode))throw Error('Invalid shaft problem');
 const A=1/inputInertia+g*g/outputInertia,externalSlip=inputTorque/inputInertia-g*outputTorque/outputInertia;
 let w=initial.slice(),remaining=h,heat=0,work=0,impulse=0,segments=0;const integral=[0,0],energy=a=>.5*inputInertia*a[0]**2+.5*outputInertia*a[1]**2,before=energy(w);
 if(mode==='engaged'&&w[0]!==g*w[1])throw Error('Dog engagement requires synchronized shaft speeds');
 while(remaining>0){if(++segments>3)throw Error('Shaft event budget exceeded');const slip=w[0]-g*w[1];
  let reaction=0;if(mode==='engaged')reaction=externalSlip/A;else if(mode==='synchronizing')reaction=slip!==0?Math.sign(slip)*capacity:Math.max(-capacity,Math.min(capacity,externalSlip/A));
  const acceleration=[(inputTorque-reaction)/inputInertia,(outputTorque+g*reaction)/outputInertia],slipAcceleration=acceleration[0]-g*acceleration[1],root=mode==='synchronizing'&&slip*slipAcceleration<0?-slip/slipAcceleration:Infinity,dt=Math.min(remaining,root),next=w.map((x,i)=>x+dt*acceleration[i]);
  const avg=w.map((x,i)=>(x+next[i])/2);for(let i=0;i<2;i++)integral[i]+=dt*avg[i];work+=dt*(inputTorque*avg[0]+outputTorque*avg[1]);heat+=dt*reaction*(avg[0]-g*avg[1]);impulse+=dt*reaction;
  if(root===dt||mode==='engaged'||(slip===0&&Math.abs(externalSlip/A)<=capacity&&mode==='synchronizing')){
   // Canonicalization only at an analytically located/maintained root.
   const error=next[0]-g*next[1],correction=error/A;next[0]-=correction/inputInertia;next[1]+=g*correction/outputInertia;next[0]=g*next[1];
   if(Math.abs(error)>128*Number.EPSILON*(1+Math.max(...next.map(Math.abs))))throw Error('Non-roundoff shaft correction rejected');
  }
  w=next;remaining=dt===remaining?0:remaining-dt;
 }
 const residual=energy(w)-before-work+heat,tolerance=512*Number.EPSILON*(1+before+energy(w)+Math.abs(work)+Math.abs(heat));if(!w.every(Number.isFinite)||heat < -tolerance||Math.abs(residual)>tolerance)throw Error('Shaft work check failed');
 return {w,integral,heat,work,impulse,residual,segments,synchronized:w[0]===g*w[1]};
}
