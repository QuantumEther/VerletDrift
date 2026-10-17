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
 let coverage=1.-smoothstep(-aa*.5,aa*.5,dist);
 // Tread grain is attached to the ground and band-limited at a distance.
 let frequency=96.;let attenuation=1.-smoothstep(.2,1.,length(fwidth(in.world))*frequency);
 let grain=.92+.08*sin(dot(in.world,vec2(71.3,129.7)))*attenuation;
 let alpha=in.color.a*coverage*grain;
 return vec4(in.color.rgb*alpha,alpha);
}
