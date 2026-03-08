// =============================================================
// SKID COMPOSITE SHADER — Blits accumulated skid texture into world space
// Uses UV centre + scale to correctly map any zoom level to the texture.
// =============================================================

struct CompositeUniforms {
  uvCenterX: f32,  // UV X of camera centre (camera.x / mapWidth)
  uvCenterY: f32,  // UV Y of camera centre (camera.y / mapHeight)
  uvScaleX:  f32,  // half UV extent of canvas width  = canvasW / (2 * zoom * ppm * mapW)
  uvScaleY:  f32,  // half UV extent of canvas height = canvasH / (2 * zoom * ppm * mapH)
}

@group(0) @binding(0) var<uniform> uniforms: CompositeUniforms;
@group(0) @binding(1) var          skidTex:  texture_2d<f32>;
@group(0) @binding(2) var          skidSamp: sampler;

struct VertOut {
  @builtin(position) pos: vec4<f32>,
  @location(0)       uv:  vec2<f32>,
}

var<private> QUAD_VERTS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertOut {
  let quadNdcPosition = QUAD_VERTS[vertexIndex];
  var output: VertOut;
  output.pos = vec4<f32>(quadNdcPosition, 0.0, 1.0);
  // Map NDC [-1,1] to UV via zoom-aware scale.
  // NDC Y is flipped relative to world/texture Y (hence -uvScaleY).
  // At quadNdcPosition=(0,0): UV = (uvCenterX, uvCenterY) = camera world position in UV space.
  // At quadNdcPosition=(1,0): UV = (uvCenterX + uvScaleX, uvCenterY) = right edge of viewport.
  output.uv = vec2<f32>(uniforms.uvCenterX, uniforms.uvCenterY) + quadNdcPosition * vec2<f32>(uniforms.uvScaleX, -uniforms.uvScaleY);
  return output;
}

@fragment
fn fs_main(input: VertOut) -> @location(0) vec4<f32> {
  return textureSample(skidTex, skidSamp, input.uv);
}
