// Optical reconstruction of the existing R=deposit / G=wet-coverage atlas.
// No changes to contact geometry, airborne shaders or simulation state.
fn toLinear(c:vec3<f32>)->vec3<f32> {
 return select(c/12.92,pow((c+.055)/1.055,vec3(2.4)),c>vec3(.04045));
}
fn toDisplay(c:vec3<f32>)->vec3<f32> {
 let v=max(c,vec3(0.));
 return select(v*12.92,1.055*pow(v,vec3(1./2.4))-.055,v>vec3(.0031308));
}
// Value and analytical slope of the same smooth, seeded world-space noise.
fn noiseSlope(p:vec2<f32>)->vec3<f32> {
 let cell=vec2<i32>(floor(p));let f=fract(p);let v=f*f*(3.-2.*f);let dv=6.*f*(1.-f);
 let id=bitcast<u32>(cell.x)*1597334677u+bitcast<u32>(cell.y)*3812015801u;
 let a=hash(id);let b=hash(id+1597334677u);let c=hash(id+3812015801u);let d=hash(id+1597334677u+3812015801u);
 return vec3(mix(mix(a,b,v.x),mix(c,d,v.x),v.y),
  mix(b-a,d-c,v.y)*dv.x,mix(c-a,d-b,v.x)*dv.y);
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
 // Reflect a fixed overhead rectangular luminaire, not a painted screen patch.
 // Roughness approximates convolution by widening the emitter's angular edge.
 let hit=world+ray.xy*(8./max(ray.z,.08));let offset=hit-vec2(-1.8,-6.4);
 let local=vec2(offset.x*.90-offset.y*.436,offset.x*.436+offset.y*.90);
 let blur=.055+roughness*roughness*18.;
 let box=1.-smoothstep(-blur,blur,rectangleDistance(local,vec2(.42,3.3)));
 let mullion=1.-(1.-smoothstep(.025,.04+blur,abs(local.y)))*.18/(.18+blur);
 let energy=(.42/(.42+blur*.6))*(3.3/(3.3+blur*.6));
 let sky=mix(vec3(.035,.045,.060),vec3(.080,.100,.130),clamp(ray.z,0.,1.));
 return sky+vec3(3.4,3.3,3.0)*box*mullion*energy;
}
fn normalizedWetCoverage(coverage:f32,layers:f32)->f32 {return coverage*2./layers;}
fn beadWeight(coverage:f32,layers:f32)->f32 {return 1.-smoothstep(.16,.30,normalizedWetCoverage(coverage,layers));}
struct PuddleMaterial {standing:f32,water:f32,wet:f32,porosity:f32,capacity:f32}
fn puddleMaterial(field:vec2<f32>,terrain:f32,depthAA:f32)->PuddleMaterial {
 let porosity=mix(.15,1.,smoothstep(.14,.32,normalizedWetCoverage(field.y,u.counts.z)));
 let capacity=(.032+.085*terrain)*porosity;
 let standing=max(0.,field.x-capacity);
 return PuddleMaterial(standing,smoothstep(0.,max(.002,depthAA*.5),standing),1.-exp(-field.y*3.),porosity,capacity);
}
fn waterRoughness(standing:f32,water:f32)->f32 {
 return mix(.58,mix(.085,.035,smoothstep(.003,.05,standing)),water);
}
fn waterTransmission(depth:f32,viewCosine:f32,concentration:f32)->vec3<f32> {
 let path=depth*(1.+1./max(viewCosine,.35));
 return exp(-vec3(18.,260.,420.)*path*concentration);
}
fn settlingRipple(world:vec2<f32>,age:f32)->vec2<f32> {
 let center=u.event.xy+transferredVelocity()*.30;
 let delta=world-center;let radius=length(delta);
 let life=smoothstep(.85,1.2,age)*(1.-smoothstep(1.6,3.,age))*exp(-max(age-1.2,0.)*1.5);
 return delta/max(radius,.01)*cos(radius*17.-age*13.)*.008*life;
}
fn groundLiquid(world:vec2<f32>,asphalt:vec3<f32>)->vec3<f32> {
 let uv=(world-u.event.xy)/(u.ground.x*2.)+.5;
 let field=textureSampleLevel(groundTexture,linearSampler,uv,0.);
 let depthAA=max(fwidth(field.r),.0005);
 if(field.g<.0001){return asphalt;}
 let texel=1./u.ground.y;
 let dx=textureSampleLevel(groundTexture,linearSampler,uv+vec2(texel,0.),0.).r-textureSampleLevel(groundTexture,linearSampler,uv-vec2(texel,0.),0.).r;
 let dy=textureSampleLevel(groundTexture,linearSampler,uv+vec2(0.,texel),0.).r-textureSampleLevel(groundTexture,linearSampler,uv-vec2(0.,texel),0.).r;
 let gradient=vec2(dx,dy)*u.ground.y/(u.ground.x*4.);
 let terrainA=noiseSlope(world*.55);let terrainB=noiseSlope(world*1.7+vec2(19.2,6.3));
 let terrain=terrainA.x*.72+terrainB.x*.28;
 // Pore filling and contact pinning leave wet grains between standing pools.
 // Isolated drops bead before they fully soak into the asphalt.
 let material=puddleMaterial(field.rg,terrain,depthAA);
 let standing=material.standing;let water=material.water;let wet=material.wet;
 let porosity=material.porosity;let stain=min(field.r,material.capacity);
 let physicalDepth=standing*.035; // artistic proxy -> shallow millimetre layer
 let view=normalize(vec3(0.,.48,1.)); // same oblique height projection as clip()
 let grain=noiseSlope(world*24.);
 let contactGradient=gradient-.085*porosity*(terrainA.yz*.55*.72+terrainB.yz*1.7*.28);
 let meniscus=contactGradient/(length(contactGradient)+.03)*exp(-standing/.012)*.015;
 let fineSlope=grain.yz*.022*(1.-water*.98);
 let capillary=(terrainA.yz*.004+terrainB.yz*.003)*water;
 let ripple=settlingRipple(world,u.event.z)*water;
 let beading=beadWeight(field.g,u.counts.z)*water;
 let beadSlope=gradient/(length(gradient)+.001)*min(length(gradient)*1.2,.28)*beading;
 let n=normalize(vec3(-gradient*mix(.028,.004,porosity)-meniscus-beadSlope+fineSlope+capillary+ripple,1.));
 let roughness=waterRoughness(standing,water);
 let reflected=reflect(-view,n);
 let environment=reflectedEnvironment(world,reflected,roughness);
 let fresnel=fresnelWater(dot(n,view));
 let light=normalize(vec3(.3,-.6,1.));
 // Finite emitter width and subpixel normal variation bound tiny-drop glints.
 let variance=clamp(depthAA/max(field.r,.005),0.,1.)*beading*.06;
 let highlightRoughness=sqrt(max(.085,roughness)*max(.085,roughness)+variance);
 let direct=ggxReflection(n,view,light,highlightRoughness)*vec3(.45,.42,.38);
 let reflection=environment*fresnel+direct;
 // Millimetre-scale transmission retains the local road texture without blur.
 let substrate=toLinear(asphalt)*(1.-wet*.48);
 let poreTransmission=exp(-vec3(.4,4.5,7.)*stain*u.effect.w*2.5);
 let transmission=waterTransmission(physicalDepth,dot(n,view),u.effect.w);
 let medium=vec3(.022,.00008,.00022)*(1.-exp(-standing*u.effect.w*12.));
 let transmitted=substrate*poreTransmission*transmission+medium;
 let filmReflection=reflection*mix(.28,1.,water);
 let color=transmitted*(1.-fresnel)+filmReflection*wet;
 return toDisplay(color);
}
