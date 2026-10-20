// The live simulator's existing world is the optical substrate, never lab asphalt.
@group(0) @binding(1) var sceneTexture:texture_2d<f32>;
@group(0) @binding(2) var linearSampler:sampler;
@group(0) @binding(3) var groundTexture:texture_2d_array<f32>;
@group(0) @binding(5) var bodyTexture:texture_2d<f32>;
@group(0) @binding(6) var wheelTexture:texture_2d<f32>;
struct Wheels { pose:array<vec4<f32>,4>, dimensions:array<vec4<f32>,4> }
@group(0) @binding(7) var<uniform> wheels:Wheels;
struct Ghost { pose:vec4<f32>, shape:vec4<f32> }
@group(0) @binding(8) var<storage,read> ghosts:array<Ghost>;
struct Screen { @builtin(position) position:vec4<f32>, @location(0) uv:vec2<f32>, @location(1) @interpolate(flat) id:u32 }
fn loadEvent(i:u32) {
 u=events[i];u.view=frame.view;u.ground.zw=frame.ground.zw;
 u.car=frame.car;u.pose=frame.pose;u.light=frame.light;u.environment=frame.environment;
}
@vertex fn vs_full(@builtin(vertex_index) id:u32)->Screen {
 let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[id];
 return Screen(vec4(p,0.,1.),p*vec2(.5,-.5)+.5,0u);
}
@fragment fn fs_ground(in:Screen)->@location(0) vec4<f32> {
 let uv=in.position.xy/frame.view.xy;
 let world=(uv-.5)*frame.view.xy/frame.view.z+frame.ground.zw;
 var color=textureSampleLevel(sceneTexture,linearSampler,uv,0.).rgb;
 for(var i=0u;i<u32(frame.counts.x);i++){
  if(events[i].options.w<.5){continue;}
  loadEvent(i);eventLayer=i;
  if(u.options.w>.5&&u.event.z>=0.&&all(abs(world-u.event.xy)<vec2(u.ground.x))){color=groundLiquid(world,color);}
 }
 return vec4(color,1.);
}
@vertex fn vs_body(@builtin(vertex_index) id:u32)->Screen {
 u=frame;let q=corners(id)*.5;let world=u.car.xy+vehicleRotate(q*u.car.zw);
 return Screen(clip(vec3(world,0.)),q+.5,0u);
}
@fragment fn fs_body(in:Screen)->@location(0) vec4<f32> {
 u=frame;
 let art=textureSampleLevel(bodyTexture,linearSampler,in.uv,0.);
 var color=vehicleEnvironment(in.uv-.5,art.rgb);
 let world=(in.position.xy/frame.view.xy-.5)*frame.view.xy/frame.view.z+frame.ground.zw;
 for(var i=0u;i<u32(frame.counts.x);i++){
  loadEvent(i);
  if(u.bodyDrying.z>.5&&u.event.z>=0.){color=bodyLiquid(in.uv-.5,world,color);}
 }
 color=mix(color,vec3(.78,.20,.20),frame.options.w*.28);
 return vec4(color*art.a,art.a);
}
@vertex fn vs_wheel(@builtin(vertex_index) id:u32,@builtin(instance_index) wheel:u32)->Screen {
 u=frame;let p=wheels.pose[wheel];let q=corners(id)*.5;
 let d=q*wheels.dimensions[wheel].xy;
 let world=p.xy+vec2(d.x*p.z-d.y*p.w,d.x*p.w+d.y*p.z);
 return Screen(clip(vec3(world,0.)),q+.5,wheel);
}
@fragment fn fs_wheel(in:Screen)->@location(0) vec4<f32> {
 u=frame;let art=textureSampleLevel(wheelTexture,linearSampler,in.uv,0.);
 var color=art.rgb;if(u.environment.w>.5){color=toDisplay(toLinear(color)*liquidDiffuse(vec3(0.,0.,1.)));}
 return vec4(color*art.a,art.a);
}

// Preserve the existing sprite ghost trail, below the live car and airborne liquid.
@vertex fn vs_ghost(@builtin(vertex_index) id:u32,@builtin(instance_index) index:u32)->Screen {
 u=frame;let g=ghosts[index];let q=corners(id)*.5;let d=q*g.shape.xy;
 let world=g.pose.xy+vec2(d.x*g.pose.z-d.y*g.pose.w,d.x*g.pose.w+d.y*g.pose.z);
 return Screen(clip(vec3(world,0.)),q+.5,index);
}
@fragment fn fs_ghost(in:Screen)->@location(0) vec4<f32> {
 let g=ghosts[in.id];var art=textureSampleLevel(bodyTexture,linearSampler,in.uv,0.);
 if(g.shape.w>.5){art=textureSampleLevel(wheelTexture,linearSampler,in.uv,0.);}
 let a=art.a*g.shape.z;return vec4(art.rgb*a,a);
}
