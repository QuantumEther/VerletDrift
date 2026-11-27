// Survey coordinates in metres. Each profile is part of the collision heightfield.
export const flightLanes=Object.freeze([
 {name:'Progressive crest',y:0,speed:28,start:54,up:18,down:14,height:2.5},
 {name:'Short launch',y:15,speed:24,start:72,up:10,down:15,height:2.6},
 {name:'Offset crest',y:-15,speed:24,start:62,up:15,down:14,height:2.7,bank:.12},
]);
export function smoothBand(value,start,end){
 const t=Math.max(0,Math.min(1,(value-start)/(end-start)));
 return [t*t*t*(10+t*(-15+6*t)),30*t*t*(1-t)*(1-t)/(end-start)];
}
function profile(x,lane){
 const {start,up,down,height}=lane,peak=start+up;
 const [a,da]=x<peak?smoothBand(x,start,peak):smoothBand(x,peak+down,peak);
 return [height*a,height*da];
}
export function flightHeight(x,y){
 let z=0,hx=0,hy=0;
 for(const lane of flightLanes){
  const offset=y-lane.y,[edge,de]=smoothBand(Math.abs(offset),4.4,7.2);
  const [h,dx]=profile(x,lane),bank=lane.bank??0,tilt=1+bank*offset/4.4;
  z+=h*tilt*(1-edge);
  hx+=dx*tilt*(1-edge);
  hy+=h*(bank/4.4*(1-edge)-tilt*de*Math.sign(offset));
 }
 return [z,hx,hy];
}
export function flightCorridor(x,y){
 const lane=flightLanes.reduce((a,b)=>Math.abs(y-a.y)<Math.abs(y-b.y)?a:b);
 const [apron]=smoothBand(x,18,36);
 // Full-width paddock joins three parallel courses to the same launch area.
 return {center:lane.y,slope:0,distance:y-lane.y,width:9+(1-apron)*6,shoulder:1.4};
}
