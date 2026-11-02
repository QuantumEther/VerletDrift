// Read-only presentation mapping plus accepted rotor-angle quadrature. No solver.
import {P,create,step,energy,totalWork} from '../vehicle.js';
import * as coupled from '../../coupled-drivetrain/vehicle.js';
import {point,sample,frame} from '../geometry.js';
import {createMap} from './maps.js';
export const defaults=Object.freeze({preset:'flat',seed:23,amplitude:.15,roughness:.5});
export function createLaboratory(settings=defaults,options={}){
 const terrain=createMap(settings),sixRotor=options.drivetrainMode==='manual',model=sixRotor?coupled:{create,step,energy,totalWork},state=model.create(terrain,options);
 return {terrain,state,sixRotor,angles:Array(sixRotor?6:5).fill(0),steer:0,initialEnergy:model.energy(state,terrain),lastInput:{}};
}
export function advance(lab,input,h=.001){
 (lab.sixRotor?coupled.step:step)(lab.state,lab.terrain,input,h); // Transaction succeeds before any display history updates.
 lab.angles=lab.angles.map((a,i)=>a+lab.state.constraints.integral[i]);lab.steer=input.steer??0;lab.lastInput={...input};
}
export function presentation(lab){
 const s=lab.state,y=s.y,v=s.vertical,heading=y[2],c=Math.cos(heading),sn=Math.sin(heading);
 return {time:s.time,planar:{x:y[0],y:y[1],heading,u:c*y[3]+sn*y[4],v:-sn*y[3]+c*y[4],r:y[5]},z:y[6],pitch:y[7],roll:y[8],
  wheels:v.corners.map((corner,i)=>{
   const p=point(y,corner,i),ground=sample(lab.terrain,p[0],p[1]),contact=s.contacts?.[i],steering=i<2?lab.steer:0,[t,l]=frame(s.bristleNormals[i],heading+steering);
   return {name:['FL','FR','RL','RR'][i],x:corner[0],y:corner[1],position:p,roadHeight:ground.height,normalAxis:s.bristleNormals[i],tangent:t,lateral:l,radius:P.R,omega:y[20+i],angle:lab.angles[i],steering,
    mount:[p[0],p[1],y[6]+corner[0]*y[7]+corner[1]*y[8]],compression:v.length-y[6]-corner[0]*y[7]-corner[1]*y[8]+y[9+i],
    normal:contact?.normal.N??v.kt*Math.max(0,P.R+ground.height-p[2])*Math.hypot(...ground.gradient,1),mu:contact?.normal.mu??ground.friction,
    fx:contact?.flow.force[0]??0,fy:contact?.flow.force[1]??0,slipX:contact?.slip[0]??0,slipY:contact?.slip[1]??0,mode:contact?.flow.mode??'initial',worldForce:contact?.Ft??[0,0,0],attached:contact?.normal.attached??p[2]<P.R+ground.height};
  }),gearbox:s.gearbox??null,inputOmega:lab.sixRotor?y[30]:1.75*(y[22]+y[23]),synchronizerHeat:lab.sixRotor?-y[31]:0,outputOmega:lab.sixRotor?s.transmission.ratios.finalDrive*(y[22]+y[23])/2:null,engineOmega:y[24],engineAngle:lab.angles[4],clutch:s.constraints?.clutchMode??'initial',heat:{clutch:-y[28],brakes:-y[27]},energy:(lab.sixRotor?coupled.energy:energy)(s,lab.terrain),energyResidual:(lab.sixRotor?coupled.energy:energy)(s,lab.terrain)-lab.initialEnergy-(lab.sixRotor?coupled.totalWork:totalWork)(s),consistency:s.consistency??null};
}
// Reuse the old bounded track/history renderer with genuine irreversible bristle
// dissipation, NOT instantaneous mechanical contact power (which may return U).
export function capture(lab,h=.001){
 const s=lab.state,y=s.y;
 return {time:s.time,center:{x:y[0],y:y[1],z:y[6]},heading:y[2],bump:null,wheels:s.vertical.corners.map((corner,i)=>{
  const p=point(y,corner,i),ground=lab.terrain.sample(p[0],p[1]),t=s.contacts?.[i],normal=t?.normal.N??0,mu=t?.normal.mu??ground.friction,fx=t?.flow.force[0]??0,fy=t?.flow.force[1]??0,sx=t?.slip[0]??0,sy=t?.slip[1]??0,limit=normal*mu,utilization=limit>0?Math.hypot(fx,fy)/limit:null,heading=y[2]+(i<2?lab.steer:0);
  return {name:['FL','FR','RL','RR'][i],position:{x:p[0],y:p[1],z:ground.height},heading,forceHeading:heading,omega:s.constraints?s.constraints.integral[i]/h:y[20+i],normal,mu,sx,sy,fx,fy,power:t?(t.flow.viscous+t.flow.plastic)/h:0,mechanicalPower:t?t.flow.work/h:0,slidingSpeed:Math.hypot(sx,sy),utilization,brakeTorque:s.constraints?s.constraints.brakeImpulse[i]/h:0,geometryContact:normal>0,supported:normal>0,saturated:utilization!==null&&utilization>=1-1e-6};
 })};
}
