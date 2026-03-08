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

@group(0) @binding(0) var<uniform> uniforms: AccumUniforms;

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
  @builtin(vertex_index) vertexIndex: u32,
  instance: SkidInstance,
) -> VertOut {
  let quadOffset = QUAD_OFFSETS[vertexIndex];

  // Segment direction
  let segmentDeltaX = instance.x2 - instance.x1;
  let segmentDeltaY = instance.y2 - instance.y1;
  let segmentLength = max(sqrt(segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY), 0.001);
  let forwardNormalX = segmentDeltaX / segmentLength;  // normalised forward
  let forwardNormalY = segmentDeltaY / segmentLength;
  let rightPerpendicularX = -forwardNormalY;  // perpendicular (right)
  let rightPerpendicularY =  forwardNormalX;

  // Expand: quadOffset.x along segment, quadOffset.y perpendicular
  let worldPositionX = instance.x1 + quadOffset.x * segmentDeltaX + quadOffset.y * instance.width * rightPerpendicularX;
  let worldPositionY = instance.y1 + quadOffset.x * segmentDeltaY + quadOffset.y * instance.width * rightPerpendicularY;

  // World → accumulation texture NDC
  let effectivePixelsPerMeter = uniforms.zoom * uniforms.ppm;
  let normalizedDeviceCoordX =  worldPositionX * effectivePixelsPerMeter / (uniforms.texWidth  * 0.5);
  let normalizedDeviceCoordY = -worldPositionY * effectivePixelsPerMeter / (uniforms.texHeight * 0.5);

  var output: VertOut;
  output.pos   = vec4<f32>(normalizedDeviceCoordX, normalizedDeviceCoordY, 0.0, 1.0);
  output.color = vec4<f32>(instance.r * instance.alpha, instance.g * instance.alpha, instance.b * instance.alpha, instance.alpha);
  return output;
}

@fragment
fn fs_main(input: VertOut) -> @location(0) vec4<f32> {
  return input.color;
}
