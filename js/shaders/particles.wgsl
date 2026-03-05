// =============================================================
// PARTICLE SHADER — Instanced quads for sparks and splat particles
// Replaces drawSparks() + drawSplatParticles() (5,000 ops → 2 draw calls).
//
// Per-instance: [camRelX, camRelY, size, r, g, b, alpha]
// Geometry: unit quad (2 triangles, 6 vertices), scaled by size.
// Fragment: circular clip (discard outside unit circle radius).
// =============================================================

struct CameraUniforms {
  zoom:      f32,
  ppm:       f32,
  viewportW: f32,
  viewportH: f32,
}

@group(0) @binding(0) var<uniform> cam: CameraUniforms;

struct ParticleInstance {
  @location(1) worldX: f32,
  @location(2) worldY: f32,
  @location(3) size:   f32,
  @location(4) r:      f32,
  @location(5) g:      f32,
  @location(6) b:      f32,
  @location(7) alpha:  f32,
}

struct VertOut {
  @builtin(position) pos:   vec4<f32>,
  @location(0)       color: vec4<f32>,
  @location(1)       uv:    vec2<f32>,  // local UV [−1, 1] for circle clip
}

// Unit quad: 2 triangles, 6 vertices, local coords [−0.5, 0.5].
var<private> QUAD_VERTS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
  vec2<f32>(-0.5, -0.5),
  vec2<f32>( 0.5, -0.5),
  vec2<f32>( 0.5,  0.5),
  vec2<f32>(-0.5, -0.5),
  vec2<f32>( 0.5,  0.5),
  vec2<f32>(-0.5,  0.5),
);

@vertex
fn vs_main(
  @builtin(vertex_index) vi: u32,
  inst: ParticleInstance,
) -> VertOut {
  let lv = QUAD_VERTS[vi];

  // Scale by particle size (world-space metres)
  let wx = inst.worldX + lv.x * inst.size;
  let wy = inst.worldY + lv.y * inst.size;

  let eff  = cam.zoom * cam.ppm;
  let ndcX =  wx * eff / (cam.viewportW * 0.5);
  let ndcY = -wy * eff / (cam.viewportH * 0.5);

  var out: VertOut;
  out.pos   = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.color = vec4<f32>(inst.r * inst.alpha, inst.g * inst.alpha, inst.b * inst.alpha, inst.alpha);
  out.uv    = lv * 2.0; // [−1, 1] range
  return out;
}

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
  // Circular clip: discard outside unit circle
  if (dot(in.uv, in.uv) > 1.0) { discard; }
  return in.color;
}
