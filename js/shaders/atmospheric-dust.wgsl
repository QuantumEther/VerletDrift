// Finite Lagrangian flow maps: integrated rotation, not an Euler position offset.
struct DustFrame {view:vec4<f32>,camera:vec4<f32>,body:vec4<f32>,motion:vec4<f32>,wind:vec4<f32>,grid:vec4<f32>,counts:vec4<f32>,appearance:vec4<f32>}
struct Wake {place:vec4<f32>,motion:vec4<f32>}
struct Vortex {place:vec4<f32>,shape:vec4<f32>}
struct DustElement {trail0:vec4<f32>,trail1:vec4<f32>,trail2:vec4<f32>,look:vec4<f32>}
@group(0) @binding(0) var<uniform> dust:DustFrame;
@group(0) @binding(1) var<storage,read> wakes:array<Wake>;
@group(0) @binding(2) var<storage,read_write> computedDust:array<DustElement>;
@group(0) @binding(3) var<storage,read> renderedDust:array<DustElement>;
@group(0) @binding(4) var<storage,read> vortices:array<Vortex>;
@group(0) @binding(5) var<storage,read_write> visibleIndices:array<u32>;
@group(0) @binding(6) var<storage,read_write> drawArguments:array<u32>;
@group(0) @binding(8) var<storage,read_write> compactState:array<u32>;
@group(0) @binding(7) var<storage,read> drawIndices:array<u32>;
fn turn(v:vec2<f32>,a:f32)->vec2<f32>{let c=cos(a);let s=sin(a);return vec2(c*v.x-s*v.y,s*v.x+c*v.y);}
// Integral of a smooth-start, exponentially decaying circulation. Saturating
// the integral stops rotation; it never winds the tracer back to its seed.
fn circulationIntegral(age:f32,life:f32)->f32{
 let t=clamp(age,0.,life);let tau=max(.18,life*.45);let fast=1./(1./tau+10.);
 return tau*(1.-exp(-t/tau))-fast*(1.-exp(-t/fast));
}
fn transport(seed:vec2<f32>,time:f32,birth:f32)->vec4<f32>{
 var p=seed+dust.wind.xy*time;var energy=0.;var curl=0.;
 let strength=dust.motion.w;
 // Body pressure/entrainment impulses are tied to sampled positions, actual
 // velocity and slip. Smooth onset gives continuous deflection as the car passes.
 for(var i=0u;i<u32(dust.counts.y);i++){
  let e=wakes[i];let age=time-e.place.z;if(age<0.||e.place.z<birth){continue;}
  let speed=length(e.motion.xy);if(speed<.4){continue;}
  let f=vec2(sin(e.motion.z),-cos(e.motion.z));let r=vec2(-f.y,f.x);let axis=e.motion.xy/speed;
  let delta=p-e.place.xy;let side=dot(delta,r);let ahead=dot(delta,f);
  if(dot(delta,delta)>36.){continue;}
  let near=exp(-pow(side/(dust.camera.w*.85),2.)-pow(ahead/(dust.camera.z*.75),2.));
  let onset=1.-exp(-age*15.);let slip=dot(e.motion.xy,r)/speed;
  p+=strength*onset*near*(r*side/(abs(side)+.2)*min(speed*.05,1.5)*(1.+slip*side/(abs(side)+.4)*.5)+axis*min(speed*.023,.7));
  energy+=near*min(speed/18.,2.)*exp(-age*1.4)*strength;
 }
 // Ordered rotations are volume-preserving per frozen-core map. Their
 // composition approximates interacting vortices; it is not a fluid solver.
 for(var i=0u;i<u32(dust.counts.z);i++){
  let v=vortices[i];let age=time-v.place.z;let life=dust.wind.z;
  if(age<0.||birth-v.place.z>life){continue;}
  let a=clamp(age,0.,life);let center=v.place.xy+dust.wind.xy*a+v.shape.xy*a*.25;
  let delta=p-center;let core=v.shape.z+.12*a;let r2=dot(delta,delta);let c2=core*core;
  if(r2>c2*16.){continue;}
  // Differential angular speed winds seed microstructure into spiral arms.
  let integrated=circulationIntegral(age,life)-circulationIntegral(birth-v.place.z,life);
  let influence=(1.-smoothstep(c2*9.,c2*16.,r2))/(1.+r2/c2);
  let angle=v.place.w*strength*integrated*influence;
  p=center+turn(delta,angle);
  let live=exp(-a/max(.2,life*.5))*(1.-smoothstep(.75,1.,a/life));
  energy+=abs(v.place.w)*.14*influence*live*strength;
  curl+=v.place.w*influence*live*strength;
 }
 // No-history preview still shows the current vehicle's local pressure field.
 if(dust.counts.y<.5){
  let speed=length(dust.body.zw);let f=vec2(sin(dust.motion.x),-cos(dust.motion.x));let r=vec2(-f.y,f.x);let delta=p-dust.body.xy;
  let side=dot(delta,r);let near=exp(-pow(side/1.7,2.)-pow(dot(delta,f)/3.,2.));
  let axis=dust.body.zw/max(.01,speed);
  p+=(r*side/(abs(side)+.2)*min(speed*.08,1.5)+axis*min(speed*.025,.6))*near*strength;
  energy+=near*min(speed/18.,2.)*strength;
 }
 return vec4(p,min(energy,2.),clamp(curl*.12,-1.,1.));
}
fn prepareTracer(id:u32){
 if(id>=u32(dust.counts.x)){return;}
 let cell=vec2<i32>(dust.grid.xy+vec2(f32(id%u32(dust.grid.z)),f32(id/u32(dust.grid.z)))*dust.grid.w);
 let seed=envHash(cell);let rank=fract(seed*37.31);let density=dust.motion.z*dust.wind.w;
 if(rank>max(density,.50*min(1.,dust.appearance.x))){computedDust[id]=DustElement(vec4(0.),vec4(0.),vec4(0.),vec4(0.));return;}
 let lifetime=dust.appearance.y;let phase=fract(seed*41.7)*lifetime;
 let epoch=floor((dust.view.w+phase)/lifetime);let birth=epoch*lifetime-phase;
 let cycle=envHash(cell+vec2<i32>(i32(epoch)*137,i32(epoch)*719));
 let origin=(vec2<f32>(cell)+vec2(fract(cycle*53.7),fract(cycle*97.3)))*dust.appearance.z;
 let fade=smoothstep(0.,.16,dust.view.w-birth)*(1.-smoothstep(lifetime-.16,lifetime,dust.view.w-birth));
 let now=transport(origin,dust.view.w,birth);let dt=select(.035,.06,dust.counts.w>.5);
 let previous=transport(origin,max(birth,dust.view.w-dt),birth);
 var p2=previous.xy;var p3=p2;var p4=p2;var p5=p2;
 if(dust.counts.w>.5){
  p2=transport(origin,max(birth,dust.view.w-.12),birth).xy;p3=transport(origin,max(birth,dust.view.w-.18),birth).xy;
  p4=transport(origin,max(birth,dust.view.w-.24),birth).xy;p5=transport(origin,max(birth,dust.view.w-.30),birth).xy;
 }
 let visible=select(0.,1.-smoothstep(density*.95,density+.02,rank),density>0.);
 let ambient=(.06+.09*fract(seed*83.7))*visible;
 let alpha=clamp((ambient+now.z*.19*dust.appearance.x)*fade,0.,.5);
 let radius=max(.52,(.012+.014*cycle)*dust.view.z);
 computedDust[id]=DustElement(vec4(now.xy,previous.xy),vec4(p2,p3),vec4(p4,p5),vec4(radius,alpha,now.w,now.z));
}
fn classify(id:u32)->vec2<u32>{
 if(id>=u32(dust.counts.x)){return vec2(0u);}
 let e=computedDust[id];let extent=dust.view.xy/(dust.view.z*2.)+vec2(select(.3,6.,dust.counts.w>.5));
 if(e.look.y<=.001||!all(abs(e.trail0.xy-dust.camera.xy)<extent)){return vec2(0u);}
 if(dust.counts.w>.5){return vec2(0u,5u);}
 return select(vec2(1u,0u),vec2(0u,1u),e.look.w>.015);
}
var<workgroup> scan:array<vec2<u32>,64>;
@compute @workgroup_size(64) fn prepare_dust(@builtin(global_invocation_id) invocation:vec3<u32>,@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3<u32>){
 let id=invocation.x;prepareTracer(id);let flags=classify(id);scan[lane]=flags;workgroupBarrier();
 // Stable prefix ranks preserve blending order across runs and backward seeks.
 // Atomic append ordering would be nondeterministic even with seeded tracers.
 for(var offset=1u;offset<64u;offset*=2u){
  var add=vec2(0u);if(lane>=offset){add=scan[lane-offset];}workgroupBarrier();
  scan[lane]+=add;workgroupBarrier();
 }
 compactState[id*2u]=scan[lane].x-flags.x;compactState[id*2u+1u]=scan[lane].y-flags.y;
 if(lane==63u){compactState[131072u+group.x*2u]=scan[63].x;compactState[131073u+group.x*2u]=scan[63].y;}
}
@compute @workgroup_size(1) fn prefix_dust_groups(){
 var total=vec2(0u);let groups=(u32(dust.counts.x)+63u)/64u;
 for(var i=0u;i<groups;i++){
  let index=131072u+i*2u;let n=vec2(compactState[index],compactState[index+1u]);
  compactState[index]=total.x;compactState[index+1u]=total.y;total+=n;
 }
 drawArguments[0]=total.x;drawArguments[5]=total.y;
}
@compute @workgroup_size(64) fn scatter_dust(@builtin(global_invocation_id) invocation:vec3<u32>){
 let id=invocation.x;if(id>=u32(dust.counts.x)){return;}
 let flags=classify(id);let group=131072u+(id/64u)*2u;
 if(flags.x>0u){visibleIndices[compactState[group]+compactState[id*2u]]=id;}
 if(flags.y>0u){let divisor=select(1u,5u,dust.counts.w>.5);visibleIndices[65536u+(compactState[group+1u]+compactState[id*2u+1u])/divisor]=id;}
}

