@group(0) @binding(1) var carTexture:texture_2d<f32>;
@group(0) @binding(2) var linearSampler:sampler;
@group(0) @binding(3) var groundTexture:texture_2d<f32>;
struct Fullscreen { @builtin(position) position:vec4<f32>, @location(0) uv:vec2<f32> }
@vertex fn vs_fullscreen(@builtin(vertex_index) id:u32)->Fullscreen {
 let corners=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));let p=corners[id];
 return Fullscreen(vec4(p,0.,1.),p*vec2(.5,-.5)+vec2(.5));
}
fn groundLiquid(world:vec2<f32>,asphalt:vec3<f32>)->vec3<f32> {
 let uv=(world-u.event.xy)/(u.ground.x*2.)+.5;
 let field=textureSampleLevel(groundTexture,linearSampler,uv,0.);
 if(field.g<.0001){return asphalt;}
 let texel=1./u.ground.y;
 let dx=textureSampleLevel(groundTexture,linearSampler,uv+vec2(texel,0.),0.).r-textureSampleLevel(groundTexture,linearSampler,uv-vec2(texel,0.),0.).r;
 let dy=textureSampleLevel(groundTexture,linearSampler,uv+vec2(0.,texel),0.).r-textureSampleLevel(groundTexture,linearSampler,uv-vec2(0.,texel),0.).r;
 let depth=max(0.,field.r);let wet=1.-exp(-field.g*3.);
 let gradient=vec2(dx,dy)*u.ground.y/(u.ground.x*4.);
 // Depth gradients give meniscus highlights; asphalt micro-normal is damped wet.
 let micro=(vec2(noise(world*24.),noise(world*24.+vec2(17.3,3.2)))-.5)*.015;
 let normal=normalize(vec3(-gradient*.025+micro*(1.-wet*.95),1.));
 let light=normalize(vec3(vec2(-2.5,-4.)-world,8.));let halfVector=normalize(light+vec3(0.,0.,1.));
 let sharp=pow(max(0.,dot(normal,halfVector)),180.);
 let soft=pow(max(0.,dot(normal,normalize(vec3(.1,-.12,1.)))),28.)*.035;
 let transmission=exp(-vec3(.32,7.,10.)*depth*u.effect.w);
 let dye=vec3(.55,.003,.012)*(1.-exp(-depth*u.effect.w*3.));
 let darkened=asphalt*(1.-wet*.36);
 let pool=darkened*transmission+dye;
 let coverage=smoothstep(.0005,.012,depth);
 return mix(darkened,pool,coverage)+vec3(.85,.91,1.)*(sharp*.40+soft)*wet;
}
@fragment fn fs_scene(in:Fullscreen)->@location(0) vec4<f32>{
 let world=(in.uv-.5)*u.view.xy/u.view.z+u.ground.zw;
 let footprint=length(fwidth(world));
 let grain=(noise(world*45.)-.5)*(1.-smoothstep(.2,1.,footprint*45.));
 var ground=vec3(.105,.115,.121)+vec3(grain*.045+(noise(world*1.8)-.5)*.025);
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
 if(all(abs(local)<vec2(.5))){
  let pixel=textureSampleLevel(carTexture,linearSampler,local+.5,0.);
  if(u.options.w>.5){ground=mix(ground,pixel.rgb,pixel.a);}
  else {let body=1.-smoothstep(.43,.49,max(abs(local.x),abs(local.y)));ground=mix(ground,vec3(.58,.62,.64),body);if(abs(local.x)<.36 && abs(local.y+.04)<.16){ground=vec3(.075,.12,.14);}}
 }
 // Balloon compresses immediately before rupture, then disappears at impact.
 if(u.event.z<0.){
  let squish=1.-smoothstep(-.12,0.,u.event.z)*.28;
  let b=(world-u.event.xy)/vec2(.36/squish,.36*squish);
  let r=length(b);let aa=max(fwidth(r),.002);let coverage=1.-smoothstep(1.-aa,1.+aa,r);
  let z=sqrt(max(0.,1.-dot(b,b)));
  let spec=pow(max(0.,1.-length((b-vec2(-.3,-.3))*vec2(2.,3.))),3.);
  let color=vec3(.65,.009,.024)*(.5+.5*z)+vec3(spec*.65);
  ground=mix(ground,color,coverage);
 }
 return vec4(ground,1.);
}
