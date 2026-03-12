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

@group(0) @binding(0) var<uniform> u:        CompositeUniforms;
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
fn vs_main(@builtin(vertex_index) vi: u32) -> VertOut {
  let p = QUAD_VERTS[vi];
  var out: VertOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  // Map NDC [-1,1] to UV via zoom-aware scale.
  // NDC Y is flipped relative to world/texture Y (hence -uvScaleY).
  // At p=(0,0): UV = (uvCenterX, uvCenterY) = camera world position in UV space.
  // At p=(1,0): UV = (uvCenterX + uvScaleX, uvCenterY) = right edge of viewport.
  out.uv = vec2<f32>(u.uvCenterX, u.uvCenterY) + p * vec2<f32>(u.uvScaleX, -u.uvScaleY);
  return out;
}

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
  return textureSample(skidTex, skidSamp, in.uv);
}
