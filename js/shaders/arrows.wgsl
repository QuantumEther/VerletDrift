// =============================================================
// TRAIL ARROWS SHADER — Instanced arrow rendering
// Replaces drawTrailArrows() (3,000 Canvas ops → 1 draw call).
//
// Arrow geometry (local frame, unit scale):
//   Shaft: rectangle from x=0..1, y=±0.5 (scaled by length × lineWidth)
//   Head:  triangle tip at x=1, base at x=0.7
// Vertex layout: 9 vertices for 3 triangles (shaft=2, head=1).
// =============================================================

struct CameraUniforms {
  zoom:      f32,
  ppm:       f32,
  viewportW: f32,
  viewportH: f32,
}

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

// Per-instance data (matches cpu-side Float32Array layout):
//   [camRelX, camRelY, angle, length, lineWidth, r, g, b, alpha]
struct ArrowInstance {
  @location(1) worldX:    f32,
  @location(2) worldY:    f32,
  @location(3) angle:     f32,
  @location(4) length:    f32,
  @location(5) lineWidth: f32,
  @location(6) r:         f32,
  @location(7) g:         f32,
  @location(8) b:         f32,
  @location(9) alpha:     f32,
}

struct VertOut {
  @builtin(position) pos:   vec4<f32>,
  @location(0)       color: vec4<f32>,
}

// Arrow geometry in normalised local space.
// 9 vertices, 3 triangles:
//  Tri0: shaft bottom-left, shaft bottom-right, shaft top-right
//  Tri1: shaft bottom-left, shaft top-right,    shaft top-left
//  Tri2: head  left,        head tip,            head right
// X axis = along arrow direction, Y axis = perpendicular, scale=1.
var<private> ARROW_VERTS: array<vec2<f32>, 9> = array<vec2<f32>, 9>(
  // Shaft (goes from x=0 to x=0.68, half-width = 0.5 in Y)
  vec2<f32>(0.00, -0.5),   // 0 shaft BL
  vec2<f32>(0.68, -0.5),   // 1 shaft BR
  vec2<f32>(0.68,  0.5),   // 2 shaft TR
  vec2<f32>(0.00, -0.5),   // 3 shaft BL (dup)
  vec2<f32>(0.68,  0.5),   // 4 shaft TR (dup)
  vec2<f32>(0.00,  0.5),   // 5 shaft TL
  // Arrowhead (x=0.68..1.0, flares to ±1.1 in Y)
  vec2<f32>(0.68, -1.1),   // 6 head left
  vec2<f32>(1.00,  0.0),   // 7 head tip
  vec2<f32>(0.68,  1.1),   // 8 head right
);

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  instance: ArrowInstance,
) -> VertOut {
  let localVertex = ARROW_VERTS[vertexIndex];

  // Scale: X by length, Y by lineWidth
  let scaledX = localVertex.x * instance.length;
  let scaledY = localVertex.y * instance.lineWidth;

  // Rotate by arrow angle
  let cosAngle = cos(instance.angle);
  let sinAngle = sin(instance.angle);
  let rotatedX = scaledX * cosAngle - scaledY * sinAngle;
  let rotatedY = scaledX * sinAngle + scaledY * cosAngle;

  // Translate to world position (already camera-relative)
  let worldPositionX = instance.worldX + rotatedX;
  let worldPositionY = instance.worldY + rotatedY;

  // World → NDC (Y flipped: canvas Y-down, NDC Y-up)
  let effectivePixelsPerMeter = cameraUniforms.zoom * cameraUniforms.ppm;
  let normalizedDeviceCoordX =  worldPositionX * effectivePixelsPerMeter / (cameraUniforms.viewportW * 0.5);
  let normalizedDeviceCoordY = -worldPositionY * effectivePixelsPerMeter / (cameraUniforms.viewportH * 0.5);

  var output: VertOut;
  output.pos   = vec4<f32>(normalizedDeviceCoordX, normalizedDeviceCoordY, 0.0, 1.0);
  output.color = vec4<f32>(instance.r * instance.alpha, instance.g * instance.alpha, instance.b * instance.alpha, instance.alpha);
  return output;
}

@fragment
fn fs_main(input: VertOut) -> @location(0) vec4<f32> {
  return input.color; // premultiplied alpha
}
