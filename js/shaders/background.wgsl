// =============================================================
// BACKGROUND SHADER — World-space ground materials + motion blur
// Replaces the Canvas 2D drawCheckerboard() loop (12,000 fillRects → 1 draw call).
// =============================================================

struct BgUniforms {
  camX:        f32,  // camera world-space X (metres)
  camY:        f32,  // camera world-space Y
  zoom:        f32,  // camera zoom multiplier
  ppm:         f32,  // pixels per metre
  viewportW:   f32,  // logical CSS pixel width (raster density is independent)
  viewportH:   f32,  // logical CSS pixel height
  tileSize:    f32,  // checkerboard tile size in world-space metres
  blurAmount:  f32,  // effective blur accumulator * intensity [0, 1]
  blurVelX:    f32,  // normalised velocity direction X
  blurVelY:    f32,  // normalised velocity direction Y
  blurOffset:  f32,  // max world-space blur offset in metres
  sampleCount: f32,  // number of blur samples (cast to i32 in shader)
  surface:     f32,  // 0 checker, 1 asphalt, 2 studio, 3 diagnostic
  detail:      f32,  // visual quality only
  angularVel:      f32,  // angular velocity (rad/s) for rotational blur
  blurOpacityMin:  f32,  // minimum opacity for historical samples
  blurOpacityMax:  f32,  // maximum opacity for historical samples
  blurOpacityCurve: f32, // power curve exponent for opacity falloff
  _pad:            f32,  // padding to 16-byte boundary
}

@group(0) @binding(0) var<uniform> u: BgUniforms;

// Full-screen quad vertices in clip space.
// We bypass vertex attributes and hard-code the 4-vertex quad.
var<private> QUAD_VERTS: array<vec2<f32>, 4> = array<vec2<f32>, 4>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>(-1.0,  1.0),
  vec2<f32>( 1.0,  1.0),
);

