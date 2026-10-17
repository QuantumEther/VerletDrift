// =============================================================
// SMOKE RENDER SHADER — Soft Billboard Particles
// =============================================================
// Renders smoke particles as circular billboards with procedural
// gradient falloff (center opaque, edges fade softly).

struct CameraUniforms {
  zoom: f32,
  ppm: f32,           // pixels per metre
  viewportW: f32,
  viewportH: f32,
  camX: f32,          // world-space camera position X (metres)
  camY: f32,          // world-space camera position Y (metres)
}

struct SmokeParticle {
  pos: vec2<f32>,
  vel: vec2<f32>,
  life: f32,
  maxLife: f32,
  size: f32,
  sizeBase: f32,
  r: f32,
  g: f32,
  b: f32,
  alpha: f32,
}

struct VertexOutput {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) col: vec4<f32>,
  @location(2) @interpolate(flat) seed: vec2<f32>,
}

struct SmokeSettings {dt:f32,count:u32,turbulence:f32,time:f32,camera:vec2<f32>,detail:f32,pad:f32}
@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<uniform> settings: SmokeSettings;
@group(1) @binding(0) var<storage, read> particles: array<SmokeParticle>;
@group(1) @binding(1) var<storage, read> aliveFlags: array<u32>;

// =============================================================
// VERTEX SHADER
// =============================================================

@vertex
fn vs_main(
  @builtin(vertex_index) vert_id: u32,
  @builtin(instance_index) inst_id: u32,
) -> VertexOutput {
  // Hardcoded unit quad: 6 verts (2 triangles)
  let quad_verts = array<vec2<f32>, 6>(
    vec2<f32>(-0.5, -0.5),  // 0: bottom-left
    vec2<f32>( 0.5, -0.5),  // 1: bottom-right
    vec2<f32>( 0.5,  0.5),  // 2: top-right
    vec2<f32>(-0.5, -0.5),  // 3: bottom-left (2nd tri)
    vec2<f32>( 0.5,  0.5),  // 4: top-right (2nd tri)
    vec2<f32>(-0.5,  0.5),  // 5: top-left
  );

  let local_pos = quad_verts[vert_id];
  // Rotation is affine: interpolate rotated UVs instead of repeating sin/cos
  // for every covered pixel of every overlapping puff.
  let angle = f32(inst_id)*2.399;
  let c = cos(angle); let s = sin(angle);
  let uv = vec2<f32>(local_pos.x*c-local_pos.y*s,
    local_pos.x*s+local_pos.y*c)*2.;

  if (aliveFlags[inst_id] == 0u) {
    return VertexOutput(
      vec4<f32>(2.0, 2.0, 0.0, 1.0),
      uv,
      vec4<f32>(0.0, 0.0, 0.0, 0.0),
      vec2<f32>(0.),
    );
  }

  // Read particle data
  let p = particles[inst_id];

  // Camera-relative billboard position + local quad position
  let world_x = p.pos.x + local_pos.x * p.size * 1.3;
  let world_y = p.pos.y + local_pos.y * p.size * 1.3;

  // Transform to NDC — subtract camera position first (particles stored in world-space)
  let eff = cam.zoom * cam.ppm;
  let camRelX = world_x - cam.camX;
  let camRelY = world_y - cam.camY;
  let ndc_x =  camRelX * eff / (cam.viewportW * 0.5);
  let ndc_y = -camRelY * eff / (cam.viewportH * 0.5);

  let lifeFrac = clamp(p.life/max(p.maxLife,.0001),0.,1.);
  let envelope=smoothstep(0.,.12,1.-lifeFrac)*smoothstep(0.,.25,lifeFrac);
  let alpha=p.alpha*envelope/(1.+(1.-lifeFrac)*.8);
  // Tire smoke is neutral: emitter RGB variations affect luminance, never tint.
  let shade=dot(vec3<f32>(p.r,p.g,p.b),vec3<f32>(.2126,.7152,.0722));
  let color=vec4<f32>(vec3<f32>(shade*alpha),alpha);

  return VertexOutput(
    vec4<f32>(ndc_x, ndc_y, 0.0, 1.0),
    uv,
    color,
    vec2<f32>(s*31.,c*27.),
  );
}

// =============================================================
// FRAGMENT SHADER
// =============================================================

// Smooth density field in particle coordinates. Integer hashing avoids the
// unstable high-frequency sin hashes that can shimmer across GPU vendors.
fn smokeHash(cell: vec2<i32>) -> f32 {
  let c=vec2<u32>(cell);
  var h=c.x*1597334677u+c.y*3812015801u;
  h=(h^(h>>16u))*2246822519u;
  h=(h^(h>>13u))*3266489917u;
  return f32(h^(h>>16u))/4294967295.;
}
fn smokeNoise(p: vec2<f32>) -> f32 {
  let cell=vec2<i32>(floor(p));
  let f=fract(p);
  let u=f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(smokeHash(cell),smokeHash(cell+vec2<i32>(1,0)),u.x),
    mix(smokeHash(cell+vec2<i32>(0,1)),smokeHash(cell+vec2<i32>(1,1)),u.x),u.y);
}
fn smokeFbm(p: vec2<f32>) -> f32 {
  var q=p;
  var value=0.;
  var weight=.57;
  // Filter the fine octaves at low pixel coverage rather than adding static.
  let footprint=max(length(dpdx(p)),length(dpdy(p)));
  var frequency=1.;
  let octaves=select(3u,5u,settings.detail>1.);
  for(var i=0u;i<octaves;i++) {
    let visibility=1.-smoothstep(.25,.8,footprint*frequency);
    var octave=.5;
    // Fully filtered detail contributes its exact mean, without noise hashing.
    if (visibility>0.) { octave=mix(.5,smokeNoise(q),visibility); }
    value+=weight*octave;
    q=vec2<f32>(q.x*.8-q.y*.6,q.x*.6+q.y*.8)*2.03+vec2<f32>(17.1,9.2);
    frequency*=2.03;
    weight*=.5;
  }
  return value;
}
fn smokeDensity(uv: vec2<f32>, seed: vec2<f32>, drift: vec2<f32>) -> f32 {
  // Domain warping creates rounded rolling structures, then finer noise
  // erodes their boundaries into wisps. The whole cloud remains soft at edges.
  let q=uv*2.6+seed;
  let warp=vec2<f32>(smokeNoise(q+drift),smokeNoise(q+vec2<f32>(5.2,1.3)-drift));
  let field=smokeFbm(q+(warp-.5)*1.7+drift*.5);
  let radius=length(uv+(warp-.5)*.19);
  let envelope=1.-smoothstep(.25,1.,radius);
  let billows=smoothstep(.20,.78,field);
  return envelope*billows;
}
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv=in.uv;
  let seed=in.seed;
  let drift=vec2<f32>(settings.time*.085,-settings.time*.12);
  let density=smokeDensity(uv,seed,drift);
  // Beer-Lambert extinction; soft forward scatter and directional density
  // gradient suggest volume without pretending to sample scene depth.
  let alpha=1.-exp(-density*in.col.a*1.65);
  let litDensity=smokeDensity(uv+vec2<f32>(-.11,-.16),seed,drift);
  let light=clamp(.72+(density-litDensity)*1.2+.18*(1.-density),.50,1.);
  let shade=in.col.rgb/max(in.col.a,.00001);
  return vec4<f32>(shade*light*alpha,alpha);
}
