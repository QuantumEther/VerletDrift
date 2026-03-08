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

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

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
  @builtin(vertex_index) vertexIndex: u32,
  instance: ParticleInstance,
) -> VertOut {
  let localVertex = QUAD_VERTS[vertexIndex];

  // Scale by particle size (world-space metres)
  let worldPositionX = instance.worldX + localVertex.x * instance.size;
  let worldPositionY = instance.worldY + localVertex.y * instance.size;

  let effectivePixelsPerMeter = cameraUniforms.zoom * cameraUniforms.ppm;
  let normalizedDeviceCoordX =  worldPositionX * effectivePixelsPerMeter / (cameraUniforms.viewportW * 0.5);
  let normalizedDeviceCoordY = -worldPositionY * effectivePixelsPerMeter / (cameraUniforms.viewportH * 0.5);

  var output: VertOut;
  output.pos   = vec4<f32>(normalizedDeviceCoordX, normalizedDeviceCoordY, 0.0, 1.0);
  output.color = vec4<f32>(instance.r * instance.alpha, instance.g * instance.alpha, instance.b * instance.alpha, instance.alpha);
  output.uv    = localVertex * 2.0; // [−1, 1] range
  return output;
}

@fragment
fn fs_main(input: VertOut) -> @location(0) vec4<f32> {
  // Circular clip: discard outside unit circle
  if (dot(input.uv, input.uv) > 1.0) { discard; }
  return input.color;
}
