// Applied to the real asphalt/rubber substrate before puddles and upper-world objects.
@group(0) @binding(9) var trailTexture:texture_2d<f32>;
fn tireLiquid(world:vec2<f32>,uv:vec2<f32>,asphalt:vec3<f32>)->vec3<f32> {
 if(u.counts.y<.5){return asphalt;}
 let field=textureSampleLevel(trailTexture,linearSampler,uv,0.);
 // Derivatives precede divergent empty/dry exits so boundary highlights stay stable.
 let depthWidth=fwidth(field.a);
 if(dot(field.rgb,vec3(1.))<.000001&&field.a<.000002){return asphalt;}
 let view=normalize(vec3(0.,.48,1.));
 let transmission=opticalTransmission(field.rgb,dot(view,vec3(0.,0.,1.)),u.effect.w);
 if(field.a<.000002){return toDisplay(toLinear(asphalt)*transmission);}
 let texel=1./u.view.xy;
 let dx=textureSampleLevel(trailTexture,linearSampler,uv+vec2(texel.x,0.),0.).a-textureSampleLevel(trailTexture,linearSampler,uv-vec2(texel.x,0.),0.).a;
 let dy=textureSampleLevel(trailTexture,linearSampler,uv+vec2(0.,texel.y),0.).a-textureSampleLevel(trailTexture,linearSampler,uv-vec2(0.,texel.y),0.).a;
 let gradient=vec2(dx,dy)*u.view.z*.5;
 let water=smoothstep(.000015,.00045,field.a);
 let grain=noiseSlope(world*19.);
 // Capillary pinning sharpens the curved film shoulders, while pores stay rough.
 let meniscus=gradient/(length(gradient)+.001)*.055*(1.-smoothstep(.0002,.0018,field.a));
 let n=normalize(vec3(-gradient-meniscus+grain.yz*.018*(1.-water),1.));
 let variance=min(.1,pow(depthWidth/max(field.a,.00002),2.)*.012);
 let roughness=clamp(mix(.62,.065,water)*u.material.w,.035,.82);
 let reflection=(reflectedEnvironment(world,reflect(-view,n),roughness)*fresnelWater(dot(n,view))
  +ggxReflection(n,view,liquidSun(),sqrt(max(.085,roughness)*max(.085,roughness)+variance))*liquidSunColor())
  *u.optics.x*liquidGroundVisibility(world);
 let wet=smoothstep(.000002,.00004,field.a);
 // Reconstruct the local concentration for the same ambient dye return as puddles.
 u.dye=vec4(field.rgb/max(field.a,.000002),1.);
 let medium=waterMedium(field.a/.035*u.effect.w*12.);
 let transmitted=toLinear(asphalt)*(1.-wet*.38)*transmission;
 return toDisplay(transmitted*(1.-fresnelWater(dot(n,view))*wet)+medium+reflection*wet);
}
