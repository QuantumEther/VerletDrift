// Fixed world cells advect with wind. Only the visible lattice is instantiated.
struct DustFrame {view:vec4<f32>,camera:vec4<f32>,body:vec4<f32>,motion:vec4<f32>,wind:vec4<f32>,fine:vec4<f32>,coarse:vec4<f32>,counts:vec4<f32>}
struct Wake {place:vec4<f32>,motion:vec4<f32>}
@group(0) @binding(0) var<uniform> dust:DustFrame;
@group(0) @binding(1) var<storage,read> wakes:array<Wake>;
struct DustVertex {@builtin(position) position:vec4<f32>,@location(0) local:vec2<f32>,@location(1) world:vec2<f32>,@location(2) shape:vec4<f32>,@location(3) @interpolate(flat) seed:f32}
fn dustFlow(p:vec2<f32>)->vec3<f32>{
 var flow=vec2(0.);var energy=0.;
 let velocity=dust.body.zw;let speed=length(velocity);
 let forward=vec2(sin(dust.motion.x),-cos(dust.motion.x));let right=vec2(-forward.y,forward.x);
 let direction=velocity/max(speed,.01);let side=vec2(-direction.y,direction.x);
 let relative=p-dust.body.xy;let across=dot(relative,right);let ahead=dot(relative,forward);
 let slip=dot(velocity,right)/max(speed,.1);
 let near=exp(-pow(across/(dust.camera.w*.65+.7),2.)-pow(ahead/(dust.camera.z*.65+1.),2.));
 // Outward pressure ahead, side entrainment, and a slip-biased body disturbance.
 flow+=near*(right*across/(abs(across)+.4)*min(speed*.065,1.6)*(1.+slip*across/(abs(across)+.5)*.4)+direction*min(speed*.018,.55));
 flow+=near*vec2(-relative.y,relative.x)*clamp(dust.motion.y,-3.,3.)*.10;
 energy+=near*min(speed/18.,1.6);
 for(var i=0u;i<u32(dust.counts.z);i++){
  let event=wakes[(u32(dust.counts.y)+i)%arrayLength(&wakes)];
  let age=dust.view.w-event.place.z;
  if(age<0.||age>dust.wind.z){continue;}
  let v=event.motion.xy;let s=length(v);let axis=v/max(s,.01);let lateral=vec2(-axis.y,axis.x);
  let delta=p-event.place.xy-axis*min(s*age*.055,2.);
  let radius=2.+age*.40;
  if(dot(delta,delta)>radius*radius*9.){continue;}
  let x=dot(delta,lateral);let y=dot(delta,axis);
  let life=(1.-exp(-age*7.))*exp(-age/max(.15,dust.wind.z*.36))*(1.-smoothstep(.7,1.,age/dust.wind.z));
  let weight=exp(-x*x/(radius*radius)-y*y/(radius*radius*1.8))*life*.26;
  let face=vec2(sin(event.motion.z),-cos(event.motion.z));
  let lateralSlip=dot(v,vec2(-face.y,face.x))/max(s,.1);
  let bias=1.+lateralSlip*x/(abs(x)+.5)*.60;
  let swirl=sin(age*2.4+event.place.z*1.7)*.25+clamp(event.motion.w,-3.,3.)*.3;
  flow+=weight*bias*(lateral*x/(abs(x)+.6)*min(s*.10,2.)+axis*min(s*.035,.8)+vec2(-delta.y,delta.x)*swirl);
  energy+=weight*bias*min(s/16.+abs(event.motion.w)*.2,2.);
 }
 flow*=dust.motion.w;
 return vec3(flow/(1.+length(flow)*.20),min(2.,energy*dust.motion.w));
}
@vertex fn vs_dust(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->DustVertex{
 let veil=id<u32(dust.coarse.w);
 let index=select(id-u32(dust.coarse.w),id,veil);
 let grid=select(dust.fine,dust.coarse,veil);
 let cellScale=select(1.25,6.,veil);
 let stride=select(grid.w,dust.counts.w,veil);
 let cell=vec2<i32>(grid.xy+vec2(f32(index%u32(grid.z)),f32(index/u32(grid.z)))*stride);
 let seed=envHash(cell+select(vec2(0),vec2(7919),veil));
 let height=.15+1.8*fract(seed*19.37);
 var p=(vec2<f32>(cell)+vec2(fract(seed*53.7),fract(seed*97.3)))*cellScale+dust.wind.xy*dust.view.w;
 p+=vec2(sin(dust.view.w*.36+seed*31.),cos(dust.view.w*.29+seed*23.))*.09;
 let disturbance=dustFlow(p);p+=disturbance.xy;
 p+=vec2(0.,-height*.32); // Fixed oblique height projection, not camera-locked noise.
 let corner=vec2(f32(vertex%2u)*2.-1.,f32(vertex/2u)*2.-1.);
 let radius=select(.018+.030*fract(seed*71.1),1.7+1.6*seed,veil);
 let screenRadius=max(radius*dust.view.z,select(.55,0.,veil));
 let world=p+corner*screenRadius/dust.view.z;
 let clip=(world-dust.camera.xy)*dust.view.z/(dust.view.xy*.5)*vec2(1.,-1.);
 let rank=fract(seed*37.31);let density=dust.motion.z*dust.wind.w;
 let visible=1.-smoothstep(density*.95,density+.02,rank);
 let alpha=select((.08+.14*fract(seed*83.7))*visible,
  dust.motion.z*(.007+.22*disturbance.z),veil);
 return DustVertex(vec4(clip,0.,1.),corner,world,vec4(alpha,height,select(0.,1.,veil),disturbance.z),seed);
}
@fragment fn fs_dust(in:DustVertex)->@location(0) vec4<f32>{
 let r2=dot(in.local,in.local);let aa=max(fwidth(r2),.03);
 var coverage=1.-smoothstep(.35-aa,1.+aa,r2);
 if(in.shape.z>.5){
  let variation=envGrain(in.world*.65+vec2(17.,3.)).x*.65+envGrain(in.world*1.6).x*.35;
  coverage=exp(-r2*2.8)*smoothstep(.10,.70,variation)*(1.-smoothstep(.5,1.,r2));
 }
 let light=mix(vec3(.65,.66,.65),clamp(envDiffuse(vec3(0.,0.,1.)),vec3(.18),vec3(1.4)),env.settings.w);
 // Muted mineral scattering, premultiplied extinction; no additive glow.
 let color=envDisplay(vec3(.24,.225,.20)*light);
 let alpha=clamp(in.shape.x*coverage,0.,.20);
 return vec4(color*alpha,alpha);
}
