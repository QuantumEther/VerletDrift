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

## Milestone 4 — integrated GPU splash and persistent deposits

This supersedes the earlier implementation-status notes above. The laboratory now has:

- GPU vertex animation of connected sheets and curved filaments using shared original `makeSheetMesh` / `makeStrandMesh` topology. WebGPU uses explicit TSL physical materials; WebGL has matching vertex deformation and transparency shaders. CPU updates bounded event/instance data, not sheet vertices.
- Analytic ballistic droplets with a bounded impact-velocity contribution, cached first terrain crossings, and a central pooled deposit. This is artistic liquid motion, not a fluid mass/momentum solver.
- A deterministic 128² thickness/normal atlas generated once. Irregular deposits are tessellated onto sampled terrain; vertices and normals upload only on landing. TSL drying changes opacity, roughness and clearcoat continuously, retaining residue. Standard physical lighting consumes the scene's lights and environment. The WebGL fallback also varies opacity and roughness, although its clearcoat remains fixed.
- World-coordinate deposition and bounded pools: 128 balloons, 16 simultaneous sheet events, 2,048 flying droplets, 4,096 patch slots. A configured field of 128 balloons can deposit all 17 patches each without eviction. Respawn deliberately clears liquid. Collision envelopes use the selected vehicle's front/rear/width dimensions and actual wheel positions, with interpolated swept-sphere events. Envelopes remain approximations, including wheel spheres rather than exact cylinders and straight chords through rotating poses.

### Verification executed

From repository root:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/balloons-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/balloons-browser.mjs webgl
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/balloons-laboratory-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/balloons-laboratory-browser.mjs webgl
```

44 tests passed, including actual vehicle coasting impacts at 4 and 18 m/s, no mutation of vehicle state, ballistic acceleration, first slope intersection and irregular feathering. Both full laboratory pages initialized and their UI successfully respawned 36 balloons without page errors. This UI test is paused; it is not an end-to-end driving demonstration.

The offscreen fixtures capture three balloon sizes, airborne sheets, droplets, settled deposits, another camera angle, reduced sunlight and low-angle sun (`results/balloons-{backend}-*.png`). Visual inspection confirmed crimson sheets after correcting a node-color regression, filaments and irregular deposits. These are diagnostic scenes, not photorealistic full-vehicle screenshots. Origin-shift comparison changed zero pixels above RGB tolerance 3 (maximum difference 1), and terrain vertex sample count stayed 425 before and after rebasing. This verifies that settled geometry is reused and remains world-anchored.

Raw JSON includes browser, Three.js revision, dimensions, draw counts, CPU draw timings and rendering-on/off measurements. All measurements use Chromium/SwiftShader, not the user's RTX GPU. Current WebGPU example: effect draw CPU mean 0.120 ms, p95 0.40 ms, worst 1.20 ms over 300 calls. The ground-only A/B render fixture measured CPU submission means 0.270/1.870 ms and GPU render-pass-batch means 10.016/12.362 ms with effects off/on. These serialized, software-renderer timings do not measure display presentation, FPS or RTX performance. Timestamp queries are explicitly render-pass batches. WebGL GPU timestamps were not collected. No speedup is claimed; visual effects add rendering work.

### Launch and limitations

Serve the repository root (`python3 -m http.server 8000`) and open:

`http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/?backend=webgpu`

Use `?backend=webgl` for the fallback. Open **Crimson balloons · experimental**, choose count/size/splash scale/persistence, and press **Respawn balloons / clear liquid**. Balloons start six metres forward in a corridor. Vehicle controls, physics, audio and historical laboratories were not modified.

Remaining validation: RTX timing and native presentation, prolonged interactive driving, simultaneous smoke/liquid transparency ordering and HDRI comparisons. Transparent sheets use conventional sorted blending, so overlapping smoke/sheets are not order-independent. There is no scene refraction or fluid self-shadowing. The membranes and branching-looking filaments are procedural approximations, not fluid fracture. Terrain intersections are bounded at 0.05 s brackets and 3 s flight time; very narrow ridges can be missed. Patch tessellation is finite, collision gaps over 0.25 s are skipped, and deposits at very large world coordinates inherit float precision limits. The measured milestones establish a working integrated prototype, not final cinematic-quality acceptance.
