@group(2) @binding(0) var<uniform> smokeLight:SmokeLighting;
@fragment fn fs_local(in:VertexOutput)->@location(0) vec4<f32>{
 let density=smokeDensity(in.uv,in.seed,vec2(settings.time*.085,-settings.time*.12));
 let tau=density*in.col.a*1.65*smokeLight.material.x;
 let height=density*in.radius*.45;
 let gradient=vec2(dpdx(height),dpdy(height))*smokeLight.view.z;
 let normal=normalize(vec3(-gradient,1.));
 let radiance=smokeIllumination(normal,tau,tau*.28,smokeLight);
 let alpha=1.-exp(-min(tau,16.));
 let shade=in.col.r/max(in.col.a,.00001);
 return vec4(smokeDisplay(radiance*shade*.78)*alpha,alpha);
}
