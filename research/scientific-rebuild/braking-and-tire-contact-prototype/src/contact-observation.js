import {roadAt} from './vehicle.js';
// Detached, read-only measurements. Forces/slips/omega are sampled coherently
// before the next instantaneous dog impulse. Positions are end-stage positions.
export function contactWorld(s,w){
 const p=s.planar,c=Math.cos(p.heading),t=Math.sin(p.heading);
 const delta=w.axle===0 ? (w.steering||0) : 0, trail=w.axle===0 ? (s.steering?.dynamics?.trail||0) : 0;
 const wx=w.x+trail*(1-Math.cos(delta)),wy=w.y-trail*Math.sin(delta);
 const x=p.x+c*wx-t*wy,y=p.y+t*wx+c*wy;
 return {x,y,z:roadAt(s,x).height};
}
export function captureContacts(s){
 const p=s.planar;
 return {time:s.time,center:{x:p.x,y:p.y,z:0},heading:p.heading,bump:s.bump,
  wheels:s.wheels.map(w=>{
   const position=contactWorld(s,w),normal=w.normal??0,sx=w.slipX??0,sy=w.slipY??0,fx=w.fx??0,fy=w.fy??0;
   const power=-(fx*sx+fy*sy),limit=w.mu*Math.max(0,normal),utilization=limit>0?Math.hypot(fx,fy)/limit:null;
   return {name:w.name,position,heading:p.heading+(w.steering||0),forceHeading:w.forceHeading??p.heading+(w.steering||0),omega:w.omega,
    normal,mu:w.mu,sx,sy,fx,fy,power,slidingSpeed:Math.hypot(sx,sy),utilization,
    brakeTorque:w.brake||0,geometryContact:s.corners[w.axle].z<w.radius+position.z,
    supported:normal>0,saturated:utilization!==null&&utilization>=1-1e-6};
  })};
}
