struct Uniforms {
  view: vec4<f32>, // backing width, height, pixels/world-unit, total elapsed
  effect: vec4<f32>, // speed, volume litres, breakup, concentration
  event: vec4<f32>, // origin x/y, age since impact, deterministic seed
  car: vec4<f32>, // x/y, artwork width/length (laboratory only)
  options: vec4<f32>, // impact direction x/y, shader detail, car texture available
  counts: vec4<f32>, // filament roots, drops, membrane layers, drying enabled
  ground: vec4<f32>, // atlas half extent, atlas texels, camera center x/y
  material: vec4<f32>, // membrane thickness, filament length, droplet size, roughness
  optics: vec4<f32>, // specular strength, puddle depth, drying start age, reserved
  drying: vec4<f32>, // nominal duration, irregularity, absorption, dye residue
  vehicle: vec4<f32>, // body wetness, runoff, hood deflection, reserved
  bodyDrying: vec4<f32>, // body drying duration, dye residue, interaction enabled, reserved
  pose: vec4<f32>, // heading cos/sin, distant environment flag, reserved; lab defaults zero
  dye: vec4<f32>, // absorption RGB, enabled
}
@group(0) @binding(0) var<uniform> u: Uniforms;
const PI=3.14159265359;
const TAU=6.28318530718;
fn hash(id:u32)->f32 {
 var n=id+u32(u.event.w)*747796405u;
 n=(n^(n>>16u))*2246822519u;n=(n^(n>>13u))*3266489917u;
 return f32((n^(n>>16u))>>8u)/16777216.;
}
fn noise(p:vec2<f32>)->f32 {
 let cell=vec2<i32>(floor(p));let f=fract(p);let v=f*f*(3.-2.*f);
 let id=bitcast<u32>(cell.x)*1597334677u+bitcast<u32>(cell.y)*3812015801u;
 return mix(mix(hash(id),hash(id+1597334677u),v.x),mix(hash(id+3812015801u),hash(id+1597334677u+3812015801u),v.x),v.y);
}
fn fbm(p:vec2<f32>)->f32 {
 var q=p;var value=0.;var weight=.57;
 for(var i=0u;i<u32(u.options.z);i++){value+=noise(q)*weight;q=vec2(q.x*.8-q.y*.6,q.x*.6+q.y*.8)*2.03+vec2(5.7,13.1);weight*=.5;}
 return value;
}
// Velocity superposition, not speed-dependent scaling of the final silhouette.
const SHEET_DRAG=2.15;
fn travel(t:f32,drag:f32)->f32 {return (1.-exp(-max(t,0.)*drag))/drag;}
fn pressureSpeed()->f32 {return sqrt(10.8*10.8+pow(u.effect.x*.16,2.))*pow(u.effect.y/18.,.33333);}
fn transferredVelocity()->vec2<f32> {return u.options.xy*(u.effect.x*.18);}
fn radialVelocity(angle:f32)->vec2<f32> {
 let d=vec2(cos(angle),sin(angle));
 let irregular=.88+(noise(d*3.4+vec2(7.1,11.3))-.5)*.34;
 return d*pressureSpeed()*irregular;
}
fn clip(p:vec3<f32>)->vec4<f32>{
 let screen=(vec2(p.x,p.y-p.z*.48)-u.ground.zw)*u.view.z;
 return vec4(screen/u.view.xy*vec2(2.,-2.),0.,1.);
}
fn atlasClip(world:vec2<f32>)->vec4<f32> {
 return vec4((world-u.event.xy)/u.ground.x*vec2(1.,-1.),0.,1.);
}
fn sheetLanding(angle:f32,radial:f32,layer:f32)->f32 {
 return .92+(.32*pow(sin(angle*2.+layer*.7),2.)+.13)*radial+layer*.035;
}
// Shared ballistic contact and damped launch motion for liquid and its residue.
fn sheetPoint(angle:f32, radial:f32, age:f32, layer:f32)->vec3<f32>{
 let landing=sheetLanding(angle,radial,layer);let t=clamp(age,0.,landing);
 let theta=angle+.035*sin(angle*7.+layer)*radial;
 let p=u.event.xy+(radialVelocity(theta)*radial*(1.-layer*.055)+transferredVelocity())*travel(t,SHEET_DRAG);
 let phase=t/landing;
 let fold=sin(radial*PI)*(.35+.65*pow(abs(sin(angle*3.+layer*.7)),2.));
 let z=4.*phase*(1.-phase)*(.20+fold*.95);
 return vec3(p,max(0.,z));
}
fn lifeFade()->f32 {return smoothstep(0.,.045,u.event.z)*(1.-smoothstep(1.2,2.75,u.event.z));}
fn rootAngle(root:u32)->f32 {return (f32(root)+(hash(root+60u)-.5)*.8)/u.counts.x*TAU;}
fn corners(id:u32)->vec2<f32>{let p=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(1.,1.),vec2(-1.,-1.),vec2(1.,1.),vec2(-1.,1.));return p[id];}
struct Drop {
 position:vec3<f32>, radius:f32, velocity:vec2<f32>, landed:f32, alive:f32,
 ground:vec2<f32>, arrival:f32, size:f32,
}
fn drop(id:u32)->Drop {
 let angle=rootAngle(id%u32(u.counts.x))+(hash(id+120u)-.5)*.20;
 let birth=.10+pow(hash(id+23u),1.5)*.48;let time=u.event.z-birth;
 let start=sheetPoint(angle,.78+hash(id+4u)*.22,birth,0.);
 let dir=vec2(cos(angle),sin(angle));
 // Inherit the moving film's velocity at emission, plus a small shedding impulse.
 let velocity=(radialVelocity(angle)+transferredVelocity())*exp(-SHEET_DRAG*birth)+dir*(.6+hash(id+11u)*1.6);
 let vz=1.4+hash(id+61u)*3.;let gravity=9.81;
 let flight=(vz+sqrt(vz*vz+2.*gravity*start.z))/gravity;
 let airborne=clamp(time,0.,flight);let xy=start.xy+velocity*travel(airborne,1.4);
 let z=max(0.,start.z+vz*airborne-.5*gravity*airborne*airborne);
 let contact=time-flight;let landed=smoothstep(0.,.10,contact);
 let size=(.009+pow(hash(id+700u),6.)*.090)*pow(u.effect.y/18.,.25);
 let radius=size*mix(1.,1.8,landed);
 let alive=smoothstep(0.,.035,time)*(1.-smoothstep(0.,.14,contact));
 return Drop(vec3(xy,z),radius,velocity,landed,alive,start.xy+velocity*travel(flight,1.4),birth+flight,size);
}
fn splashlet(id:u32)->Drop {
 let parent=drop(id/2u);let angle=hash(id+3100u)*TAU;
 let dir=vec2(cos(angle),sin(angle));
 let velocity=normalize(parent.velocity+vec2(.0001))*.45+dir*(.6+hash(id+3101u)*1.1);
 let vz=.6+hash(id+3102u)*.7;let flight=2.*vz/9.81;
 let t=u.event.z-parent.arrival;let airborne=clamp(t,0.,flight);
 let size=parent.size*.30;
 let alive=smoothstep(0.,.015,t)*(1.-smoothstep(0.,.08,t-flight))*step(.033,parent.size);
 return Drop(vec3(parent.ground+velocity*airborne,max(0.,vz*airborne-4.905*airborne*airborne)),size,
  velocity,smoothstep(0.,.08,t-flight),alive,parent.ground+velocity*flight,parent.arrival+flight,size);
}

fn vehicleRotate(v:vec2<f32>)->vec2<f32>{
 if(dot(u.pose.xy,u.pose.xy)<.5){return v;}
 return vec2(v.x*u.pose.x-v.y*u.pose.y,v.x*u.pose.y+v.y*u.pose.x);
}
fn vehicleUnrotate(v:vec2<f32>)->vec2<f32>{
 if(dot(u.pose.xy,u.pose.xy)<.5){return v;}
 return vec2(v.x*u.pose.x+v.y*u.pose.y,-v.x*u.pose.y+v.y*u.pose.x);
}
