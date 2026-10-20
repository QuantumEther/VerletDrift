// Optical reconstruction of the existing R=deposit / G=wet-coverage atlas.
// Shared water optics are provided by material.wgsl.
// One accessor lets the simulator select an atlas layer without duplicating optics.
fn sampleDepositedGround(uv:vec2<f32>)->vec2<f32>{
 return textureSampleLevel(groundTexture,linearSampler,uv,0.).rg;
}
// Value and analytical slope of the same smooth, seeded world-space noise.
fn noiseSlope(p:vec2<f32>)->vec3<f32> {
 let cell=vec2<i32>(floor(p));let f=fract(p);let v=f*f*(3.-2.*f);let dv=6.*f*(1.-f);
 let id=bitcast<u32>(cell.x)*1597334677u+bitcast<u32>(cell.y)*3812015801u;
 let a=hash(id);let b=hash(id+1597334677u);let c=hash(id+3812015801u);let d=hash(id+1597334677u+3812015801u);
 return vec3(mix(mix(a,b,v.x),mix(c,d,v.x),v.y),
  mix(b-a,d-c,v.y)*dv.x,mix(c-a,d-b,v.x)*dv.y);
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
// Shared local water lifetime also determines when dry-dye weathering can start.
fn localDryDuration(material:PuddleMaterial,terrain:f32,micro:f32)->f32 {
 let initial=material.standing*u.optics.y;
 let depthHold=smoothstep(.002,.075,initial);
 let retention=mix(.72,1.28,depthHold)*mix(.94,1.08,material.porosity)*mix(1.05,.95,terrain)
  *mix(1.10,.82,u.drying.z)*mix(1.,.82+micro*.36,u.drying.y);
 return max(1.,u.drying.x)*retention;
}
struct WeatheredDye { mass:f32, aging:f32 }
fn weatherDye(world:vec2<f32>,footprint:f32,mass:f32,deposit:f32,material:PuddleMaterial,terrain:f32,micro:f32,age:f32)->WeatheredDye {
 // Opt-in: the live simulator's zero reserved controls preserve its existing dye.
 if(u.pose.w<.5||u.counts.w<.5||mass<=0.){return WeatheredDye(mass,0.);}
 let dryEnd=u.optics.z+localDryDuration(material,terrain,micro)*(1.40+.15*u.drying.z);
 let elapsed=max(0.,age-dryEnd);
 if(elapsed<=0.){return WeatheredDye(mass,0.);}
 // Deep deposits and sheltered pore binding survive longer than weak edge stains.
 let strength=smoothstep(.025,.20,deposit);
 let binding=clamp((1.-terrain)*.55+material.porosity*.45,0.,1.);
 let retention=mix(.50,1.10,strength)*mix(.90,1.30,binding*u.bodyDrying.w);
 let exposure=elapsed/(max(1.,u.optics.w)*retention);
 let macroField=noise(world*.85+vec2(31.7,8.3));
 let meso=noise(world*4.5+vec2(12.1,27.4));
 // Band-limit pore detail at low zoom. Coordinates never move with time.
 let grain=mix(.5,noise(world*28.+vec2(5.2,16.8)),1.-smoothstep(.45,1.4,footprint*28.));
 let weatherRate=mix(1.,.85+.30*(macroField*.72+meso*.28),u.vehicle.w)
  *mix(1.,.86+.28*grain,smoothstep(.08,.85,exposure)*u.vehicle.w);
 // Remove local optical dye mass, not framebuffer opacity. The fixed loss term
 // clears weak films first; spatial rates split stronger remnants into pores.
 let remaining=max(0.,mass-pow(exposure,1.12)*(mass+.035)*weatherRate);
 return WeatheredDye(remaining,smoothstep(0.,.9,exposure));
}
struct DryPuddle { standing:f32,water:f32,wet:f32,progress:f32,residue:f32 }
fn dryPuddle(material:PuddleMaterial,terrain:f32,micro:f32,age:f32,depthAA:f32)->DryPuddle {
 let initial=material.standing*u.optics.y;
 var standing=initial;
 var water=material.water;
 if(u.optics.y!=1.){water=smoothstep(0.,max(.002,depthAA*.5),standing);}
 var wet=material.wet;var progress=0.;
 if(u.counts.w>.5&&age>u.optics.z){
  let duration=localDryDuration(material,terrain,micro);
  progress=clamp((age-u.optics.z)/duration,0.,1.);
  standing=initial*pow(1.-progress,1.7);
  water=smoothstep(0.,max(.002,depthAA*.5),standing);
  // Evaporating water first leaves a slower-drying damp film in the asphalt pores.
  // Keep a perceptible damp-asphalt phase after the standing pool has gone;
  // This interval finishes before any late dry-dye erosion begins.
  let dampProgress=clamp((age-u.optics.z)/(duration*(1.40+.15*u.drying.z)),0.,1.);
  wet=material.wet*(1.-smoothstep(.55,1.,dampProgress));
 }
 let residue=material.wet*u.drying.w*progress*.18;
 return DryPuddle(standing,water,wet,progress,residue);
}
fn waterRoughness(standing:f32,water:f32)->f32 {
 return mix(.58,mix(.085,.035,smoothstep(.003,.05,standing)),water);
}
fn settlingRipple(world:vec2<f32>,age:f32)->vec2<f32> {
 let center=u.event.xy+transferredVelocity()*.30;
 let delta=world-center;let radius=length(delta);
 let life=smoothstep(.85,1.2,age)*(1.-smoothstep(1.6,3.,age))*exp(-max(age-1.2,0.)*1.5);
 return delta/max(radius,.01)*cos(radius*17.-age*13.)*.008*life;
}
fn groundLiquid(world:vec2<f32>,asphalt:vec3<f32>)->vec3<f32> {
 let uv=(world-u.event.xy)/(u.ground.x*2.)+.5;
 let field=sampleDepositedGround(uv);
 let depthAA=max(fwidth(field.r),.0005);
 let footprint=length(fwidth(world));
 if(field.g<.0001){return asphalt;}
 let terrainA=noiseSlope(world*.55);let terrainB=noiseSlope(world*1.7+vec2(19.2,6.3));
 let terrain=terrainA.x*.72+terrainB.x*.28;
 // Pore filling and contact pinning leave wet grains between standing pools.
 // Isolated drops bead before they fully soak into the asphalt.
 let material=puddleMaterial(field.rg,terrain,depthAA);
 let micro=mix(noise(world*.72),noise(world*2.1+vec2(3.7,8.1)),.35);
 let dry=dryPuddle(material,terrain,micro,u.event.z,depthAA);
 let standing=dry.standing;let water=dry.water;let wet=dry.wet;
 let porosity=material.porosity;
 let stain=min(field.r,material.capacity)*mix(1.,u.drying.w,dry.progress)+dry.residue;
 let dye=weatherDye(world,footprint,stain+dry.residue,field.r,material,terrain,micro,u.event.z);
 let freshAbsorption=select(vec3(.4,4.5,7.),u.dye.xyz*.018,u.dye.w>.5);
 // Weathered pigment loses chroma and becomes a dull, embedded warm trace.
 let absorption=mix(freshAbsorption,vec3(1.,2.,2.8),dye.aging*.8);
 let poreTransmission=exp(-absorption*dye.mass*u.effect.w*2.5);
 // With no water left there is no water/air interface: retain only dye in
 // the substrate. This also avoids four atlas reads and the full wet BRDF.
 if(wet<=0.&&standing<=0.){
  if(dye.mass<=0.){return asphalt;}
  return toDisplay(toLinear(asphalt)*poreTransmission);
 }
 let texel=1./u.ground.y;
 let dx=sampleDepositedGround(uv+vec2(texel,0.)).r-sampleDepositedGround(uv-vec2(texel,0.)).r;
 let dy=sampleDepositedGround(uv+vec2(0.,texel)).r-sampleDepositedGround(uv-vec2(0.,texel)).r;
 let gradient=vec2(dx,dy)*u.ground.y/(u.ground.x*4.)*u.optics.y;
 let physicalDepth=standing*.035; // artistic proxy -> shallow millimetre layer
 let view=normalize(vec3(0.,.48,1.)); // same oblique height projection as clip()
 let grain=noiseSlope(world*24.);
 let initialStanding=material.standing*u.optics.y;
 let standingScale=select(1.,standing/max(initialStanding,.00001),initialStanding>.00001);
 let contactGradient=gradient*standingScale-.085*porosity*(terrainA.yz*.55*.72+terrainB.yz*1.7*.28)*standingScale;
 let meniscus=contactGradient/(length(contactGradient)+.03)*exp(-standing/.012)*.015;
 let fineSlope=grain.yz*.022*(1.-water*.98);
 let capillary=(terrainA.yz*.004+terrainB.yz*.003)*water;
 let ripple=settlingRipple(world,u.event.z)*water;
 let beading=beadWeight(field.g,u.counts.z)*water;
 let beadSlope=gradient/(length(gradient)+.001)*min(length(gradient)*1.2,.28)*beading;
 let n=normalize(vec3(-gradient*mix(.028,.004,porosity)-meniscus-beadSlope+fineSlope+capillary+ripple,1.));
 let roughness=clamp(waterRoughness(standing,water)*u.material.w,.025,.82);
 let reflected=reflect(-view,n);
 let environment=reflectedEnvironment(world,reflected,roughness);
 let fresnel=fresnelWater(dot(n,view));
 let light=normalize(vec3(.3,-.6,1.));
 // Finite emitter width and subpixel normal variation bound tiny-drop glints.
 let variance=clamp(depthAA/max(field.r,.005),0.,1.)*beading*.06;
 let highlightRoughness=sqrt(max(.085,roughness)*max(.085,roughness)+variance);
 let direct=ggxReflection(n,view,light,highlightRoughness)*vec3(.45,.42,.38);
 let reflection=(environment*fresnel+direct)*u.optics.x;
 // Millimetre-scale transmission retains the local road texture without blur.
 let substrate=toLinear(asphalt)*(1.-wet*.48);
 let transmission=waterTransmission(physicalDepth,dot(n,view),u.effect.w);
 let medium=waterMedium(standing*u.effect.w*12.);
 let transmitted=substrate*poreTransmission*transmission+medium;
 let filmReflection=reflection*mix(.28,1.,water);
 let color=transmitted*(1.-fresnel*wet)+filmReflection*wet;
 return toDisplay(color);
}
