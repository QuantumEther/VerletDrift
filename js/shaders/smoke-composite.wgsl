@group(0) @binding(0) var densityField:texture_2d<f32>;
@group(0) @binding(1) var densitySampler:sampler;
@group(0) @binding(2) var<uniform> smokeLight:SmokeLighting;
@group(0) @binding(3) var<storage,read> bounds:array<u32>;
@vertex fn vs_composite(@builtin(vertex_index) id:u32)->@builtin(position) vec4<f32>{
 if(bounds[2]<=bounds[0]||bounds[3]<=bounds[1]){return vec4(2.,2.,0.,1.);}
 let corners=array<vec2<f32>,6>(vec2(0.,0.),vec2(1.,0.),vec2(1.,1.),vec2(0.,0.),vec2(1.,1.),vec2(0.,1.));
 let point=mix(vec2<f32>(vec2(bounds[0],bounds[1])),vec2<f32>(vec2(bounds[2],bounds[3])),corners[id]);
 return vec4(point/smokeLight.view.xy*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
}
fn field(uv:vec2<f32>)->vec4<f32>{return textureSampleLevel(densityField,densitySampler,uv,0.);}
fn columnHeight(value:vec4<f32>)->f32{return value.g/max(.0001,value.r)*.32*log(1.+value.r);}
@fragment fn fs_composite(@builtin(position) position:vec4<f32>)->@location(0) vec4<f32>{
 let uv=position.xy/smokeLight.view.xy;let center=field(uv);let tau=center.r*smokeLight.material.x;
 if(tau<.0001){return vec4(0.);}
 let texel=1./vec2<f32>(textureDimensions(densityField));
 let xp=field(uv+vec2(texel.x,0.));let xm=field(uv-vec2(texel.x,0.));
 let yp=field(uv+vec2(0.,texel.y));let ym=field(uv-vec2(0.,texel.y));
 let metresPerTexel=smokeLight.view.xy/vec2<f32>(textureDimensions(densityField))/smokeLight.view.z;
 let slope=vec2(columnHeight(xp)-columnHeight(xm),columnHeight(yp)-columnHeight(ym))/(2.*metresPerTexel);
 let normal=normalize(vec3(-slope,1.));
 let radius=clamp(center.g/max(.0001,center.r),.15,3.);
 let direction=smokeLight.light.xy/max(.22,smokeLight.light.z);
 let offset=direction*radius*.40*smokeLight.view.z/smokeLight.view.xy;
 // Three finite projected-column samples approximate incoming-light extinction.
 let incomingTau=(field(uv+offset*.35).r*.48+field(uv+offset*.8).r*.32+field(uv+offset*1.5).r*.20)*smokeLight.material.x;
 // The visible front layer is illuminated; excess upstream columns occlude it.
 let shadowTau=max(0.,incomingTau-tau*.65)*.35+min(tau,3.)*.16;
 let radiance=smokeIllumination(normal,tau,shadowTau,smokeLight);
 let shade=center.b/max(.0001,center.r);
 let alpha=1.-exp(-min(tau,16.));
 return vec4(smokeDisplay(radiance*shade*.78)*alpha,alpha);
}
