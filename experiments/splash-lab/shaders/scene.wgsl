@group(0) @binding(1) var carTexture:texture_2d<f32>;
@group(0) @binding(2) var linearSampler:sampler;
@group(0) @binding(3) var groundTexture:texture_2d<f32>;
@group(0) @binding(6) var asphaltTexture:texture_2d<f32>;
struct Fullscreen { @builtin(position) position:vec4<f32>, @location(0) uv:vec2<f32> }
@vertex fn vs_fullscreen(@builtin(vertex_index) id:u32)->Fullscreen {
 let corners=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));let p=corners[id];
 return Fullscreen(vec4(p,0.,1.),p*vec2(.5,-.5)+vec2(.5));
}
// Static road shading is rebuilt only when the view or seeded surface changes.
@fragment fn fs_asphalt(in:Fullscreen)->@location(0) vec4<f32>{
 let world=(in.uv-.5)*u.view.xy/u.view.z+u.ground.zw;
 let footprint=length(fwidth(world));
 let grain=(noise(world*45.)-.5)*(1.-smoothstep(.2,1.,footprint*45.));
 let aggregate=(noise(world*14.)-.5)*(1.-smoothstep(.5,2.,footprint*14.));
 return vec4(grain*.045+aggregate*.035+(noise(world*1.8)-.5)*.025,0.,0.,1.);
}
fn shadeScene(in:Fullscreen,includeCar:bool)->vec4<f32>{
 let world=(in.uv-.5)*u.view.xy/u.view.z+u.ground.zw;
 var ground=vec3(.105,.115,.121)+vec3(textureLoad(asphaltTexture,vec2<i32>(in.position.xy),0).r);
 let line=(1.-smoothstep(.035,.065,abs(abs(world.x)-3.35)))*(.55+.45*step(.35,fract(world.y*.26)));
 ground=mix(ground,vec3(.28,.29,.27),line*.48);
 ground*=1.-.16*dot(in.uv-.5,in.uv-.5);

 ground=groundLiquid(world,ground);
 let local=(world-u.car.xy)/u.car.zw;
 let shadow=exp(-dot((local-vec2(.04,.025))*vec2(1.6,1.7),(local-vec2(.04,.025))*vec2(1.6,1.7))*3.);
 ground*=1.-shadow*.42;
 let wheel=(1.-smoothstep(.045,.06,abs(abs(local.x)-.45)))*(1.-smoothstep(.085,.10,abs(abs(local.y)-.31)));
 ground=mix(ground,vec3(.018,.022,.024),wheel);
 // A cropped, uniformly scaled copy of the existing body art. No simulator state.
 if(includeCar&&all(abs(local)<vec2(.5))){
  let pixel=textureSampleLevel(carTexture,linearSampler,local+.5,0.);
  if(u.options.w>.5){ground=mix(ground,bodyLiquid(local,world,pixel.rgb),pixel.a);}
  else {let body=1.-smoothstep(.43,.49,max(abs(local.x),abs(local.y)));ground=mix(ground,vec3(.58,.62,.64),body);if(abs(local.x)<.36 && abs(local.y+.04)<.16){ground=vec3(.075,.12,.14);}ground=mix(ground,bodyLiquid(local,world,ground),body);}
 }
 let balloon=balloonLayer(world);ground=mix(ground,balloon.rgb,balloon.a);
 return vec4(ground,1.);
}

fn balloonLayer(world:vec2<f32>)->vec4<f32>{
 // Balloon compresses immediately before rupture, then disappears at impact.
 if(u.event.z<0.){
  let squish=1.-smoothstep(-.12,0.,u.event.z)*.28;
  let b=(world-u.event.xy)/vec2(.36/squish,.36*squish);
  let r=length(b);let aa=max(fwidth(r),.002);let coverage=1.-smoothstep(1.-aa,1.+aa,r);
  let z=sqrt(max(0.,1.-dot(b,b)));
  let spec=pow(max(0.,1.-length((b-vec2(-.3,-.3))*vec2(2.,3.))),3.);
  let color=vec3(.65,.009,.024)*(.5+.5*z)+vec3(spec*.65);
  return vec4(color,coverage);
 }
 return vec4(0.);
}

@fragment fn fs_scene(in:Fullscreen)->@location(0) vec4<f32>{return shadeScene(in,true);}
@fragment fn fs_ground(in:Fullscreen)->@location(0) vec4<f32>{return shadeScene(in,false);}
// A bounded car draw keeps the body-film shader out of the fullscreen ground pass.
@vertex fn vs_car(@builtin(vertex_index) id:u32)->Fullscreen{
 let world=u.car.xy+corners(id)*(u.car.zw*.5+vec2(1./u.view.z));let p=clip(vec3(world,0.));
 return Fullscreen(p,p.xy*vec2(.5,-.5)+.5);
}
// Composite in shader before output quantization, retaining HDR edge highlights
// through the sprite alpha exactly as the original combined scene did.
@fragment fn fs_car(in:Fullscreen)->@location(0) vec4<f32>{
 // Recover screen UV from the pixel centre, not a subpixel-snapped sprite quad.
 return shadeScene(Fullscreen(in.position,in.position.xy/u.view.xy),true);
}
