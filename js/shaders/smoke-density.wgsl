@fragment fn fs_density(in:VertexOutput)->@location(0) vec4<f32>{
 let drift=vec2(settings.time*.085,-settings.time*.12);
 let density=smokeDensity(in.uv,in.seed,drift);
 let tau=density*clamp(in.col.a,0.,1.)*1.65;
 let shade=clamp(in.col.r/max(in.col.a,.00001),0.,1.);
 // Add extinction before evaluating transmission. No per-puff illumination.
 return vec4(tau,tau*in.radius,tau*shade,0.);
}
