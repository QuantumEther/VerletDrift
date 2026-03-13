// =============================================================
// GAUGE SHADER — GPU-based analog gauge rendering with motion blur
// Replaces Canvas 2D gauge rendering for speedometer, RPM, lateral G
//
// Per-instance: [screenX, screenY, needleAngle, gaugeType, size, r, g, b, h0, h1, h2, h3]
// Geometry: unit quad (6 verts), rendered as circular arc dial + rotating needle
// Fragment: procedural gauge face + motion blur trail via history samples
// =============================================================

struct CameraUniforms {
  zoom:      f32,
  ppm:       f32,
  viewportW: f32,
  viewportH: f32,
}

struct GaugeUniforms {
  decayRate: f32,           // Exponential fade rate for motion blur trail
  pad0: f32, pad1: f32, pad2: f32,  // Padding to 16 bytes
}

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(1) @binding(0) var<uniform> gaugeUni: GaugeUniforms;

// Per-instance data: [screenX, screenY, needleAngle, gaugeType, size, r, g, b, angularVelocity, pad×3]
// Locations 1-13: 13 floats per instance
struct GaugeInstance {
  @location(1) screenX:         f32,      // Screen-space X (pixels)
  @location(2) screenY:         f32,      // Screen-space Y (pixels)
  @location(3) needleAngle:     f32,      // Current needle angle (radians, 0-1.5π)
  @location(4) gaugeType:       u32,      // 0=speedometer, 1=rpm, 2=lateral-g
  @location(5) size:            f32,      // Gauge radius in pixels
  @location(6) r:               f32,      // Needle color (r)
  @location(7) g:               f32,      // Needle color (g)
  @location(8) b:               f32,      // Needle color (b)
  @location(9) angularVelocity: f32,      // Needle angular velocity (rad/s) for smooth blur
  @location(10) pad0:           f32,      // padding
  @location(11) pad1:           f32,      // padding
  @location(12) pad2:           f32,      // padding
}

struct VertOut {
  @builtin(position) pos:     vec4<f32>,
  @location(0)        color:   vec4<f32>,
  @location(1)        uv:      vec2<f32>,           // Local UV [-1, 1]
  @location(2)        needleAngle: f32,            // Needle angle for motion blur sampling
  @location(3)        angularVelocity: f32,        // Angular velocity for smooth blur
}

// Unit quad: 2 triangles, 6 vertices, local coords [-1, 1]
var<private> QUAD_VERTS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

@vertex
fn vs_main(
  @builtin(vertex_index) vi: u32,
  inst: GaugeInstance,
) -> VertOut {
  let lv = QUAD_VERTS[vi];

  // Scale by gauge size (screen-space pixels)
  let sx = lv.x * inst.size;
  let sy = lv.y * inst.size;

  // Translate to screen position (pixels)
  let screenX = inst.screenX + sx;
  let screenY = inst.screenY + sy;

  // Convert screen pixels to NDC [-1, 1]
  // Screen coords: X [0, viewportW], Y [0, viewportH]
  // NDC: X [-1, 1], Y [-1, 1] (Y flipped: screen Y-down, NDC Y-up)
  let ndcX = (screenX / cam.viewportW) * 2.0 - 1.0;
  let ndcY = 1.0 - (screenY / cam.viewportH) * 2.0;

  var out: VertOut;
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  out.color = vec4<f32>(1.0);
  out.uv = lv;
  out.needleAngle = inst.needleAngle;
  out.angularVelocity = inst.angularVelocity;

  return out;
}

// =============================================================
// FRAGMENT SHADER — Procedural gauge rendering
// =============================================================

// Signed distance to a circle (negative inside, positive outside)
fn sdCircle(uv: vec2<f32>, radius: f32) -> f32 {
  return length(uv) - radius;
}

// Signed distance to a line segment
fn sdLineSegment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Rotate 2D vector by angle (radians)
fn rotate2d(v: vec2<f32>, angle: f32) -> vec2<f32> {
  let c = cos(angle);
  let s = sin(angle);
  return vec2<f32>(v.x * c - v.y * s, v.x * s + v.y * c);
}

