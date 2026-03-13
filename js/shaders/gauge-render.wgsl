// =============================================================
// GAUGE SHADER — GPU-based analog gauge rendering with motion blur
// Minimal version: procedural gauge face + needle with smooth blur trail
// =============================================================

struct CameraUniforms {
  zoom:      f32,
  ppm:       f32,
  viewportW: f32,
  viewportH: f32,
}

struct GaugeUniforms {
  decayRate: f32,
  pad0: f32,
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(1) @binding(0) var<uniform> gaugeUni: GaugeUniforms;

// Vertex input: instance data for gauge
struct GaugeInstance {
  @location(1) screenX:         f32,
  @location(2) screenY:         f32,
  @location(3) needleAngle:     f32,
  @location(4) gaugeType:       u32,
  @location(5) size:            f32,
  @location(6) r:               f32,
  @location(7) g:               f32,
  @location(8) b:               f32,
  @location(9) angularVelocity: f32,
  @location(10) pad0:           f32,
  @location(11) pad1:           f32,
  @location(12) pad2:           f32,
}

// Vertex output: interpolated to fragment shader
struct VertOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) needleAngle: f32,
  @location(2) angularVelocity: f32,
}

// Unit quad vertices for gauge face
fn getQuadVert(index: u32) -> vec2<f32> {
  switch(index) {
    case 0u: { return vec2<f32>(-1.0, -1.0); }
    case 1u: { return vec2<f32>( 1.0, -1.0); }
    case 2u: { return vec2<f32>( 1.0,  1.0); }
    case 3u: { return vec2<f32>(-1.0, -1.0); }
    case 4u: { return vec2<f32>( 1.0,  1.0); }
    case 5u: { return vec2<f32>(-1.0,  1.0); }
    default: { return vec2<f32>(0.0, 0.0); }
  }
}

@vertex
fn vs_main(
  @builtin(vertex_index) vi: u32,
  inst: GaugeInstance,
) -> VertOut {
  let lv = getQuadVert(vi);

  // Scale by gauge size
  let sx = lv.x * inst.size;
  let sy = lv.y * inst.size;

  // Translate to screen position
  let screenX = inst.screenX + sx;
  let screenY = inst.screenY + sy;

  // Convert to NDC
  let ndcX = (screenX / cam.viewportW) * 2.0 - 1.0;
  let ndcY = 1.0 - (screenY / cam.viewportH) * 2.0;

  var out: VertOut;
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.uv = lv;
  out.needleAngle = inst.needleAngle;
  out.angularVelocity = inst.angularVelocity;
  return out;
}

@fragment
fn fs_main(vert: VertOut) -> vec4<f32> {
  let uv = vert.uv;
  let r = length(uv);

  // Discard outside gauge
  if (r > 1.0) { discard; }

  // Gauge background: dark face with light ring
  let faceDist = abs(r - 0.7);
  let faceColor = mix(vec4<f32>(0.1, 0.1, 0.12, 1.0),
                      vec4<f32>(0.3, 0.3, 0.35, 1.0),
                      smoothstep(0.1, 0.0, faceDist));

  var color = faceColor;

  // Draw motion blur trail (16 historical samples)
  for (var i: u32 = 0u; i < 16u; i = i + 1u) {
    let alpha = f32(i) / 16.0;
    let decayAlpha = exp(-gaugeUni.decayRate * alpha * 3.0);

    if (decayAlpha > 0.01) {
      let sampleAngle = vert.needleAngle - vert.angularVelocity * alpha * 0.3;

      // Draw needle at sampled angle
      let cos_a = cos(sampleAngle);
      let sin_a = sin(sampleAngle);
      let needleDir = vec2<f32>(cos_a, sin_a);

      // Distance to needle line
      let needleLength = 0.6;
      let needleWidth = 0.02;
      let needleTip = needleDir * needleLength;

      // Simple distance check
      let t = clamp(dot(uv, needleDir) / dot(needleDir, needleDir), 0.0, 1.0);
      let closest = needleDir * t;
      let distToNeedle = length(uv - closest);

      if (distToNeedle < needleWidth && t >= 0.0 && t <= needleLength) {
        let needleAlpha = (1.0 - distToNeedle / needleWidth) * decayAlpha * 0.3;
        color = mix(color, vec4<f32>(1.0, 0.3, 0.2, needleAlpha), needleAlpha);
      }
    }
  }

  // Draw current needle (brightest)
  let cos_a = cos(vert.needleAngle);
  let sin_a = sin(vert.needleAngle);
  let needleDir = vec2<f32>(cos_a, sin_a);
  let needleLength = 0.6;
  let needleWidth = 0.02;

  let t = clamp(dot(uv, needleDir) / dot(needleDir, needleDir), 0.0, 1.0);
  let closest = needleDir * t;
  let distToNeedle = length(uv - closest);

  if (distToNeedle < needleWidth && t >= 0.0 && t <= needleLength) {
    let needleAlpha = (1.0 - distToNeedle / needleWidth);
    color = mix(color, vec4<f32>(1.0, 0.3, 0.2, 1.0), needleAlpha);
  }

  // Pivot cap
  if (length(uv) < 0.05) {
    color = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  // Premultiply alpha
  color.rgb = color.rgb * color.a;
  return color;
}
