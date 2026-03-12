// =============================================================
// SMOKE COMPUTE SHADER — GPU-Accelerated Particle Advection
// =============================================================
// Executes in parallel over all smoke particles.
// Applies curl noise turbulence, gravity, drag, and aging.
// Writes updated positions/velocities back to storage buffer.

struct SmokeParticle {
  pos: vec2<f32>,       // world position (metres)
  vel: vec2<f32>,       // velocity (m/s)
  life: f32,            // remaining lifetime (seconds)
  maxLife: f32,         // original lifetime
  size: f32,            // base radius (metres)
  r: f32, g: f32, b: f32,  // RGB color [0,1]
  alpha: f32,           // opacity [0,1]
}

struct SmokeUniforms {
  dt: f32,                    // delta time (seconds)
  particleCount: u32,         // number of live particles
  curlNoiseScale: f32,        // turbulence intensity multiplier
  noiseOffsetTime: f32,       // time-based noise animation offset
  cameraX: f32,               // camera position X (for culling)
  cameraY: f32,               // camera position Y
  _pad0: f32, _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: SmokeUniforms;
@group(0) @binding(1) var<storage, read_write> particles: array<SmokeParticle>;

// =============================================================
// PERLIN NOISE (2D hash-based gradient noise)
// =============================================================

fn hash2(p: vec2<f32>) -> vec2<f32> {
  // Hash function returning 2D gradient direction in [-1, 1]
  let h = sin(vec2<f32>(
    dot(p, vec2<f32>(127.1, 311.7)),
    dot(p, vec2<f32>(269.5, 183.3))
  )) * 43758.5453;
  return fract(h) * 2.0 - 1.0;
}

fn perlinNoise(p: vec2<f32>) -> f32 {
  // Classic 2D Perlin noise
  let pi = floor(p);
  let pf = fract(p);

  // Smoothstep interpolation curve
  let u = pf * pf * (3.0 - 2.0 * pf);

  // Sample gradients at 4 corners
  let n00 = dot(hash2(pi), pf);
  let n10 = dot(hash2(pi + vec2<f32>(1.0, 0.0)), pf - vec2<f32>(1.0, 0.0));
  let n01 = dot(hash2(pi + vec2<f32>(0.0, 1.0)), pf - vec2<f32>(0.0, 1.0));
  let n11 = dot(hash2(pi + vec2<f32>(1.0, 1.0)), pf - vec2<f32>(1.0, 1.0));

  // Interpolate
  let nx0 = mix(n00, n10, u.x);
  let nx1 = mix(n01, n11, u.x);
  return mix(nx0, nx1, u.y);
}

// =============================================================
// CURL NOISE (Divergence-free turbulence field)
// =============================================================

fn sampleCurlNoise(pos: vec2<f32>, time: f32) -> vec2<f32> {
  // Compute curl of Perlin noise field: ∇²P = (∂P/∂y, -∂P/∂x)
  // Creates natural swirling motion without divergence

  let eps = 0.05;   // gradient sampling offset (metres)
  let animPos = pos + vec2<f32>(time * 0.3, 0.0);  // animate noise field

  // Sample Perlin at offset positions
  let n0 = perlinNoise(animPos + vec2<f32>(eps, 0.0));
  let n1 = perlinNoise(animPos - vec2<f32>(eps, 0.0));
  let n2 = perlinNoise(animPos + vec2<f32>(0.0, eps));
  let n3 = perlinNoise(animPos - vec2<f32>(0.0, eps));

  // Compute curl: perpendicular to gradient
  let curl_x = (n2 - n3) / (2.0 * eps);  // ∂/∂y
  let curl_y = (n0 - n1) / (2.0 * eps);  // -∂/∂x

  return vec2<f32>(curl_x, curl_y);
}

// =============================================================
// MAIN COMPUTE KERNEL
// =============================================================

@compute @workgroup_size(256, 1, 1)
fn computeSmoke(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;

  // Bounds check
  if (idx >= uniforms.particleCount) {
    return;
  }

  var p = particles[idx];

  // ---- 1. AGE PARTICLE ----
  p.life -= uniforms.dt;
  if (p.life <= 0.0) {
    // Dead particle: mark for culling (alpha = 0)
    p.alpha = 0.0;
    particles[idx] = p;
    return;
  }

  // ---- 2. FADE IN/OUT ----
  // Fade in during first 10% of life, fade out during last 20%
  let lifeFrac = p.life / p.maxLife;
  var fadeMul = 1.0;
  if (lifeFrac > 0.90) {
    // Fade out: linear from 90% to 100%
    fadeMul = (1.0 - lifeFrac) / 0.10;
  } else if (lifeFrac < 0.10) {
    // Fade in: linear from 0% to 10%
    fadeMul = lifeFrac / 0.10;
  }
  p.alpha *= fadeMul;

  // ---- 3. CURL NOISE ADVECTION ----
  // Sample turbulence field at particle position
  let curlVel = sampleCurlNoise(p.pos, uniforms.noiseOffsetTime);
  let turbForce = curlVel * uniforms.curlNoiseScale;  // scale by slider [0.5–5.0]

  // ---- 4. APPLY FORCES ----
  // Gravity (reduced, gives light upward drift for smoke)
  let gravity = vec2<f32>(0.0, -0.8 * uniforms.dt);  // upward (Y-down = negative)

  // Turbulent advection
  let advectForce = turbForce * 1.5;

  // Apply forces to velocity
  p.vel = p.vel + (gravity + advectForce) * uniforms.dt;

  // ---- 5. DRAG (Air resistance) ----
  p.vel *= 0.96;  // per-frame drag

  // ---- 6. INTEGRATE POSITION ----
  p.pos += p.vel * uniforms.dt;

  // ---- 7. SIZE GROWTH ----
  // Particles grow over their lifetime: 1.0x at spawn, 3.0x at end
  p.size = p.size * (1.0 + lifeFrac * 2.0);

  // ---- 8. VISIBILITY CULLING ----
  // Cull particles far from camera (>300m away)
  let cameraPos = vec2<f32>(uniforms.cameraX, uniforms.cameraY);
  let distToCamera = distance(p.pos, cameraPos);
  if (distToCamera > 300.0) {
    p.alpha = 0.0;
  }

  // ---- 9. WRITE BACK TO BUFFER ----
  particles[idx] = p;
}
