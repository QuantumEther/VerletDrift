// Shared linear-light crimson-water optics for airborne and deposited liquid.
fn toLinear(c:vec3<f32>)->vec3<f32> {
 return select(c/12.92,pow((c+.055)/1.055,vec3(2.4)),c>vec3(.04045));
}
fn toDisplay(c:vec3<f32>)->vec3<f32> {
 let v=max(c,vec3(0.));
 return select(v*12.92,1.055*pow(v,vec3(1./2.4))-.055,v>vec3(.0031308));
}
fn fresnelWater(cosine:f32)->f32 {
 // Air/water IOR 1.333 gives normal-incidence reflectance about 0.0204.
 return .0204+.9796*pow(1.-clamp(cosine,0.,1.),5.);
}
fn ggxReflection(n:vec3<f32>,v:vec3<f32>,l:vec3<f32>,roughness:f32)->f32 {
 let h=normalize(v+l);let nv=max(dot(n,v),.001);let nl=max(dot(n,l),.001);
 let nh=max(dot(n,h),0.);let vh=max(dot(v,h),0.);
 let a2=pow(roughness,4.);let denominator=nh*nh*(a2-1.)+1.;
 let distribution=a2/max(PI*denominator*denominator,.000000000001);
 let gv=2.*nv/(nv+sqrt(a2+(1.-a2)*nv*nv));
 let gl=2.*nl/(nl+sqrt(a2+(1.-a2)*nl*nl));
 return distribution*gv*gl*fresnelWater(vh)/(4.*nv);
}
fn rectangleDistance(p:vec2<f32>,halfSize:vec2<f32>)->f32 {
 let q=abs(p)-halfSize;
 return length(max(q,vec2(0.)))+min(max(q.x,q.y),0.);
}
fn reflectedEnvironment(world:vec2<f32>,ray:vec3<f32>,roughness:f32)->vec3<f32> {
 if(u.environment.w>.5){
  let sun=u.light.xyz;
  let turn=atan2(sun.y,sun.x)-254.*PI/180.;
  let heightScale=(length(sun.xy)/max(sun.z,.12))/.83909963;
  let anchor=vec2(-1.8,-6.4)*heightScale;
  let centre=vec2(anchor.x*cos(turn)-anchor.y*sin(turn),anchor.x*sin(turn)+anchor.y*cos(turn));
  let delta=ray.xy*(8./max(ray.z,.08))-centre;
  let aligned=vec2(delta.x*cos(turn)+delta.y*sin(turn),-delta.x*sin(turn)+delta.y*cos(turn));
  let local=vec2(aligned.x*.90-aligned.y*.436,aligned.x*.436+aligned.y*.90);
  // Retain the proven elongated key, now positioned by the shared light rig.
  let blur=.055+roughness*roughness*18.;
  let size=vec2(.42,3.3)*(.5+u.environment.y);
  let key=1.-smoothstep(-blur,blur,rectangleDistance(local,size));
  let energy=(size.x/(size.x+blur*.6))*(size.y/(size.y+blur*.6));
  let sky=mix(vec3(.035,.045,.060),vec3(.080,.100,.130),clamp(ray.z,0.,1.))*u.environment.x/.55;
  let mullion=1.-(1.-smoothstep(.025,.04+blur,abs(local.y)))*.18/(.18+blur);
  return sky+liquidSunColor()*key*mullion*energy*8.;
 }
 // Reflect a fixed overhead rectangular luminaire, not a painted screen patch.
 // Roughness approximates convolution by widening the emitter's angular edge.
 // A distant environment is translation invariant across the live map. The
 // laboratory retains its finite local luminaire when pose.z is zero.
 let origin=select(world,vec2(0.),u.pose.z>.5);
 let hit=origin+ray.xy*(8./max(ray.z,.08));let offset=hit-vec2(-1.8,-6.4);
 let local=vec2(offset.x*.90-offset.y*.436,offset.x*.436+offset.y*.90);
 let blur=.055+roughness*roughness*18.;
 let box=1.-smoothstep(-blur,blur,rectangleDistance(local,vec2(.42,3.3)));
 let mullion=1.-(1.-smoothstep(.025,.04+blur,abs(local.y)))*.18/(.18+blur);
 let energy=(.42/(.42+blur*.6))*(3.3/(3.3+blur*.6));
 let sky=mix(vec3(.035,.045,.060),vec3(.080,.100,.130),clamp(ray.z,0.,1.));
 return sky+vec3(3.4,3.3,3.0)*box*mullion*energy;
}
fn waterTransmission(depth:f32,viewCosine:f32,concentration:f32)->vec3<f32> {
 let path=depth*(1.+1./max(viewCosine,.35));
 return exp(-select(vec3(18.,260.,420.),u.dye.xyz,u.dye.w>.5)*path*concentration);
}
// Weak ambient return from dyed water, shared with the reference puddle.
fn waterMedium(opticalMass:f32)->vec3<f32> {
 let tint=select(vec3(.022,.00008,.00022),exp(-u.dye.xyz*.025)*.035,u.dye.w>.5);
 return tint*(1.-exp(-opticalMass))*select(1.,u.environment.x/.55,u.environment.w>.5);
}

// Live scene lighting; zero environment flags retain the laboratory reference rig.
fn liquidSun()->vec3<f32>{return select(normalize(vec3(.3,-.6,1.)),u.light.xyz,u.environment.w>.5);}
fn liquidSunColor()->vec3<f32>{
 if(u.environment.w<.5){return vec3(.45,.42,.38);}
 let t=u.environment.z;let tint=select(vec3(1.-t*.12,1.-t*.05,1.),vec3(1.,1.+t*.16,1.+t*.30),t<0.);
 return tint*u.light.w*.50;
}
fn liquidDiffuse(normal:vec3<f32>)->vec3<f32>{
 return vec3(.88,.94,1.)*u.environment.x*.7+liquidSunColor()*1.8*max(0.,dot(normal,u.light.xyz));
}
fn vehicleEnvironment(q:vec2<f32>,art:vec3<f32>)->vec3<f32>{
 if(u.environment.w<.5){return art;}
 // Artwork supplies baked detail. A coarse hood/glass normal adds only restrained
 // directional clearcoat response; it does not reconstruct missing 3D geometry.
 let glass=smoothstep(-.30,-.22,q.y)*(1.-smoothstep(-.08,.02,q.y));
 let slope=vehicleRotate(vec2(q.x*.20,-.03-glass*.20));
 let n=normalize(vec3(slope,1.));let view=normalize(vec3(0.,.48,1.));
 let direct=liquidSunColor()*2.;
 let diffuse=liquidDiffuse(n);
 let halfVector=normalize(view+u.light.xyz);
 let coat=pow(max(0.,dot(n,halfVector)),60.)*.035;
 return toDisplay(toLinear(art)*diffuse+direct*coat);
}
fn liquidGroundVisibility(world:vec2<f32>)->f32{
 if(u.environment.w<.5){return 1.;}
 // Coarse shadow receiver for liquid reflections; the substrate already carries
 // the world contact shadow. Use the same 0.65 m artistic body-height proxy.
 let centre=u.car.xy-u.light.xy/max(u.light.z,.25)*.65;
 let q=abs(vehicleUnrotate(world-centre)/max(u.car.zw,vec2(.01)));
 let cover=1.-smoothstep(.40,.58+u.environment.y*.05,max(q.x,q.y));
 return 1.-cover*.75;
}