struct DustVertex {@builtin(position) position:vec4<f32>,@location(0) local:vec2<f32>,@location(1) @interpolate(flat) shape:vec4<f32>,@location(2) @interpolate(flat) energy:f32}
fn point(e:DustElement,i:u32)->vec2<f32>{switch i{case 0u:{return e.trail0.xy;}case 1u:{return e.trail0.zw;}case 2u:{return e.trail1.xy;}case 3u:{return e.trail1.zw;}case 4u:{return e.trail2.xy;}default:{return e.trail2.zw;}}}
@vertex fn vs_dust(@builtin(vertex_index) vertex:u32,@builtin(instance_index) instance:u32)->DustVertex{
 let debug=dust.counts.w>.5;let slot=select(instance,instance/5u,debug);let id=drawIndices[65536u+slot];let segment=select(0u,instance%5u,debug);let e=renderedDust[id];
 let a=point(e,segment);var b=point(e,segment+1u);
 if(!debug){b=a+(b-a)*.45;}
 var delta=(a-b)*dust.view.z;let len=length(delta);let axis=select(vec2(1.,0.),delta/max(.0001,len),len>.0001);
 let radius=select(e.look.x,.65,debug);let halfLen=select(min(len*.5,2.5),len*.5,debug);
 let corner=vec2(f32(vertex%2u)*2.-1.,f32(vertex/2u)*2.-1.);
 let local=corner*vec2(halfLen+radius,radius);
 let center=select(a,(a+b)*.5,debug);let world=center+(axis*local.x+vec2(-axis.y,axis.x)*local.y)/dust.view.z;
 let clip=(world-dust.camera.xy)*dust.view.z/(dust.view.xy*.5)*vec2(1.,-1.);
 let alpha=select(e.look.y,min(.75,e.look.y*2.2)*(.95-f32(segment)*.13),debug);
 return DustVertex(vec4(clip,0.,1.),local,vec4(halfLen,radius,alpha,e.look.z),e.look.w);
}
@vertex fn vs_dust_point(@builtin(vertex_index) vertex:u32)->DustVertex{
 let e=renderedDust[drawIndices[vertex]];let clip=(e.trail0.xy-dust.camera.xy)*dust.view.z/(dust.view.xy*.5)*vec2(1.,-1.);
 return DustVertex(vec4(clip,0.,1.),vec2(0.),vec4(0.,.5,e.look.y,e.look.z),e.look.w);
}
@fragment fn fs_dust(in:DustVertex)->@location(0) vec4<f32>{
 let d=length(vec2(max(abs(in.local.x)-in.shape.x,0.),in.local.y));
 let coverage=1.-smoothstep(max(0.,in.shape.y-.45),in.shape.y+.45,d);
 let light=mix(vec3(.65,.66,.65),clamp(envDiffuse(vec3(0.,0.,1.)),vec3(.18),vec3(1.4)),env.settings.w);
 var color=envDisplay(vec3(.65,.59,.47)*light);
 if(dust.counts.w>.5){color=mix(vec3(.22,.68,1.),vec3(1.,.46,.15),in.shape.w*.5+.5);}
 let alpha=in.shape.z*coverage;return vec4(color*alpha,alpha);
}
