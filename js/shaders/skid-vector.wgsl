// Persistent world-space event geometry; CPU supplies authoritative opacity only.
struct Camera { zoom: f32, ppm: f32, width: f32, height: f32, x: f32, y: f32 }
struct Segment { a: vec2<f32>, b: vec2<f32>, width: f32, r: f32, g: f32, bColor: f32 }
@group(0) @binding(0) var<uniform> cam: Camera;
@group(0) @binding(1) var<storage, read> segments: array<Segment>;
@group(0) @binding(2) var<storage, read> opacity: array<f32>;
@group(0) @binding(3) var<storage, read> order: array<u32>;
struct Out {
 @builtin(position) position: vec4<f32>,
 @location(0) local: vec2<f32>,
 @location(1) @interpolate(flat) shape: vec2<f32>,
 @location(2) @interpolate(flat) color: vec4<f32>,
 @location(3) world: vec2<f32>,
}
@vertex fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) instance: u32) -> Out {
 let corners = array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(1.,1.),vec2(-1.,-1.),vec2(1.,1.),vec2(-1.,1.));
 let idx=order[instance];
 let s = segments[idx]; let eff = cam.zoom * cam.ppm;
 let delta = s.b-s.a; let len = length(delta); let dir = delta/max(len,.00001);
 let axis = select(vec2(1.,0.),dir,len>.00001); let side=vec2(-axis.y,axis.x);
 let radius=max(s.width*.5,0.); let pad=1.5/eff;
 let local=vec2((corners[vi].x+1.)*.5*(len+2.*(radius+pad))-(radius+pad), corners[vi].y*(radius+pad));
 let world=s.a+axis*local.x+side*local.y;
 let ndc=(world-vec2(cam.x,cam.y))*eff/vec2(cam.width,cam.height)*vec2(2.,-2.);
 var out: Out;
 out.position=vec4(ndc,0.,1.); out.local=local; out.shape=vec2(len,radius);
 out.color=vec4(s.r,s.g,s.bColor,opacity[idx]);out.world=world;
 // Cull dead slots and offscreen segments before fragment shading.
 let center=(s.a+s.b)*.5-vec2(cam.x,cam.y);
 let extent=abs(delta)*.5+vec2(radius+pad);
 if (opacity[idx]<.001 || any(abs(center)-extent>vec2(cam.width,cam.height)/(2.*eff))) { out.position=vec4(2.,2.,0.,1.); }
 return out;
}
@fragment fn fs_main(in: Out) -> @location(0) vec4<f32> {
 let nearest=vec2(clamp(in.local.x,0.,in.shape.x),0.);
 let dist=length(in.local-nearest)-in.shape.y;
 let aa=max(fwidth(dist),.00001);
 var boundary=dist;
 if(env.settings.w>.5){
  let edgeFilter=1.-smoothstep(.25,1.2,length(fwidth(in.world))*24.);
  boundary+=(envGrain(in.world*24.).x-.5)*in.shape.y*.28*edgeFilter;
 }
 let coverage=1.-smoothstep(-aa*.5,aa*.5,boundary);
 // Tread grain is attached to the ground and band-limited at a distance.
 let frequency=96.;let attenuation=1.-smoothstep(.2,1.,length(fwidth(in.world))*frequency);
 var grain=.92+.08*sin(dot(in.world,vec2(71.3,129.7)))*attenuation;
 if(env.settings.w>.5){
  let footprint=length(fwidth(in.world));
  let road=envGrain(in.world*9.);
  let contactFilter=1.-smoothstep(.35,1.5,footprint*29.);
  let contact=envGrain(in.world*29.).x;
  let across=in.local.y/max(in.shape.y,.0001);
  // Symmetric longitudinal grooves remain continuous across adjacent segments.
  let grooveAA=max(fwidth(across),.025);
  let groove=(1.-smoothstep(.04,.04+grooveAA,abs(abs(across)-.38)))
    *(1.-smoothstep(.20,.7,grooveAA));
  grain=(.63+.37*smoothstep(.22,.72,road.x))
    *(1.-groove*.40)*(1.-(1.-contact)*.23*contactFilter);
 }
 // Partition rounded-cap coverage along the stroke. Adjacent short events
 // then carry the same optical density as one long event, instead of beads.
 let reach=max(sqrt(max(in.shape.y*in.shape.y-in.local.y*in.local.y,0.)),.00001);
 let weight=clamp((in.local.x+reach)/(2.*reach),0.,1.)
           -clamp((in.local.x-in.shape.x+reach)/(2.*reach),0.,1.);
 let alpha=1.-pow(1.-clamp(in.color.a,0.,.9999),coverage*grain*max(weight,0.));
 var pigment=in.color.rgb;
 if(env.settings.w>.5){
  let road=envGrain(in.world*9.);
  let normal=normalize(vec3(-road.yz*.06,1.));
  let color=envLinear(pigment)*envDiffuse(normal);
  // Only coloured paint tracks carry a thin wet film. Its strength follows the
  // existing depletion/opacity, not a second clock or independent liquid state.
  let colored=step(.15,max(pigment.r,max(pigment.g,pigment.b)));
  let wet=colored*smoothstep(.10,.48,in.color.a);
  let dx=dpdx(normal);let dy=dpdy(normal);
  let roughness=sqrt(pow(mix(.66,.17,wet),2.)+min(.10,(dot(dx,dx)+dot(dy,dy))*.25));
  let reflection=envSpecular(normal,roughness);
  pigment=envDisplay(color*(1.-wet*.18)+reflection*wet
    +vec3(.035,.045,.060)*env.settings.x*.0204*wet);
 }
 return vec4(pigment*alpha,alpha);
}
