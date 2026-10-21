// Shared lighting convention: x right, y down, z toward the camera.
struct SmokeLighting {light:vec4<f32>,environment:vec4<f32>,material:vec4<f32>,view:vec4<f32>}
fn smokeLightColor(e:vec4<f32>)->vec3<f32>{let t=e.z;return select(vec3(1.-t*.12,1.-t*.05,1.),vec3(1.,1.+t*.16,1.+t*.30),t<0.);}
fn smokeDisplay(c:vec3<f32>)->vec3<f32>{let v=max(c,vec3(0.));return select(v*12.92,1.055*pow(v,vec3(1./2.4))-.055,v>vec3(.0031308));}
fn smokeIllumination(normal:vec3<f32>,tau:f32,shadowTau:f32,light:SmokeLighting)->vec3<f32>{
 let enabled=light.environment.w;
 let l=normalize(light.light.xyz);let v=normalize(vec3(0.,.48,1.));
 // Modest anisotropy, bounded single-scattering phase; no emissive rim term.
 let g=.35;let mu=dot(-l,v);let phase=(1.-g*g)/pow(max(.12,1.+g*g-2.*g*mu),1.5);
 let visibility=exp(-min(12.,shadowTau*light.material.z));
 let inner=(1.-exp(-max(.001,tau*.55)))/max(.001,tau*.55);
 let sky=vec3(.88,.94,1.)*light.environment.x*(.48+.22*inner);
 let directional=smokeLightColor(light.environment)*light.light.w*visibility*(.28+.72*max(0.,dot(normal,l)))*phase*light.material.y;
 let illumination=sky+directional;
 // Unlit comparison remains neutral. A weak ambient floor prevents soot-black smoke.
 return mix(vec3(.62),clamp(illumination,vec3(.09),vec3(1.65)),enabled);
}
