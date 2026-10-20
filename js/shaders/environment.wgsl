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
