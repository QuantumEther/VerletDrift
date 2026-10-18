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
 let outward=normalize(b.xy-u.event.xy+vec2(.0001));
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
struct Drop {position:vec3<f32>, radius:f32, velocity:vec2<f32>, landed:f32, alive:f32}
fn drop(id:u32)->Drop {
 let root=id%u32(u.counts.x);
 let angle=rootAngle(root)+(hash(id+120u)-.5)*.20;
 let birth=.10+pow(hash(id+23u),1.5)*.48;
 let time=u.event.z-birth;
 let start=sheetPoint(angle,.78+hash(id+4u)*.22,birth,0.);
 let dir=vec2(cos(angle),sin(angle));
 let velocity=dir*(2.5+hash(id+11u)*7.)*(.65+u.effect.x*.022)+u.options.xy*u.effect.x*.035;
 let vz=1.4+hash(id+61u)*3.;let gravity=8.5;
 let flight=(vz+sqrt(vz*vz+2.*gravity*start.z))/gravity;
 let airborne=min(max(0.,time),flight);
 let travel=(1.-exp(-airborne*1.4))/1.4;
 let xy=start.xy+velocity*travel;
 let z=max(0.,start.z+vz*airborne-.5*gravity*airborne*airborne);
 let landed=smoothstep(flight-.04,flight+.06,time);
 let size=(.009+pow(hash(id+700u),6.)*.090)*pow(u.effect.y/18.,.25);
 let radius=size*mix(1.,1.8+min(max(time-flight,0.),1.)*.6,landed);
 let alive=smoothstep(0.,.035,time)*(1.-smoothstep(2.5,4.2,time));
 return Drop(vec3(xy,z),radius,velocity,landed,alive);
}
fn corners(id:u32)->vec2<f32>{let p=array<vec2<f32>,6>(vec2(-1.,-1.),vec2(1.,-1.),vec2(1.,1.),vec2(-1.,-1.),vec2(1.,1.),vec2(-1.,1.));return p[id];}
@vertex fn vs_drop(@builtin(vertex_index) vertex:u32,@builtin(instance_index) id:u32)->Surface{
 let d=drop(id);let uv=corners(vertex);
 let dir=normalize(d.velocity+vec2(.0001));let side=vec2(-dir.y,dir.x);
 let stretch=mix(1.4+hash(id+84u)*1.5,1.,d.landed);let point=d.position+vec3((dir*uv.x*stretch+side*uv.y)*d.radius,0.);
 var position=clip(point);if(d.alive<=0.){position=vec4(2.,2.,0.,1.);}
 return Surface(position,d.position,uv,f32(id),vec2(d.alive,d.landed),vec3(dir,0.));
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
fn liquid(pixel:vec2<f32>,normal:vec3<f32>,thickness:f32,coverage:f32)->vec4<f32>{
 let n=normalize(normal);let light=normalize(vec3(-.45,-.6,1.));
 let dense=max(.001,thickness*u.effect.w);
 let refractOffset=n.xy*(3.+dense*8.)/u.view.xy;
 let behind=textureSampleLevel(sceneTexture,linearSampler,clamp(pixel/u.view.xy+refractOffset,vec2(0.),vec2(1.)),0.).rgb;
 let transmission=exp(-vec3(.16,3.8,5.5)*dense);
 let scattering=vec3(1.05,.008,.020)*(1.-exp(-dense*1.8))*(.55+.40*max(0.,dot(n,light)));
 let halfVector=normalize(light+vec3(0.,0.,1.));
 let spec=pow(max(0.,dot(n,halfVector)),95.)*.72;
 let fresnel=.025+.24*pow(1.-abs(n.z),5.);
 let color=behind*transmission+scattering+vec3(spec+fresnel*.30);
 let alpha=coverage*clamp(.22+1.-exp(-dense*1.5),0.,.94);
 return vec4(color*alpha,alpha);
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
 return vec3(holes*edges*lifeFade(),thickness*(1.+rim*.65+outerRim*.9),rim);
}
@fragment fn fs_sheet(in:Surface)->@location(0) vec4<f32>{
 let data=membrane(in);
 var normal=normalize(in.normal);
 if(normal.z<0.){normal=-normal;}
 let ripple=sin(in.material.x*24.+in.material.y*11.+u.event.z*2.)*.055;
 normal=normalize(normal+vec3(ripple,-ripple*.6,0.));
 return liquid(in.position.xy,normal,data.y,data.x*carVisibility(in.world));
}
@fragment fn fs_strand(in:Surface)->@location(0) vec4<f32>{
 let side=in.material.y;let aa=max(fwidth(side),.01);
 let edge=1.-smoothstep(1.-aa,1.,abs(side));
 let age=u.event.z;let breakup=smoothstep(.6,2.,age)*u.effect.z;
 let neck=.55+.45*sin(in.material.x*33.+in.id*3.7);
 let coverage=edge*(1.-smoothstep(neck,neck+.15,breakup))*lifeFade();
 let normal=normalize(vec3(in.normal.xy*side,sqrt(max(.01,1.-side*side))));
 return liquid(in.position.xy,normal,.65,coverage*carVisibility(in.world));
}
@fragment fn fs_drop(in:Surface)->@location(0) vec4<f32>{
 let uv=in.material;
 let shape=mix(.86-.16*uv.x,1.,in.shape.y);
 let r=length(vec2(uv.x,uv.y/shape));let aa=max(fwidth(r),.006);
 let coverage=(1.-smoothstep(1.-aa,1.+aa,r))*in.shape.x;
 let dir=in.normal.xy;let side=vec2(-dir.y,dir.x);
 let curved=vec3((dir*uv.x+side*uv.y)*.8,sqrt(max(.001,1.-r*r)));
 let normal=normalize(mix(curved,vec3(uv*.12,1.),in.shape.y));
 let thickness=mix(.38+max(0.,1.-r*r)*.7,.12+max(0.,1.-r*r)*.24,in.shape.y);
 return liquid(in.position.xy,normal,thickness,coverage*carVisibility(in.world));
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
