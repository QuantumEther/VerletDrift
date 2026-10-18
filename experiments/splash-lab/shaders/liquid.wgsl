@group(0) @binding(1) var sceneTexture:texture_2d<f32>;
@group(0) @binding(2) var linearSampler:sampler;
struct Surface {
 @builtin(position) position:vec4<f32>, @location(0) world:vec3<f32>,
 @location(1) material:vec2<f32>, @location(2) @interpolate(flat) id:f32,
 @location(3) shape:vec2<f32>, @location(4) normal:vec3<f32>,
}
@vertex fn vs_sheet(@location(0) param:vec2<f32>,@builtin(instance_index) layer:u32)->Surface{
 let angle=param.x*TAU;let p=sheetPoint(angle,param.y,u.event.z,f32(layer));
 let around=sheetPoint(angle+.003,param.y,u.event.z,f32(layer))-p;
 let along=sheetPoint(angle,min(.9999,param.y+.003),u.event.z,f32(layer))-p;
 var normal=normalize(cross(around,along)+vec3(0.,0.,.000001));
 if(normal.z<0.){normal=-normal;}
 return Surface(clip(p),p,vec2(cos(angle),sin(angle))*param.y,f32(layer),param,normal);
}
fn rootCurve(root:u32,s:f32)->vec3<f32>{
 let angle=rootAngle(root);
 let a=sheetPoint(angle,.58,u.event.z,0.);
 let b=sheetPoint(angle+(hash(root+6u)-.5)*.18,1.,u.event.z,0.);
 let outward=normalize(radialVelocity(angle)+vec2(.0001));
 let side=vec2(-outward.y,outward.x);let t=max(u.event.z,0.);
 let end=b.xy+outward*(.5+hash(root+3u)*1.4)*(1.-exp(-t*2.));
 let curve=sin(s*PI)*((hash(root+8u)-.5)*.9+.12*sin(s*TAU+t));
 return vec3(mix(a.xy,end,s)+side*curve,
  max(0.,mix(a.z,b.z,s)+sin(s*PI)*(.3+hash(root+7u)*.7)*exp(-t*.7)));
}
fn strandPoint(root:u32,branch:u32,s:f32)->vec3<f32>{
 if(branch==1u){return rootCurve(root,s);}
 let fork=.54+hash(root+12u)*.13;
 let base=rootCurve(root,mix(fork,1.,s));
 let angle=rootAngle(root);let side=vec2(-sin(angle),cos(angle));
 let branchSign=f32(branch)-1.;
 let offset=side*branchSign*s*s*(.24+hash(root+11u)*.6)*(1.-exp(-max(u.event.z,0.)*3.));
 return base+vec3(offset,sin(s*PI)*.18);
}
@vertex fn vs_strand(@location(0) param:vec2<f32>,@builtin(instance_index) id:u32)->Surface{
 let root=id/3u;let branch=id%3u;let s=param.x;
 let p=strandPoint(root,branch,s);let next=strandPoint(root,branch,min(1.,s+.015));
 let direction=normalize(next.xy-p.xy+vec2(.00001));
 let thickness=(.018+.038*hash(root+14u))*select(.65,1.,branch==1u)*pow(max(.05,1.-s),.65)*(1.+.25*sin(s*30.-u.event.z*8.));
 let shifted=p+vec3(vec2(-direction.y,direction.x)*param.y*thickness,0.);
 return Surface(clip(shifted),p,vec2(s,param.y),f32(id),vec2(s,param.y),vec3(-direction.y,direction.x,0.));
}
fn dropSurface(vertex:u32,id:u32,d:Drop)->Surface{let uv=corners(vertex);
 let dir=normalize(d.velocity+vec2(.0001));let side=vec2(-dir.y,dir.x);
 let stretch=mix(1.4+hash(id+84u)*1.5,1.,d.landed);let point=d.position+vec3((dir*uv.x*stretch+side*uv.y)*d.radius,0.);
 var position=clip(point);if(d.alive<=0.){position=vec4(2.,2.,0.,1.);}
 return Surface(position,d.position,uv,f32(id),vec2(d.alive,d.landed),vec3(dir,0.));
}
@vertex fn vs_drop(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Surface {
 return dropSurface(vertex,id,drop(id));
}
@vertex fn vs_splashlet(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Surface {
 return dropSurface(vertex,id,splashlet(id));
}
@vertex fn vs_drop_shadow(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Surface{
 let d=drop(id);let uv=corners(vertex);let point=vec3(d.position.xy+vec2(.22,.35)*d.position.z+uv*d.radius*1.5,0.);
 var position=clip(point);if(d.alive<=0.){position=vec4(2.,2.,0.,1.);}
 return Surface(position,d.position,uv,f32(id),vec2(d.alive,d.landed),vec3(0.,0.,1.));
}
fn carVisibility(world:vec3<f32>)->f32 {
 // A soft laboratory roof-height mask, not a collision or fluid boundary.
 let projected=vec2(world.x,world.y-world.z*.48);
 let local=abs((projected-u.car.xy)/u.car.zw);
 let silhouette=(1.-smoothstep(.35,.46,local.x))*(1.-smoothstep(.40,.50,local.y));
 return 1.-silhouette*(1.-smoothstep(.40,.68,world.z));
}
// Thickness is an optical proxy only; motion and mesh dimensions are unchanged.
fn airborneTransmission(thickness:f32,viewCosine:f32,concentration:f32)->vec3<f32>{
 return waterTransmission(max(thickness,0.)*.012,viewCosine,concentration);
}
fn airborneLayer(behind:vec3<f32>,thickness:f32,viewCosine:f32,reflection:vec3<f32>,coverage:f32,concentration:f32)->vec4<f32>{
 let transmission=airborneTransmission(thickness,viewCosine,concentration);
 let fresnel=fresnelWater(viewCosine);
 let depth=max(thickness,0.)*.012;
 let medium=waterMedium(depth*concentration*(12./.035));
 let color=toDisplay((toLinear(behind)*transmission+medium)*(1.-fresnel)+reflection);
 // Retain a neutral transmitted fraction in the framebuffer. Existing layers
 // then absorb one another rather than each restoring the dry scene beneath.
 // RGB transmission/refraction remains an approximation in one RGBA pass.
 let retained=pow(min(transmission.x,min(transmission.y,transmission.z))*(1.-fresnel),1./2.4);
 let alpha=clamp(coverage,0.,1.)*(1.-retained);
 return vec4(max(color-behind*retained,vec3(0.))*clamp(coverage,0.,1.),alpha);
}
fn liquid(pixel:vec2<f32>,world:vec3<f32>,normal:vec3<f32>,thickness:f32,coverage:f32)->vec4<f32>{
 let view=normalize(vec3(0.,.48,1.));
 var n=normalize(normal);if(dot(n,view)<0.){n=-n;}
 let nv=max(dot(n,view),.001);
 let fresnel=fresnelWater(nv);
 // Same fixed luminaire and water IOR as puddles; finite normal footprint
 // broadens subpixel highlights instead of making luminous red rims.
 let dx=dpdx(n);let dy=dpdy(n);
 let roughness=sqrt(.085*.085+min(.18,(dot(dx,dx)+dot(dy,dy))*.35));
 let reflected=reflect(-view,n);
 let reflection=reflectedEnvironment(world.xy+reflected.xy*(-world.z/max(reflected.z,.08)),reflected,roughness)*fresnel
  +ggxReflection(n,view,normalize(vec3(.3,-.6,1.)),roughness)*vec3(.45,.42,.38);
 let depth=max(thickness,0.)*.012;
 let offset=n.xy*(depth*u.view.z*.30)/u.view.xy;
 let behind=textureSampleLevel(sceneTexture,linearSampler,clamp(pixel/u.view.xy+offset,vec2(0.),vec2(1.)),0.).rgb;
 return airborneLayer(behind,thickness,nv,reflection,coverage,u.effect.w);
}
fn membrane(in:Surface)->vec3<f32>{
 let age=u.event.z;
 let field=fbm(in.material*9.5+vec2(0.,2.3));
 let rupture=.18+smoothstep(.07,1.5,age)*(.20+u.effect.z*.22)+in.id*.025;
 let aa=max(fwidth(field),.007);
 let holes=smoothstep(rupture-aa,rupture+aa,field);
 let radial=in.shape.y;
 let edges=smoothstep(0.,.045,radial)*(1.-smoothstep(.985,1.,radial));
 let rim=1.-smoothstep(aa,aa*3.,abs(field-rupture));
 let thickness=(.15+.32*(1.-radial))*(.7+field*.7)/(1.+max(age,0.)*.9);
 let outerRim=exp(-pow((radial-.967)/.012,2.));
 let angle=atan2(in.material.y,in.material.x);
 let contact=sheetLanding(angle,radial,in.id);
 let airborne=1.-smoothstep(0.,.18,age-contact);
 return vec3(holes*edges*lifeFade()*airborne,thickness*(1.+rim*.65+outerRim*.9),rim);
}
@fragment fn fs_sheet(in:Surface)->@location(0) vec4<f32>{
 let data=membrane(in);
 var normal=normalize(in.normal);
 if(normal.z<0.){normal=-normal;}
 let ripple=sin(in.material.x*24.+in.material.y*11.+u.event.z*2.)*.055;
 normal=normalize(normal+vec3(ripple,-ripple*.6,0.));
 return liquid(in.position.xy,in.world,normal,data.y,data.x*carVisibility(in.world));
}
@fragment fn fs_strand(in:Surface)->@location(0) vec4<f32>{
 let side=in.material.y;let aa=max(fwidth(side),.01);
 let edge=1.-smoothstep(1.-aa,1.,abs(side));
 let age=u.event.z;let breakup=smoothstep(.6,2.,age)*u.effect.z;
 let neck=.55+.45*sin(in.material.x*33.+in.id*3.7);
 let contact=sheetLanding(rootAngle(u32(in.id)/3u),.85,0.);
 let coverage=edge*(1.-smoothstep(neck,neck+.15,breakup))*lifeFade()*(1.-smoothstep(0.,.22,age-contact));
 let normal=normalize(vec3(in.normal.xy*side,sqrt(max(.01,1.-side*side))));
 return liquid(in.position.xy,in.world,normal,.65*sqrt(max(0.,1.-side*side)),coverage*carVisibility(in.world));
}
@fragment fn fs_drop(in:Surface)->@location(0) vec4<f32>{
 let uv=in.material;
 let shape=mix(.86-.16*uv.x,1.,in.shape.y);
 let r=length(vec2(uv.x,uv.y/shape));let aa=max(fwidth(r),.006);
 let coverage=(1.-smoothstep(1.-aa,1.+aa,r))*in.shape.x;
 let dir=in.normal.xy;let side=vec2(-dir.y,dir.x);
 let curved=vec3((dir*uv.x+side*uv.y)*.8,sqrt(max(.001,1.-r*r)));
 let normal=normalize(mix(curved,vec3(uv*.12,1.),in.shape.y));
 // Curved chord thins continuously at the silhouette; no opaque capsule rim.
 let thickness=mix(1.08,.36,in.shape.y)*sqrt(max(0.,1.-r*r));
 return liquid(in.position.xy,in.world,normal,thickness,coverage*carVisibility(in.world));
}
@fragment fn fs_shadow(in:Surface)->@location(0) vec4<f32>{
 let alpha=exp(-dot(in.material,in.material)*3.)*.16*in.shape.x/(1.+in.world.z);
 return vec4(vec3(0.),alpha);
}
@vertex fn vs_blit(@builtin(vertex_index) id:u32)->Surface{
 let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.));
 return Surface(vec4(p[id],0.,1.),vec3(0.),p[id]*vec2(.5,-.5)+vec2(.5),0.,vec2(0.),vec3(0.,0.,1.));
}
@fragment fn fs_blit(in:Surface)->@location(0) vec4<f32>{
 return vec4(textureSampleLevel(sceneTexture,linearSampler,in.material,0.).rgb,1.);
}

// The atlas is rebuilt from contact events at the requested time, never from
// previous rendered frames. Additive optical depth makes overlap accumulate.
struct Deposit {
 @builtin(position) position:vec4<f32>, @location(0) local:vec2<f32>,
 @location(1) @interpolate(flat) data:vec4<f32>,
 @location(2) @interpolate(flat) id:f32,
}
@vertex fn vs_deposit_sheet(@location(0) param:vec2<f32>,@builtin(instance_index) layer:u32)->Surface {
 let angle=param.x*TAU;let contact=sheetLanding(angle,param.y,f32(layer));
 let p=sheetPoint(angle,param.y,contact,f32(layer));
 return Surface(atlasClip(p.xy),vec3(p.xy,contact),vec2(cos(angle),sin(angle))*param.y,f32(layer),param,vec3(0.,0.,1.));
}
@fragment fn fs_deposit_sheet(in:Surface)->@location(0) vec4<f32> {
 let since=min(u.event.z,3.)-in.world.z;let settled=smoothstep(0.,.20,since);
 let field=fbm(in.material*9.5+vec2(0.,2.3));
 let edge=(1.-smoothstep(.975,1.,in.shape.y))*smoothstep(0.,.035,in.shape.y);
 // Fine folds feed irregular patches; a thin wet film connects the pools.
 let pool=smoothstep(.23+u.effect.z*.025,.46+u.effect.z*.035,field);let volume=pow(u.effect.y/18.,.33333);
 let thickness=(.020+pool*.12)*(1.-in.shape.y*.45)*volume/u.counts.z;
 let wet=edge*settled;
 return vec4(thickness*wet,wet*.22,0.,0.);
}
fn deposition(vertex:u32,id:u32,d:Drop,enabled:f32)->Deposit {
 let since=min(u.event.z,3.)-d.arrival;
 let spread=1.-exp(-max(since,0.)*15.);
 let footprint=max(.024+d.size*2.4,u.ground.x*2./u.ground.y*1.2);
 let size=footprint*mix(.34,1.,spread);
 let dir=normalize(d.velocity+vec2(.0001));let side=vec2(-dir.y,dir.x);
 let uv=corners(vertex);
 let world=d.ground+(dir*uv.x*(1.+min(length(d.velocity)*.035,.35))+side*uv.y)*size;
 var position=atlasClip(world);if(since<=0.||enabled<.5){position=vec4(2.,2.,0.,1.);}
 return Deposit(position,uv,vec4(since,d.size,spread,enabled),f32(id));
}
@vertex fn vs_deposit_drop(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Deposit {
 return deposition(vertex,id,drop(id),1.);
}
@vertex fn vs_deposit_secondary(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Deposit {
 let d=splashlet(id);return deposition(vertex,id+9000u,d,step(.033,drop(id/2u).size));
}
@fragment fn fs_deposit_drop(in:Deposit)->@location(0) vec4<f32> {
 let uv=in.local;let n=noise(uv*4.+vec2(in.id*.173,in.id*.321));
 let r=length(uv)+(.5-n)*.22;let aa=max(fwidth(r),.008);
 let body=1.-smoothstep(.70-aa,.91+aa,r);
 let wet=1.-smoothstep(.86,1.08,r);
 let gate=smoothstep(0.,.07,in.data.x)*in.data.w;
 let thickness=(.004+in.data.y*.55)*body*(.55+.45*(1.-clamp(r,0.,1.)));
 return vec4(thickness*gate,wet*gate*.12,0.,0.);
}
