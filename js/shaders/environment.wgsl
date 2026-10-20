// Shared world lighting; group 1 is independent of existing camera/instance data.
struct Environment { light:vec4<f32>, settings:vec4<f32> }
@group(1) @binding(0) var<uniform> env:Environment;
fn envColor()->vec3<f32>{let t=env.settings.z;return select(vec3(1.-t*.12,1.-t*.05,1.),vec3(1.,1.+t*.16,1.+t*.30),t<0.);}
fn envLinear(c:vec3<f32>)->vec3<f32>{return select(c/12.92,pow((c+.055)/1.055,vec3(2.4)),c>vec3(.04045));}
fn envDisplay(c:vec3<f32>)->vec3<f32>{let v=max(c,vec3(0.));return select(v*12.92,1.055*pow(v,vec3(1./2.4))-.055,v>vec3(.0031308));}
fn envDiffuse(n:vec3<f32>)->vec3<f32>{return vec3(.88,.94,1.)*env.settings.x*.7+envColor()*env.light.w*.9*max(0.,dot(n,env.light.xyz));}
fn envHash(p:vec2<i32>)->f32{
 var n=bitcast<u32>(p.x)*1664525u+bitcast<u32>(p.y)*1013904223u;n=(n^(n>>16u))*2246822519u;n=(n^(n>>13u))*3266489917u;return f32((n^(n>>16u))>>8u)/16777216.;
}
fn envGrain(p:vec2<f32>)->vec3<f32>{
 let cell=vec2<i32>(floor(p));let f=fract(p);let v=f*f*(3.-2.*f);let dv=6.*f*(1.-f);
 let a=envHash(cell);let b=envHash(cell+vec2(1,0));let c=envHash(cell+vec2(0,1));let d=envHash(cell+vec2(1,1));
 return vec3(mix(mix(a,b,v.x),mix(c,d,v.x),v.y),mix(b-a,d-c,v.y)*dv.x,mix(c-a,d-b,v.x)*dv.y);
}

// Water IOR and GGX geometry follow the liquid material, without emissive colour.
fn envSpecular(n:vec3<f32>,roughness:f32)->vec3<f32>{
 let v=normalize(vec3(0.,.48,1.));let l=env.light.xyz;let h=normalize(v+l);
 let nv=max(dot(n,v),.001);let nl=max(dot(n,l),0.);let nh=max(dot(n,h),0.);
 let a2=pow(roughness,4.);let denominator=nh*nh*(a2-1.)+1.;
 let distribution=a2/max(3.14159265*denominator*denominator,.000001);
 let gv=2.*nv/(nv+sqrt(a2+(1.-a2)*nv*nv));
 let gl=2.*nl/(nl+sqrt(a2+(1.-a2)*nl*nl));
 let fresnel=.0204+.9796*pow(1.-max(dot(v,h),0.),5.);
 return envColor()*env.light.w*.5*distribution*gv*gl*fresnel/(4.*nv);
}

// Stable irregular mineral chips; one nearest-cell search, skipped below pixel scale.
fn envAggregate(p:vec2<f32>,footprint:f32)->vec3<f32>{
 let fade=1.-smoothstep(.7,1.6,footprint);
 if(fade<=0.){return vec3(.32,0.,0.);}
 let cell=vec2<i32>(floor(p));let f=fract(p);
 var closest=vec2(2.);var distance=10.;var mineral=.5;
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let offset=vec2<i32>(x,y);let h=envHash(cell+offset);
  let delta=f-vec2<f32>(offset)-(.15+.70*vec2(h,fract(h*17.13)));
  let d=dot(delta,delta);
  if(d<distance){distance=d;closest=delta;mineral=fract(h*31.7);}
 }}
 let edge=max(abs(closest.x)+abs(closest.y)*.42,abs(closest.y)+abs(closest.x)*.31);
 let aa=max(.04,footprint*.28);
 let chip=(1.-smoothstep(.32-aa,.32+aa,edge))*(.65+.35*mineral);
 return vec3(mix(.32,chip,fade),closest*chip*fade);
}
