// =============================================================
// SKID ACCUMULATE SHADER — Renders new skid segments to a persistent texture
// Each frame only the NEW segments added since last frame are rendered.
// Old marks stay permanently in the texture — zero per-old-segment cost.
//
// Per-instance: [x1_rel, y1_rel, x2_rel, y2_rel, width, r, g, b, alpha] — 9 floats
// Geometry: each segment is expanded to a rectangle aligned to the segment.
// =============================================================

struct AccumUniforms {
  zoom:      f32,
  ppm:       f32,
  texWidth:  f32,
  texHeight: f32,
}

@group(0) @binding(0) var<uniform> u: AccumUniforms;

struct SkidInstance {
  @location(1) x1:    f32,
  @location(2) y1:    f32,
  @location(3) x2:    f32,
  @location(4) y2:    f32,
  @location(5) width: f32,
  @location(6) r:     f32,
  @location(7) g:     f32,
  @location(8) b:     f32,
  @location(9) alpha: f32,
}

struct VertOut {
  @builtin(position) pos:   vec4<f32>,
  @location(0)       color: vec4<f32>,
}

// Each segment expands to a quad: 4 corner offsets relative to the segment rect.
// Vertices: 6 (2 triangles) per instance.
var<private> QUAD_OFFSETS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
  vec2<f32>(0.0,  0.5),  // TL
  vec2<f32>(1.0,  0.5),  // TR
  vec2<f32>(1.0, -0.5),  // BR
  vec2<f32>(0.0,  0.5),  // TL
  vec2<f32>(1.0, -0.5),  // BR
  vec2<f32>(0.0, -0.5),  // BL
);

@vertex
fn vs_main(
  @builtin(vertex_index) vi: u32,
  inst: SkidInstance,
) -> VertOut {
  let qo = QUAD_OFFSETS[vi];

  // Segment direction
  let dx = inst.x2 - inst.x1;
  let dy = inst.y2 - inst.y1;
  let len = max(sqrt(dx * dx + dy * dy), 0.001);
  let nx = dx / len;  // normalised forward
  let ny = dy / len;
  let rx = -ny;       // perpendicular (right)
  let ry =  nx;

  // Expand: qo.x along segment, qo.y perpendicular
  let wx = inst.x1 + qo.x * dx + qo.y * inst.width * rx;
  let wy = inst.y1 + qo.x * dy + qo.y * inst.width * ry;

  // World → accumulation texture NDC
  let eff  = u.zoom * u.ppm;
  let ndcX =  wx * eff / (u.texWidth  * 0.5);
  let ndcY = -wy * eff / (u.texHeight * 0.5);

  var out: VertOut;
  out.pos   = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.color = vec4<f32>(inst.r * inst.alpha, inst.g * inst.alpha, inst.b * inst.alpha, inst.alpha);
  return out;
}

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
  return in.color;
}
