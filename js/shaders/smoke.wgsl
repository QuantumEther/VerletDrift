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
}

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
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

  // Smoke color: CPU passes premultiplied RGBA
  let color = vec4<f32>(
    p.r * p.alpha,
    p.g * p.alpha,
    p.b * p.alpha,
    p.alpha
  );

  // Debug: Log particle position and size (first 5 particles only)
  // if (inst_id < 5u) {
  //   debugValue.x = p.pos.x; debugValue.y = p.pos.y; debugValue.z = p.size;
  // }

  return VertexOutput(
    vec4<f32>(ndc_x, ndc_y, 0.0, 1.0),
    uv,
    color,
  );
}

// =============================================================
// FRAGMENT SHADER
// =============================================================

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Circle clipping: discard if outside unit circle
  let dist_sq = dot(in.uv, in.uv);
  if (dist_sq > 1.0) {
    discard;
  }

  // Soft Gaussian-style falloff — wide soft puff, not a harsh dot
  let dist = sqrt(dist_sq);
  let falloff = 1.0 - dist;  // 1.0 at center, 0.0 at edge
  // Smooth cubic: wide soft shape, still zero at edge
  let soft_alpha = falloff * falloff * (3.0 - 2.0 * falloff);

  // Premultiplied alpha: scale both RGB and A by soft_alpha so blend is correct
  let final_color = vec4<f32>(
    in.col.r * soft_alpha,
    in.col.g * soft_alpha,
    in.col.b * soft_alpha,
    in.col.a * soft_alpha
  );

  return final_color;
}
