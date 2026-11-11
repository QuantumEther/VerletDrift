# Balloon milestone 1 — incomplete system

Presentation-only prototype: three crimson ellipsoid sizes, a bounded instanced pool, world-space positions and bounded swept impact events. Original balloon event concepts and liquid laboratory analytic topology were inspected. No liquid algorithms have yet been ported.

Collision currently uses a conservative sphere around the moving chassis, not the actual body/wheel geometry. Rotational sweeps and long frame gaps are not resolved. This must be refined before claiming accurate vehicle collisions. No impulses affect the car.

Splash membranes, filaments, droplets, persistent wet deposition, TSL liquid shading, UI controls and real-browser/performance verification are not implemented in this milestone. Native standard physical material is used for balloons; backend-specific appearance has not yet been verified. This is not completion of the requested mission.

## Milestone 2

Added pooled analytic ballistic droplets and terrain-deposited wet patches, integrated into the existing laboratory draw path. Instanced physical materials use existing environment lighting and backend material conversion. Controls are in **Crimson balloons · experimental**. Droplet scale is driven by balloon radius and impact speed, with fixed gravity; this is an artistic velocity distribution, not fluid momentum conservation. Terrain intersection uses bounded bisection. Deposit color changes exponentially with age while residue remains. The 128-event cap can eventually evict old deposits; unlimited persistence is not claimed.

Executed `node --test .../laboratory/*.test.mjs` and `node .../laboratory/balloons-browser.mjs` from repository root. The latter initialized native WebGPU in headless Chromium/SwiftShader, rendered balloon, impact and deposited stages, and reported one impact and sixteen wet patches without runtime errors. It is a synthetic presentation test, not actual driving or a screenshot-based visual assessment. GPU presentation, WebGL appearance, CPU/GPU overhead and prolonged driving are not yet verified.

Still outstanding: accurate body/wheel swept collision, membranes/tearing sheets/branching filaments, thickness-dependent TSL material, terrain-conforming patch tessellation, robust curved-terrain intersection, persistent accumulation beyond pool eviction, camera/lighting comparisons and measured overhead. Existing shading is standard physical material, not the requested specialized TSL liquid model. This milestone is explicitly partial.

## Milestone 3

Sweeps now follow four chassis-envelope spheres and actual wheel presentation positions/radii. These are approximate envelopes, not triangle-mesh or cylinder collisions. Impact time is interpolated within the sampled interval. Large frame gaps and rotational curvature remain limitations.

Added connected radial splash membranes with bounded topology, analytic expansion/gravity and deterministic missing sectors as a tearing approximation. This implementation evaluates geometry on CPU; GPU-driven TSL deformation and branching filaments remain outstanding. Terrain patch orientation now reads the actual sampler gradient field.

Reran all 41 laboratory tests and the native WebGPU offscreen smoke test. Saved `results/balloon-deposit.png`: visual inspection shows simple dark oval patches on a diagnostic flat ground, not convincing irregular liquid yet. Do not regard this image as fulfillment of visual acceptance. No measured performance improvement, full-laboratory screenshot or multi-camera claim is made.
