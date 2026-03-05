// =============================================================
// BACKGROUND SHADER — Procedural checkerboard + motion blur
// Replaces the Canvas 2D drawCheckerboard() loop (12,000 fillRects → 1 draw call).
// =============================================================

struct BgUniforms {
  camX:        f32,  // camera world-space X (metres)
  camY:        f32,  // camera world-space Y
  zoom:        f32,  // camera zoom multiplier
  ppm:         f32,  // pixels per metre
  viewportW:   f32,  // canvas physical pixel width
  viewportH:   f32,  // canvas physical pixel height
  tileSize:    f32,  // checkerboard tile size in world-space metres
  blurAmount:  f32,  // effective blur accumulator * intensity [0, 1]
  blurVelX:    f32,  // normalised velocity direction X
  blurVelY:    f32,  // normalised velocity direction Y
  blurOffset:  f32,  // max world-space blur offset in metres
  sampleCount: f32,  // number of blur samples (cast to i32 in shader)
  shakeX:      f32,  // screen-shake world offset X (metres)
  shakeY:      f32,  // screen-shake world offset Y (metres)
  angularVel:  f32,  // angular velocity (rad/s) for rotational blur
  _pad:        f32,  // padding to 16-byte boundary
}

@group(0) @binding(0) var<uniform> u: BgUniforms;

// Full-screen quad vertices in clip space.
// We bypass vertex attributes and hard-code the 4-vertex quad.
var<private> QUAD_VERTS: array<vec2<f32>, 4> = array<vec2<f32>, 4>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>(-1.0,  1.0),
  vec2<f32>( 1.0,  1.0),
);

struct VertOut {
  @builtin(position) pos:  vec4<f32>,
  @location(0)       uv:   vec2<f32>,  // NDC uv [0,1]
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertOut {
  let p = QUAD_VERTS[vi];
  var out: VertOut;
  out.pos = vec4<f32>(p, 0.0, 1.0);
  out.uv  = p * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out;
}

@fragment
fn fs_main(in: VertOut) -> @location(0) vec4<f32> {
  // Fragment pixel position in canvas pixels.
  let pixX = in.uv.x * u.viewportW;
  let pixY = in.uv.y * u.viewportH;

  // Effective world-space scale (pixels per metre including zoom).
  let eff = u.zoom * u.ppm;

  // World-space coordinates of this fragment (camera + shake offset).
  let camRelX = (pixX - u.viewportW * 0.5) / eff;
  let camRelY = (pixY - u.viewportH * 0.5) / eff;
  let worldX = u.camX + u.shakeX + camRelX;
  let worldY = u.camY + u.shakeY + camRelY;

  // --- MOTION BLUR ---
  let numSamples = max(i32(u.sampleCount), 1);
  var colorAcc = vec3<f32>(0.0);
  var alphaAcc = f32(0.0);

  for (var s: i32 = numSamples - 1; s >= 0; s--) {
    let frac = select(
      f32(s) / max(f32(numSamples - 1), 1.0),
      0.0,
      numSamples == 1
    );

    // Sample weight: current frame (s==0) is fully opaque; older samples fade.
    let sampleAlpha = select(
      u.blurAmount * (1.0 - frac) * 0.7,
      1.0,
      s == 0
    );
    if (sampleAlpha < 0.005) { continue; }

    // World-space offset for this sample.
    let longX = -u.blurVelX * u.blurOffset * frac;
    let longY = -u.blurVelY * u.blurOffset * frac;

    // Rotational blur component.
    let rotAngle = u.angularVel * 0.04 * u.blurAmount * frac;
    let rc = cos(rotAngle);
    let rs = sin(rotAngle);
    let offX = longX * rc - longY * rs;
    let offY = longX * rs + longY * rc;

    let sWorldX = worldX + offX;
    let sWorldY = worldY + offY;

    // Checkerboard tile parity.
    // Use floor→i32 to handle negative coordinates correctly.
    let tileIX = i32(floor(sWorldX / u.tileSize));
    let tileIY = i32(floor(sWorldY / u.tileSize));
    // Bitwise AND handles sign correctly: (-1) & 1 == 1
    let isLight = ((tileIX + tileIY) & 1) == 0;

    // Tile colours matching drawCheckerboard: '#222026' and '#111416'
    let lightC = vec3<f32>(0.1333, 0.1255, 0.1490); // #222026
    let darkC  = vec3<f32>(0.0667, 0.0784, 0.0863); // #111416
    let tileC  = select(darkC, lightC, isLight);

    colorAcc += tileC * sampleAlpha;
    alphaAcc += sampleAlpha;
  }

  // Normalise accumulated samples.
  var finalColor: vec3<f32>;
  if (alphaAcc < 0.001) {
    finalColor = vec3<f32>(0.0667, 0.0784, 0.0863); // fallback dark tile
  } else {
    finalColor = colorAcc / alphaAcc;
  }

  return vec4<f32>(finalColor, 1.0); // fully opaque background
}
