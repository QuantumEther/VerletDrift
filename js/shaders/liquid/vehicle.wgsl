// Analytic car-local liquid field. Reconstruct from event age, never frame history.
// Sprite coordinates: nose y=-.5, hood [-.48,-.26], windshield [-.26,-.05].
fn vehicleLocal(projected:vec2<f32>)->vec2<f32> {return vehicleUnrotate(projected-u.car.xy)/u.car.zw;}
fn vehicleFootprint(q:vec2<f32>)->f32 {
 return (1.-smoothstep(.39,.47,abs(q.x)))*(1.-smoothstep(.46,.50,abs(q.y)));
}
fn vehicleHeight(q:vec2<f32>)->f32 {
 let cabin=smoothstep(-.28,-.06,q.y)*(1.-smoothstep(.22,.43,q.y));
 return .38+.48*cabin;
}
fn bodyArrival(q:vec2<f32>)->f32 {
 // Advected encounter wave: front stagnation -> hood -> glass -> upper body.
 return .035+max(0.,q.y+.49)*u.car.w/(2.4+u.effect.x*.14);
}
fn vehicleDeflect(point:vec3<f32>)->vec3<f32> {
 if(u.bodyDrying.z<.5||u.vehicle.z<=0.||u.event.z<0.||u.event.z>=1.8){return point;}
 let q=vehicleLocal(vec2(point.x,point.y-point.z*.48));
 if(any(abs(q)>vec2(.52))){return point;}
 let contact=smoothstep(bodyArrival(q)-.06,bodyArrival(q)+.12,u.event.z);
 let low=1.-smoothstep(vehicleHeight(q)+.05,vehicleHeight(q)+.45,point.z);
 let gate=vehicleFootprint(q)*low*contact*(1.-smoothstep(1.1,1.8,u.event.z))*u.bodyDrying.z;
 let front=1.-smoothstep(-.20,.16,q.y);
 let side=q.x/sqrt(q.x*q.x+.0018);
 let strength=u.vehicle.z*gate*clamp(u.effect.x/22.,.35,1.6);
 let sideways=side*(.30+.44*front)*strength;
 let windshield=smoothstep(-.34,-.20,q.y)*(1.-smoothstep(-.08,.12,q.y));
 let lift=(.10+.34*windshield)*(1.-smoothstep(.22,.46,abs(q.x)))*strength;
 // Tangent response at the body, not scaling of the radial splash silhouette.
 return point+vec3(vehicleRotate(vec2(sideways,.20*front*strength))+vec2(0.,.48*lift),lift);
}
fn vehicleTransmission(point:vec3<f32>)->f32 {
 let q=vehicleLocal(vec2(point.x,point.y-point.z*.48));
 if(any(abs(q)>vec2(.52))){return 1.;}
 let surface=max(1.05,vehicleHeight(q)+.35);
 let caught=vehicleFootprint(q)*(1.-smoothstep(surface+.12,surface+.35,point.z));
 return 1.-caught;
}
struct BodyFilm { depth:f32, wet:f32, residue:f32, caught:f32, opticalDepth:f32, slope:vec2<f32> }
fn bodyFilm(q:vec2<f32>,age:f32)->BodyFilm {
 if(age<=bodyArrival(q)||u.bodyDrying.z<.5||u.vehicle.x<=0.){return BodyFilm(0.,0.,0.,0.,0.,vec2(0.));}
 let elapsed=age-bodyArrival(q);
 let caught=smoothstep(0.,.14,elapsed)*u.bodyDrying.z;
 let flow=min(max(elapsed,0.),2.5)*u.vehicle.y;
 let rear=smoothstep(-.30,.30,q.y);
 // Flow divides at the hood centre, feeds side gutters and climbs the glass.
 let split=.08+.23*smoothstep(-.49,-.16,q.y);
 let gutter=exp(-pow((abs(q.x)-split)/.065,2.));
 let hood=exp(-pow((abs(q.x)-split*.7)/.11,2.)-pow((q.y+.34)*5.5,2.));
 let glass=smoothstep(-.31,-.23,q.y)*(1.-smoothstep(.12,.28,q.y));
 let lane=floor((q.x+.5)*9.);let laneSeed=noise(vec2(lane,6.7));
 let centre=(lane+.24+laneSeed*.52)/9.-.5;
 let frequency=15.+laneSeed*14.;let phase=q.y*frequency+laneSeed*23.;
 let path=q.x-centre+.009*sin(phase);let width=.006+.010*laneSeed;
 let stripe=exp(-pow(path/width,2.));
 let broken=smoothstep(.24,.68,noise(vec2(q.x*19.,(q.y-flow*.032)*9.)));
 let streak=stripe*glass*mix(.25,1.7,clamp(u.vehicle.y*.5,0.,1.))*(.35+.65*noise(vec2(lane*3.,q.y*6.-flow*.17)));
 let mottling=smoothstep(.22,.67,noise(q*vec2(13.,10.)+vec2(4.3,8.7)));
 let grid=q*vec2(14.,21.);let cell=floor(grid);
 let jitter=vec2(noise(cell+vec2(7.1,3.)),noise(cell+vec2(2.9,9.)))-.5;
 let beadRadius=.10+.20*pow(noise(cell),2.);
 // Radius-aware jitter keeps every bead inside its source cell (no clipped seams).
 let beadUV=(fract(grid)-.5-jitter*(.98-2.*beadRadius))/beadRadius;
 let beadBase=max(0.,1.-dot(beadUV,beadUV));let beadGate=step(.72,noise(cell+17.));
 let bead=pow(beadBase,1.5)*beadGate;
 let distribution=(hood*.70+gutter*.50+streak*.95+mottling*.025)*(1.-rear*.60);
 let dose=u.vehicle.x*pow(u.effect.y/18.,.33333);
 let initial=(.015*distribution*(.08+.92*broken)+.010*bead*(.35+.65*glass))*dose;
 let drainage=exp(-flow*.26*(.35+.65*abs(q.x)*2.));
 let drained=initial*drainage;
 let retention=.65+smoothstep(.0001,.002,drained)*.55+noise(q*8.)*.16;
 let progress=clamp(max(0.,age-3.)/(max(1.,u.bodyDrying.x)*retention),0.,1.);
 let depth=drained*pow(1.-progress,1.5)*caught;
 let wet=smoothstep(.000015,.00010,depth);
 let residue=(1.-exp(-max(0.,initial-.001)*220.))*u.bodyDrying.y*progress*caught;
 // Evaporation concentrates retained dye while the water film gets thinner.
 let opticalDepth=drained*(1.-progress*.65)*caught;
 // Analytic normals of the dominant streams and beads avoid four extra field
 // evaluations per car pixel. Coarse wetting noise changes coverage, not normals.
 let t=clamp((q.y+.49)/.33,0.,1.);let splitSlope=.23*6.*t*(1.-t)/.33;
 let hoodX=abs(q.x)-split*.7;let gutterX=abs(q.x)-split;
 let hoodSlope=hood*vec2(-2.*hoodX*sign(q.x)/(.11*.11),2.*hoodX*splitSlope*.7/(.11*.11)-2.*(q.y+.34)*5.5*5.5);
 let gutterSlope=gutter*vec2(-2.*gutterX*sign(q.x),2.*gutterX*splitSlope)/(.065*.065);
 let streakSlope=(-2.*path/(width*width))*streak*vec2(1.,.009*frequency*cos(phase));
 let beadSlope=-3.*sqrt(beadBase)*beadUV*vec2(14.,21.)/beadRadius*beadGate;
 let derivative=(.015*(hoodSlope*.70+gutterSlope*.50+streakSlope*.95)*(1.-rear*.60)*(.08+.92*broken)
  +.010*beadSlope*(.35+.65*glass))*dose;
 let slope=derivative*drainage*pow(1.-progress,1.5)*caught;
 return BodyFilm(depth,wet,residue,caught,opticalDepth,slope);
}
fn bodyLiquid(q:vec2<f32>,world:vec2<f32>,art:vec3<f32>)->vec3<f32> {
 if(u.bodyDrying.z<.5||u.event.z<=0.||u.vehicle.x<=0.){return art;}
 let film=bodyFilm(q,u.event.z);
 if(film.wet<=0.&&film.residue<=0.){return art;}
 let glass=smoothstep(-.30,-.22,q.y)*(1.-smoothstep(-.08,.02,q.y));
 let slope=vehicleRotate(film.slope/u.car.zw);
 let n=normalize(vec3(-slope*.25+vehicleRotate(vec2(q.x*.38,-.025-glass*.25)),1.));
 let view=normalize(vec3(0.,.48,1.));let nv=max(dot(n,view),.001);
 let roughness=clamp(mix(.24,.06,film.wet)*u.material.w,.04,.75);
 let ray=reflect(-view,n);let fresnel=fresnelWater(nv);
 // Integrate the fixed luminaire over a finite angular footprint. A point-light
 // GGX peak would clip broad white patches on these gently curved body panels.
 let lightRoughness=sqrt(roughness*roughness+.06);
 let reflected=(reflectedEnvironment(world,ray,roughness)*fresnel
  +ggxReflection(n,view,normalize(vec3(.3,-.6,1.)),lightRoughness)*vec3(.45,.42,.38))*u.optics.x;
 // Residue controls the covered fraction, not the hue of a dilute orange filter.
 let base=toLinear(art);let dyed=base*waterTransmission(.008,nv,u.effect.w);
 let substrate=mix(base,dyed,clamp(film.residue,0.,1.))*(1.-film.wet*.05);
 let transmission=waterTransmission(film.opticalDepth,nv,u.effect.w);
 let water=(substrate*transmission+waterMedium(film.opticalDepth*u.effect.w*340.))*(1.-fresnel)+reflected;
 return toDisplay(mix(substrate,water,film.wet));
}