// Draw gauge background: circular face with ticks
fn drawGaugeFace(uv: vec2<f32>) -> vec4<f32> {
  let r = length(uv);

  // Gauge face: outer circle (r=0.8..1.0) for shadow/border
  let outerDist = abs(r - 0.95);
  let outerRing = smoothstep(0.02, 0.01, outerDist);

  // Gauge dial face: filled circle up to r=0.8
  let faceDist = r - 0.80;
  let faceColor = vec4<f32>(0.15, 0.15, 0.18, 1.0);  // Dark gray face
  let face = smoothstep(0.02, -0.02, faceDist);

  // Major tick marks: radial lines
  let angle = atan2(uv.y, uv.x);
  let angleMod = fract(angle / (3.14159265359 * 2.0 / 12.0)) * (3.14159265359 * 2.0 / 12.0);
  let tickAngle = abs(angleMod - (3.14159265359 * 2.0 / 24.0));
  let isMajorTick = tickAngle < (3.14159265359 * 2.0 / 120.0);

  // Tick line from r=0.75 to r=0.85
  let tickLine = (r > 0.74 && r < 0.86 && isMajorTick) ? 1.0 : 0.0;

  // Combine: face + outer ring + ticks
  let color = faceColor * face + vec4<f32>(0.3, 0.3, 0.3, 1.0) * outerRing + vec4<f32>(0.5, 0.5, 0.5, 1.0) * tickLine;

  return color;
}

// Draw a needle at given angle with variable opacity
fn drawNeedle(uv: vec2<f32>, needleAngle: f32, opacity: f32) -> vec4<f32> {
  // Needle: line from center (0,0) to tip at angle
  let needleLength = 0.65;  // Extends to 65% of gauge radius
  let needleWidth = 0.02;   // Line thickness (normalized to gauge radius)

  // Needle tip position
  let tip = vec2<f32>(cos(needleAngle), sin(needleAngle)) * needleLength;

  // Distance from current pixel to needle line segment
  let distToNeedle = sdLineSegment(uv, vec2<f32>(0.0, 0.0), tip);

  // Render needle: soft falloff from center to edge
  let needleColor = smoothstep(needleWidth, 0.0, distToNeedle);

  // Needle color: red with opacity
  return vec4<f32>(needleColor, needleColor * 0.5, needleColor * 0.3, needleColor * opacity);
}

// Draw pivot cap (center circle)
fn drawPivotCap(uv: vec2<f32>) -> vec4<f32> {
  let pivotRadius = 0.05;
  let distToPivot = length(uv) - pivotRadius;
  let pivot = smoothstep(pivotRadius, 0.0, abs(distToPivot));

  // Pivot cap: dark with highlight
  return vec4<f32>(0.1, 0.1, 0.12, pivot);
}

@fragment
fn fs_main(vert: VertOut) -> vec4<f32> {
  let uv = vert.uv;

  // Discard pixels outside gauge radius
  if (length(uv) > 1.0) {
    discard;
  }

  // Draw gauge background
  var color = drawGaugeFace(uv);

  // Draw smooth motion blur trail along angular velocity direction
  // This creates a continuous blur effect that follows the needle's rotation
  let blurRadius = abs(vert.angularVelocity) * 0.1;  // How far back the blur extends
  let blurSamples = 16u;  // 16 samples for smooth appearance

  for (var i: u32 = 0u; i < blurSamples; i = i + 1u) {
    let sampleFraction = f32(i) / f32(blurSamples);
    let sampleAge = sampleFraction;  // Age normalized [0, 1]
    let sampleAlpha = exp(-gaugeUni.decayRate * sampleAge * 3.0);  // Decay over blur window

    if (sampleAlpha > 0.01) {
      // Sample angle along rotation direction
      let sampleAngle = vert.needleAngle - vert.angularVelocity * sampleAge * 0.3;
      let blurColor = drawNeedle(uv, sampleAngle, sampleAlpha);
      color = mix(color, blurColor, blurColor.a);
    }
  }

  // Draw current needle (brightest)
  let needleColor = drawNeedle(uv, vert.needleAngle, 1.0);
  color = mix(color, needleColor, needleColor.a);

  // Draw pivot cap on top
  let pivotColor = drawPivotCap(uv);
  color = mix(color, pivotColor, pivotColor.a);

  // Premultiply alpha for GPU blending
  color.rgb = color.rgb * color.a;

  return color;
}