struct VertOut {
  @builtin(position) pos:  vec4<f32>,
  @location(0)       uv:   vec2<f32>,  // NDC uv [0,1]
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertOut {
  let p = QUAD_VERTS[vi];
  var out: VertOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv  = p * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out;
}

fn hash(p:vec2<f32>)->f32 {
 let q=vec2<i32>(floor(p));
 var n=bitcast<u32>(q.x)*1664525u+bitcast<u32>(q.y)*1013904223u;
 n=(n^(n>>16u))*2246822519u;n=(n^(n>>13u))*3266489917u;
 return f32((n^(n>>16u))>>8u)/16777216.;
}
fn noise(p:vec2<f32>)->f32 {
 let i=floor(p);let f=fract(p);let q=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),q.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),q.x),q.y);
}
fn triangle(x:vec2<f32>)->vec2<f32>{return vec2(1.)-abs(fract(x*.5)*2.-1.);}
fn filteredChecker(p:vec2<f32>)->f32{
 let w=max(fwidth(p),vec2(.0001));
 let mean=(triangle(p+w*.5)-triangle(p-w*.5))/w;
 return .5+.5*mean.x*mean.y;
}
fn grid(p:vec2<f32>,thickness:f32)->f32{
 let line=abs(fract(p-.5)-.5)/max(fwidth(p),vec2(.0001));
 return 1.-smoothstep(thickness,thickness+1.,min(line.x,line.y));
}
fn material(world:vec2<f32>)->vec3<f32>{
 let check=filteredChecker(world/u.tileSize);
 if(u.surface<.5){return mix(vec3(.0667,.0784,.0863),vec3(.1333,.1255,.1490),check);}
 if(u.surface<1.5 && env.settings.w>.5){
  let footprint=length(fwidth(world));
  // Aggregate must remain resolvable at gameplay zoom; finer octaves fade out.
  let wear=envGrain(world*.65);
  let coarse=envAggregate(world*8.,footprint*8.);
  let stone=envAggregate(world*23.,footprint*23.);
  let grainFade=1.-smoothstep(.35,1.5,footprint*67.);
  var fine=0.;
  if(u.detail>0.&&grainFade>0.){fine=(envGrain(world*67.).x-.5)*grainFade;}
  // Pale angular mineral chips embedded in a darker, slightly warm binder.
  let base=vec3(.195,.193,.187)+vec3((wear.x-.5)*.018+(coarse.x-.32)*.018+stone.x*.043+fine*.035)
    +vec3(.006,.002,-.004)*stone.x;
  let normal=normalize(vec3(-coarse.yz*.09-stone.yz*.24,1.));
  let dry=envLinear(base)*envDiffuse(normal);
  // Rough asphalt receives a weak, broad dielectric reflection; water is separate.
  return envDisplay(dry+envSpecular(normal,.72)*.16);

 }
 if(u.surface<1.5){
  let coarse=noise(world*1.7)-.5;
  let microScale=55.;let atten=1.-smoothstep(.2,1.,length(fwidth(world))*microScale);
  var micro=0.;
  if(u.detail>0. && atten>0.){micro=(noise(world*microScale)-.5)*atten;}
  var detail=coarse*.018+micro*.030;
  if(u.detail>1.){let fineScale=110.;let fineFade=1.-smoothstep(.2,1.,length(fwidth(world))*fineScale);if(fineFade>0.){detail+=(noise(world*fineScale)-.5)*fineFade*.012;}}
  return vec3(.105,.119,.131)+vec3(detail)+vec3(.004)*check;
 }
 if(u.surface<2.5){return vec3(.19,.205,.215)+vec3(.009)*check-vec3(.012)*grid(world/u.tileSize,.1);}
 let fine=grid(world,.3);let major=grid(world/u.tileSize,.5);
 return vec3(.055,.075,.09)+vec3(.025,.052,.065)*fine+vec3(.025,.045,.05)*major;
}

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
  // Fragment pixel position in canvas pixels.
  let pixX = in.uv.x * u.viewportW;
  let pixY = in.uv.y * u.viewportH;

  // Effective world-space scale (pixels per metre including zoom).
  let eff = u.zoom * u.ppm;

  // World-space coordinates of this fragment (camera + shake offset).
  let camRelX = (pixX - u.viewportW * 0.5) / eff;
  let camRelY = (pixY - u.viewportH * 0.5) / eff;
  let worldX = u.camX + camRelX;
  let worldY = u.camY + camRelY;

  // --- MOTION BLUR ---
  let numSamples = max(i32(u.sampleCount), 1);
  var colorAcc = vec3<f32>(0.0);
  var alphaAcc = f32(0.0);

  for (var s: i32 = numSamples - 1; s >= 0; s--) {
    let frac = select(
      f32(s) / max(f32(numSamples - 1), 1.0),
      0.0,
      numSamples == 1
    );

    // Sample weight: current frame (s==0) is fully opaque; older samples use configurable opacity.
    // Opacity curve: pow((1-frac), curve) gives steeper falloff for curve > 1.0
    let opacityFalloff = pow(1.0 - frac, u.blurOpacityCurve);
    let historicalOpacity = mix(u.blurOpacityMin, u.blurOpacityMax, opacityFalloff);
    let sampleAlpha = select(
      u.blurAmount * historicalOpacity,
      1.0,
      s == 0
    );
    if (sampleAlpha < 0.005) { continue; }

    // World-space offset for this sample.
    let longX = -u.blurVelX * u.blurOffset * frac;
    let longY = -u.blurVelY * u.blurOffset * frac;

    // Rotational blur component.
    let rotAngle = u.angularVel * 0.04 * u.blurAmount * frac;
    let rc = cos(rotAngle);
    let rs = sin(rotAngle);
    let offX = longX * rc - longY * rs;
    let offY = longX * rs + longY * rc;

    let sWorldX = worldX + offX;
    let sWorldY = worldY + offY;

    var tileC = material(vec2(sWorldX,sWorldY));
    if(env.settings.w>.5 && (u.surface<.5||u.surface>1.5)){tileC=envDisplay(envLinear(tileC)*envDiffuse(vec3(0.,0.,1.)));}

    colorAcc += tileC * sampleAlpha;
    alphaAcc += sampleAlpha;
  }

  // Normalise accumulated samples.
  var finalColor: vec3<f32>;
  if (alphaAcc < 0.001) {
    finalColor = vec3<f32>(0.0667, 0.0784, 0.0863); // fallback dark tile
  } else {
    finalColor = colorAcc / alphaAcc;
  }

  return vec4<f32>(finalColor, 1.0); // fully opaque background
}
