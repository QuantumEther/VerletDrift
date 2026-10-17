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
  @location(2) @interpolate(flat) seed: f32,
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
  let uv = local_pos * 2.0;  // [-1, 1] for circle clip

  if (aliveFlags[inst_id] == 0u) {
    return VertexOutput(
      vec4<f32>(2.0, 2.0, 0.0, 1.0),
      uv,
      vec4<f32>(0.0, 0.0, 0.0, 0.0),
      0.,
    );
  }

  // Read particle data
  let p = particles[inst_id];

  // Camera-relative billboard position + local quad position
  let world_x = p.pos.x + local_pos.x * p.size;
  let world_y = p.pos.y + local_pos.y * p.size;

  // Transform to NDC — subtract camera position first (particles stored in world-space)
  let eff = cam.zoom * cam.ppm;
  let camRelX = world_x - cam.camX;
  let camRelY = world_y - cam.camY;
  let ndc_x =  camRelX * eff / (cam.viewportW * 0.5);
  let ndc_y = -camRelY * eff / (cam.viewportH * 0.5);

  let lifeFrac = clamp(p.life/max(p.maxLife,.0001),0.,1.);
  let envelope=smoothstep(0.,.12,1.-lifeFrac)*smoothstep(0.,.25,lifeFrac);
  let alpha=p.alpha*envelope;
  let color=vec4<f32>(p.r*alpha,p.g*alpha,p.b*alpha,alpha);

  return VertexOutput(
    vec4<f32>(ndc_x, ndc_y, 0.0, 1.0),
    uv,
    color,
    f32(inst_id)*2.399,
  );
}

// =============================================================
// FRAGMENT SHADER
// =============================================================

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let r=length(in.uv);
  let aa=max(fwidth(r),.002);
  let coverage=1.-smoothstep(.95-aa,1.+aa,r);
  // Overlapping lobes soften the billboard without a texture upload. Density
  // is coherent within each puff; compute supplies the larger turbulent flow.
  var lobe=1.;
  if(settings.detail>0.){lobe=.83+.10*sin(in.uv.x*6.+sin(in.uv.y*4.)+in.seed)+.07*cos(in.uv.y*7.+in.seed);}
  if(settings.detail>1.){lobe*=.92+.08*sin(in.uv.x*13.+in.seed+settings.time*.2)*cos(in.uv.y*11.-in.seed);}
  let density=exp(-r*r*3.2)*coverage*lobe;
  return in.col*density;
}
