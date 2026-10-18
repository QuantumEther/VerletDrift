struct Uniforms {
  view: vec4<f32>, // backing width, height, pixels/world-unit, total elapsed
  effect: vec4<f32>, // speed, volume litres, breakup, concentration
  event: vec4<f32>, // origin x/y, age since impact, deterministic seed
  car: vec4<f32>, // x/y, artwork width/length (laboratory only)
  options: vec4<f32>, // impact direction x/y, shader detail, car texture available
  counts: vec4<f32>, // filament roots, drops, membrane layers, reserved
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
fn clip(p:vec3<f32>)->vec4<f32>{
 let screen=vec2(p.x,p.y-p.z*.48)*u.view.z;
 return vec4(screen/u.view.xy*vec2(2.,-2.),0.,1.);
}
fn extent(angle:f32)->f32 {
 let d=vec2(cos(angle),sin(angle));let impact=u.options.xy;
 let lateral=abs(dot(d,vec2(-impact.y,impact.x)));
 let forward=max(0.,dot(d,impact));
 let lobes=(noise(d*3.4+vec2(7.1,11.3))-.5)*.60+.045*sin(angle*13.+1.2);
 return 4.5*pow(u.effect.y/18.,.33333)*(.7+u.effect.x*.016)*(.66+.50*lateral+.22*forward+lobes);
}
// Shared rim function: sheets, strands and emitted droplets originate together.
fn sheetPoint(angle:f32, radial:f32, age:f32, layer:f32)->vec3<f32>{
 let t=max(age,0.);let growth=1.-exp(-t*3.1);
 let inner=smoothstep(.25,2.3,t)*.48;
 let r=mix(inner,1.,radial)*extent(angle)*growth*(1.-layer*.055);
 let theta=angle+.06*sin(angle*7.+t*2.2+layer)*radial;
 let p=u.event.xy+vec2(cos(theta),sin(theta))*r;
 let fold=sin(radial*PI)*(.35+.65*pow(abs(sin(angle*3.+layer*.7)),2.));
 let z=(.12+fold*1.3)*sin(min(t*2.5,PI))*exp(-t*.35)*(1.+layer*.12);
 return vec3(p,max(0.,z));
}
fn lifeFade()->f32 {return smoothstep(0.,.045,u.event.z)*(1.-smoothstep(1.2,2.75,u.event.z));}

fn rootAngle(root:u32)->f32 {return (f32(root)+(hash(root+60u)-.5)*.8)/u.counts.x*TAU;}
