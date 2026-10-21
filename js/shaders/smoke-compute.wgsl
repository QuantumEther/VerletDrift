// =============================================================
// SMOKE COMPUTE SHADER — GPU-Accelerated Particle Advection
// =============================================================
// Executes in parallel over all smoke particles.
// Applies curl noise turbulence, gravity, drag, and aging.
// Writes updated positions/velocities back to storage buffer.

struct SmokeParticle {
  pos: vec2<f32>,       // world-space position (metres)
  vel: vec2<f32>,       // velocity (m/s)
  life: f32,            // remaining lifetime (seconds)
  maxLife: f32,         // original lifetime
  size: f32,            // current radius (metres) — grows during lifetime
  sizeBase: f32,        // original base radius (metres) — used for growth calculation
  r: f32, g: f32, b: f32,  // RGB color [0,1]
  alpha: f32,           // opacity [0,1]
}

struct SmokeUniforms {
  dt: f32,                    // delta time (seconds)
  particleCount: u32,         // total particle slots
  curlNoiseScale: f32,        // turbulence intensity multiplier
  noiseOffsetTime: f32,       // time-based noise animation offset
  cameraX: f32,               // culling origin X (camera-relative convention)
  cameraY: f32,               // culling origin Y
  _pad0: f32, _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: SmokeUniforms;
@group(0) @binding(1) var<storage, read_write> particles: array<SmokeParticle>;
@group(0) @binding(2) var<storage, read_write> aliveFlags: array<u32>;

// Shared read-only instantaneous vehicle-airflow grid; separate from dust maps.
struct AirflowFrame {body:vec4<f32>,motion:vec4<f32>,grid:vec4<f32>,options:vec4<f32>}
@group(1) @binding(0) var<uniform> airflow:AirflowFrame;
@group(1) @binding(1) var<storage,read> airflowGrid:array<vec4<f32>>;
fn sampleVehicleAirflow(position:vec2<f32>)->vec3<f32>{
 let q=(position-airflow.grid.xy)/max(.001,airflow.grid.z);let size=u32(airflow.grid.w);
 if(size<2u||any(q<vec2(0.))||any(q>=vec2(f32(size-1u)))){return vec3(0.);}
 let cell=vec2<u32>(floor(q));let f=fract(q);let k=cell.y*size+cell.x;
 return mix(mix(airflowGrid[k].xyz,airflowGrid[k+1u].xyz,f.x),mix(airflowGrid[k+size].xyz,airflowGrid[k+size+1u].xyz,f.x),f.y);
}

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
  let curl_y = (n1 - n0) / (2.0 * eps);  // -∂/∂x

  return vec2<f32>(curl_x, curl_y);
}

// =============================================================
// MAIN COMPUTE KERNEL
// =============================================================

@compute @workgroup_size(256, 1, 1)
fn computeSmoke(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;

  // Bounds check — clamp to actual live particle count to prevent stale buffer reads
  if (idx >= uniforms.particleCount) {
    return;
  }

  if (aliveFlags[idx] == 0u) {
    return;
  }

  var p = particles[idx];

  // ---- 1. AGE PARTICLE ----
  p.life -= uniforms.dt;
  if (p.life <= 0.0) {
    // Dead particle: free GPU slot.
    p.alpha = 0.0;
    p.life = 0.0;
    particles[idx] = p;
    aliveFlags[idx] = 0u;
    return;
  }

  // Opacity remains the spawn value; the render shader evaluates the envelope
  // from normalized lifetime rather than multiplying it away every frame.
  let lifeFrac = p.life / max(p.maxLife, .0001);

  // ---- 3. CURL NOISE ADVECTION ----
  // Sample turbulence field at particle position
  let curlVel = sampleCurlNoise(p.pos, uniforms.noiseOffsetTime);
  let turbForce = curlVel * uniforms.curlNoiseScale;  // scale by slider [0.5–5.0]

  // ---- 4. APPLY FORCES ----
  // Gravity (reduced, gives light upward drift for smoke)
  let gravity = vec2<f32>(0.0, -0.8);  // upward (Y-down = negative)

  // Turbulent advection
  let advectForce = turbForce * 1.5;

  // Apply forces to velocity
  p.vel = p.vel + (gravity + advectForce) * uniforms.dt;

  // ---- 5. DRAG (Air resistance) ----
  p.vel *= pow(0.96, uniforms.dt * 60.0);  // per-frame drag

  // ---- 6. INTEGRATE POSITION ----
  if(airflow.motion.y>0.){
    // Stable exponential entrainment; bounded substeps resolve rotation at low FPS.
    // Existing turbulence, buoyancy, drag and lifetime above remain intact.
    let steps=u32(clamp(ceil(uniforms.dt*120.),1.,12.));let h=uniforms.dt/f32(steps);
    for(var step=0u;step<steps;step++){
      let flow=sampleVehicleAirflow(p.pos+p.vel*(h*.5));
      p.vel=mix(p.vel,flow.xy,1.-exp(-12.*airflow.motion.y*flow.z*h));
      p.pos+=p.vel*h;
    }
  }else{
    p.pos += p.vel * uniforms.dt;
  }

  // ---- 7. SIZE GROWTH ----
  // Particles grow over their lifetime: 1.0x at spawn, 3.0x at end
  // lifeFrac goes 1→0 as particle ages, so (1 - lifeFrac) goes 0→1
  // Use sizeBase (original size) not current size to avoid exponential explosion
  p.size = p.sizeBase * (1.0 + (1.0 - lifeFrac) * 2.0);

  // ---- 8. VISIBILITY CULLING ----
  // Cull particles far from camera-relative origin (>300m away)
  let cameraPos = vec2<f32>(uniforms.cameraX, uniforms.cameraY);
  let distToCamera = distance(p.pos, cameraPos);
  if (distToCamera > 300.0) {
    p.alpha = 0.0;
    p.life = 0.0;
    aliveFlags[idx] = 0u;
  }

  // ---- 9. WRITE BACK TO BUFFER ----
  particles[idx] = p;
}
