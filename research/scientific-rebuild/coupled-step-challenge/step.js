// Generated transactional subdivision/publication wrapper, unchanged guards.
import {createTireStrategy} from '../procedural-terrain/src/tire-strategy.js';
import {selectorSubsteps} from '../procedural-terrain/src/vehicle.js';
import {candidateJointStep} from './candidate.js';
export function stepJointVehicle(vehicle,ports={},h=.001,observer=null){
 let count;
 try{count=selectorSubsteps(vehicle.state,h);}catch(error){error.integration={requestedH:h,attemptedSubsteps:0,publishedSubsteps:0};throw error;}
 if(count===1){
  const candidate=candidateJointStep(vehicle,ports,h,observer);
  vehicle.state=candidate.state;vehicle.contacts=candidate.contacts;
  vehicle.integration={substeps:1,requestedH:h,internalH:h,energyResidual:candidate.energyResidual,absoluteEnergyResidual:Math.abs(candidate.energyResidual)};
  if(observer)observer.accept(candidate.accepted);
  return vehicle;
 }
 const innerH=h/count,staged={...vehicle,tireStrategy:vehicle.tireStrategy?createTireStrategy(vehicle.tireStrategy):undefined},accepted=[];
 const sumFields=['residual','forceWork','potentialChange','springChange','gravityChange','terrainChange','damping','numericalLoss','iterations','contactIterations','normalWorkResidual'];
 const totals=Object.fromEntries(sumFields.map(k=>[k,0]));let energyResidual=0,absoluteEnergyResidual=0,cases=0,searches=0;
 let attempted=0;
 try{for(let i=0;i<count;i++){
  attempted++;
  const candidate=candidateJointStep(staged,ports,innerH,observer);
  staged.state=candidate.state;staged.contacts=candidate.contacts;accepted.push(...candidate.accepted);
  energyResidual+=candidate.energyResidual;absoluteEnergyResidual+=Math.abs(candidate.energyResidual);cases+=staged.state.gearbox.lastStepCases||0;searches+=staged.state.gearbox.eventIterations||0;
  if(staged.state.terrainLedger)for(const key of sumFields)totals[key]+=staged.state.terrainLedger[key]||0;
 }
 }catch(error){error.integration={requestedH:h,plannedSubsteps:count,attemptedSubsteps:attempted,publishedSubsteps:0};throw error;}
 if(absoluteEnergyResidual>1e-7||totals.normalWorkResidual>1e-9)throw Object.assign(Error('Subdivided terrain work check failed'),{candidate:{residual:energyResidual,absoluteEnergyResidual,normalWorkResidual:totals.normalWorkResidual},integration:{requestedH:h,plannedSubsteps:count,attemptedSubsteps:count,publishedSubsteps:0}});
 if(count>1){
  if(staged.state.terrainLedger)Object.assign(staged.state.terrainLedger,totals,{internalSubsteps:count});
  staged.state.gearbox.lastStepCases=cases;staged.state.gearbox.eventIterations=searches;
 }
 vehicle.state=staged.state;vehicle.contacts=staged.contacts;
 vehicle.integration={substeps:count,requestedH:h,internalH:innerH,energyResidual,absoluteEnergyResidual};
 if(observer)observer.accept(accepted);
 return vehicle;
}
