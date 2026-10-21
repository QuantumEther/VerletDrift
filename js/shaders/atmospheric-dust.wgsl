// Fixed world cells advect with wind. Only the visible lattice is instantiated.
struct DustFrame {view:vec4<f32>,camera:vec4<f32>,body:vec4<f32>,motion:vec4<f32>,wind:vec4<f32>,fine:vec4<f32>,coarse:vec4<f32>,counts:vec4<f32>,appearance:vec4<f32>}
struct Wake {place:vec4<f32>,motion:vec4<f32>}
@group(0) @binding(0) var<uniform> dust:DustFrame;
@group(0) @binding(1) var<storage,read> wakes:array<Wake>;
struct DustElement {position:vec4<f32>,shape:vec4<f32>}
@group(0) @binding(2) var<storage,read_write> computedDust:array<DustElement>;
@group(0) @binding(3) var<storage,read> renderedDust:array<DustElement>;
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
  let event=wakes[(u32(dust.counts.y+dust.counts.z)-1u-i)%arrayLength(&wakes)];
  let age=dust.view.w-event.place.z;
  if(age>dust.wind.z){break;}
  if(age<0.){continue;}
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
@compute @workgroup_size(64) fn prepare_dust(@builtin(global_invocation_id) invocation:vec3<u32>){
 let id=invocation.x;if(id>=u32(dust.coarse.w+dust.counts.x)){return;}
 let veil=id<u32(dust.coarse.w);
 let index=select(id-u32(dust.coarse.w),id,veil);
 let grid=select(dust.fine,dust.coarse,veil);
 let cellScale=select(1.25,3.,veil);
 let stride=select(grid.w,dust.counts.w,veil);
 let cell=vec2<i32>(grid.xy+vec2(f32(index%u32(grid.z)),f32(index/u32(grid.z)))*stride);
 let seed=envHash(cell+select(vec2(0),vec2(7919),veil));
 let rank=fract(seed*37.31);let density=dust.motion.z*dust.wind.w;
 // Density/adaptive thinning also skips wake evaluation, not just blending.
 if(!veil&&(density<=0.||rank>=density+.02)){computedDust[id]=DustElement(vec4(0.),vec4(0.));return;}
 let height=.15+1.8*fract(seed*19.37);
 let jitter=vec2(fract(seed*53.7),fract(seed*97.3));
 var p=(vec2<f32>(cell)+select(jitter,vec2(.5)+(jitter-.5)*.4,veil))*cellScale+dust.wind.xy*dust.view.w;
 p+=vec2(sin(dust.view.w*.36+seed*31.),cos(dust.view.w*.29+seed*23.))*.09;
 let disturbance=dustFlow(p);
 // Ambient motes already fill the world. Avoid rasterizing imperceptible veils.
 if(veil&&disturbance.z<=.006){computedDust[id]=DustElement(vec4(0.),vec4(0.));return;}
 p+=disturbance.xy;
 // A restrained height projection gives motes parallax against the road on pans.
 p=dust.camera.xy+(p-dust.camera.xy)*select(1.+height*.018,1.,veil)+vec2(0.,-height*.32);
 let radius=select(.030+.045*fract(seed*71.1),2.4+1.1*seed,veil);
 let screenRadius=max(radius*dust.view.z,select(.55,0.,veil));
 let visible=1.-smoothstep(density*.95,density+.02,rank);
 let alpha=select((.08+.14*fract(seed*83.7))*visible,
  dust.appearance.x*.40*disturbance.z*smoothstep(.006,.06,disturbance.z),veil);
 computedDust[id]=DustElement(vec4(p,screenRadius,alpha),vec4(select(height,atan2(disturbance.y,disturbance.x),veil),select(0.,1.,veil),disturbance.z,seed));
}
@vertex fn vs_dust(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->DustVertex{
 let element=renderedDust[id];
 let corner=vec2(f32(vertex%2u)*2.-1.,f32(vertex/2u)*2.-1.);
 var offset=corner;
 if(element.shape.y>.5){
  // Elongated wisps follow analytical entrainment, not the screen or car sprite.
  let a=element.shape.x;let axis=vec2(cos(a),sin(a));
  offset=axis*corner.x*1.35+vec2(-axis.y,axis.x)*corner.y*.72;
 }
 let world=element.position.xy+offset*element.position.z/dust.view.z;
 let clip=(world-dust.camera.xy)*dust.view.z/(dust.view.xy*.5)*vec2(1.,-1.);
 return DustVertex(vec4(clip,0.,1.),corner,world,vec4(element.position.w,element.shape.xyz),element.shape.w);
}
@fragment fn fs_dust(in:DustVertex)->@location(0) vec4<f32>{
 let r2=dot(in.local,in.local);let aa=max(fwidth(r2),.03);
 var coverage=1.-smoothstep(.35-aa,1.+aa,r2);
 if(in.shape.z>.5){
  let variation=envGrain(in.world*.65+vec2(17.,3.)).x*.65+envGrain(in.world*1.6).x*.35;
  coverage=exp(-r2*1.8)*mix(.18,1.,smoothstep(.20,.72,variation))*(1.-smoothstep(.45,1.,r2));
 }
 let light=mix(vec3(.65,.66,.65),clamp(envDiffuse(vec3(0.,0.,1.)),vec3(.18),vec3(1.4)),env.settings.w);
 // Muted mineral scattering, premultiplied extinction; no additive glow.
 let color=envDisplay(vec3(.46,.40,.30)*light);
 let alpha=clamp(in.shape.x*coverage,0.,.32);
 return vec4(color*alpha,alpha);
}
