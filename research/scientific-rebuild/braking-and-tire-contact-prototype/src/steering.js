// Massless planar worm/sector -> Pitman -> drag link -> steering arms/tie rod.
// Circle intersections close actual fixed-length links, no iterative steering solve.
const rot=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a)];
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const length=p=>Math.hypot(...p),angle=p=>Math.atan2(p[1],p[0]);
function intersection(center,r,other,R,near){
 const dvec=sub(other,center),d=length(dvec),a=(r*r-R*R+d*d)/(2*d),q=r*r-a*a;
 if(!(d>0&&q>=0))throw Error('Steering linkage outside assembly domain');
 const e=dvec.map(x=>x/d),base=add(center,e.map(x=>x*a)),h=Math.sqrt(q),n=[-e[1]*h,e[0]*h];
 const u=add(base,n),v=sub(base,n);return length(sub(u,near))<length(sub(v,near))?u:v;
}
export function steeringGeometry(wheelbase=2,track=1.2){
 // Choose the trapezoid arm angle for the ideal Ackermann SMALL-ANGLE
 // cotangent difference track/wheelbase, accounting for finite arm length.
 // L*tan(k)+2*arm*sin(k)=track. Bounded construction only, not per tick.
 const arm=.22,front=wheelbase/2;let lo=0,hi=Math.PI/3;
 for(let i=0;i<48;i++){const m=(lo+hi)/2;if(wheelbase*Math.tan(m)+2*arm*Math.sin(m)<track)lo=m;else hi=m;}
 const k=(lo+hi)/2;
 const left=[front,track/2],right=[front,-track/2],al=[-arm*Math.cos(k),-arm*Math.sin(k)],ar=[al[0],-al[1]];
 const lp=add(left,al),rp=add(right,ar),box=[.65,-.15],pitman=[-.14,0],tip=add(box,pitman);
 return {wheelbase,track,left,right,al,ar,lp,rp,box,pitman,tip,arm,tieLength:length(sub(lp,rp)),dragLength:length(sub(lp,tip)),ratio:24,columnLimit:7,columnRate:32};
}
export function linkage(column,g=steeringGeometry()){
 if(!Number.isFinite(column))throw Error('Nonfinite steering column');
 const wheelAngle=Math.max(-g.columnLimit,Math.min(g.columnLimit,column)),boxAngle=wheelAngle/g.ratio,tip=add(g.box,rot(g.pitman,boxAngle));
 const lp=intersection(g.left,g.arm,tip,g.dragLength,g.lp),leftAngle=wrap(angle(sub(lp,g.left))-angle(g.al));
 const rp=intersection(g.right,g.arm,lp,g.tieLength,g.rp),rightAngle=wrap(angle(sub(rp,g.right))-angle(g.ar));
 return {wheelAngle,boxAngle,tip,leftAngle,rightAngle,leftPin:g.left,rightPin:g.right,leftEnd:lp,rightEnd:rp,box:g.box,
 tieLength:g.tieLength,dragLength:g.dragLength,stopped:Math.abs(wheelAngle)===g.columnLimit};
}
export function createSteering(wheelbase=2,track=1.2){const geometry=steeringGeometry(wheelbase,track);return {geometry,...linkage(0,geometry)};}
export function advanceSteering(s,command,h){
 const target=Math.max(-1,Math.min(1,command))*s.geometry.columnLimit;
 Object.assign(s,linkage(s.wheelAngle+Math.max(-s.geometry.columnRate*h,Math.min(s.geometry.columnRate*h,target-s.wheelAngle)),s.geometry));
 return [s.leftAngle,s.rightAngle];
}
