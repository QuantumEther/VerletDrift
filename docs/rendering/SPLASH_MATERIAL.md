# Unified airborne and deposited crimson water

The puddle material from `647dff7` is the reference. This change replaces the
bright airborne red return, display-space attenuation and unrelated Phong
highlight with the same dyed-water optics used by the puddle. It does not change
splash trajectories, membranes, perforation/breakup timing, contact events,
deposition, atlas reconstruction, controls, car artwork or simulator physics.
The recoverable starting point is branch `verlet_gpt_v23_material_backup_647dff7`.

## Material and integration

`experiments/splash-lab/shaders/material.wgsl` provides shared sRGB conversion,
Beer–Lambert transmission, weak ambient dyed-medium return, water Fresnel
(IOR 1.333), Smith GGX and the fixed overhead luminaire/environment. These
functions were extracted from the puddle shader. The puddle retains its previous
parameters, normals, porosity, wetting, roughness and lighting calculations.
Both renderer modules now load the shared material source.

The airborne material:

- Evaluates absorption and illumination in linear light rather than attenuating
  display RGB. Extinction is the puddle's `(18, 260, 420)` per metre, multiplied
  by the existing concentration setting.
- Maps the existing airborne thickness proxy to an optical depth of
  `proxy * .012` metres. This is an artistic optical calibration, not a change
  to simulated volume, particle radius or the established vehicle geometry.
- Uses the same weak crimson medium return as standing water, replacing the
  former saturated `1.05` red scattering coefficient. Dark road remains dark
  through liquid; white car panels can naturally transmit brighter red.
- Uses the same oblique viewing direction and light as puddles. Faces orient
  their shading normal toward the viewer. The reflected luminaire intersection
  accounts for airborne height; highlights follow normals and camera projection.
- Broadens highlights using the pixel's normal variation to reduce subpixel
  sparkle. There is no emissive rim, bloom, new glow pass or red light source.
- Thins the optical chord toward droplet and cylindrical filament edges. Their
  meshes, radii, elongated silhouettes, emission and movement remain unchanged.
- Retains a neutral transmitted framebuffer fraction with premultiplied
  compositing, so subsequent layers attenuate preceding liquid rather than
  simply restoring the fixed dry-scene sample. Coverage remains antialiased.

No additional GPU targets, buffers, samplers, draw calls or per-frame CPU uploads
are introduced. The uniform upload remains 112 bytes. Resource reuse, device-loss
cleanup and deposition caching are unchanged. No new UI controls are required.

## Visual comparisons

Captures use the same software WebGPU adapter, seed 1337, 22 m/s, 18 nominal
litres, breakup 1.1, concentration 1.35 and Balanced quality. Time is laboratory
time; impact begins at 0.55 seconds. The offscreen harness executes the real
WGSL and reads back its output; it does not substitute an image for rendering.

| Stage | Before | Unified material |
| --- | --- | --- |
| Peak expansion, 1.25 s | [Before](splash-material/before-peak.png) | [After](splash-material/peak.png) |
| Settled, 5 s | [Before](splash-material/before-settled.png) | [After](splash-material/settled.png) |

Additional captures: [early sheets](splash-material/early.png),
[landing](splash-material/landing.png), [8-second endpoint](splash-material/endpoint.png),
[close-up](splash-material/close-up.png),
[low concentration](splash-material/low-concentration.png),
[high concentration](splash-material/high-concentration.png),
[Performance](splash-material/performance.png) and [High](splash-material/high.png).

The improved puddle stays the reference rather than being brightened to match
old airborne shading. Airborne liquid has dark crimson interiors, translucent
films and neutral localized reflections; finer pieces retain the same dye.

## Limits

This remains an efficient procedural VFX approximation. Extinction and optical
proxy scaling are artistic values, not measured spectroscopy. The weak medium
return approximates fixed ambient illumination. Refraction samples the existing
scene and does not ray trace through multiple interfaces. Single-pass RGBA
compositing retains a neutral transmission fraction; it is not exact spectral
layer compositing or order-independent transparency. Overlap darkening is
approximate and still draw-order dependent. No fluid solver is introduced.

Native RTX 5090 presentation, driver behavior and display frame pacing cannot
be validated in this cloud's software GPU environment. Software timings, if
reported below, are diagnostic and do not establish native GPU performance.

## Validation and measurements

- All **159 unit tests** passed across 17 files, including the existing numerical
  and vehicle behavior regressions. No numerical tolerances were changed.
- Full ordinary Chromium suite: **44 passed, 18 skipped, zero failures**. Skips
  are WebGPU-adapter-dependent cases in the ordinary browser configuration.
- Combined GPU-enabled renderer, diagnostics and laboratory suite: **25 passed**,
  zero skips or failures. This exercises real WGSL, smoke/paint/skids, Canvas
  fallback, target resize and GPU device-loss recovery.
- Focused real-WGSL Splash Laboratory run: **12 passed**, including the new
  airborne material probe. It evaluates the production WGSL functions on the GPU
  rather than a JavaScript copy: identical puddle/airborne transmission for the
  same optical path, greater absorption with thickness/concentration, thin-edge
  transparency, bounded weak crimson return, neutral lighting response and
  reduced transmitted luminance through overlapping layers.
- Default captures at 0.95, 1.25, 1.6, 5 and 8 seconds have exactly the same
  deposition atlas hashes as `647dff7`. The complete settled canvas at 5 seconds
  remains `1776815284`, and at 8 seconds `1822460268`, identical to the baseline
  on this adapter. The car continues along its existing laboratory path between
  those times, so the two whole-image hashes differ from each other. The atlas
  stays `2201771522` at both endpoints. See [validation data](splash-material/validation.json).
- Visually inspected peak, landing and settled frames, a 2.3× close-up, all three
  quality presets and concentration 0.2/2.5. The same material holds across thin
  sheets, thick rims, filaments, droplets and deposited water. Timeline seek/replay,
  contact residue, resource failure, resize and device-loss checks remain intact.

A single sequential before/after run uses SwiftShader offscreen WebGPU, Balanced,
1143×794 backing pixels, 64 active frames between 0.55 and 2.75 seconds. The first
six frames are excluded from CPU/completion statistics. An explicit benchmark-only
queue completion fence separates completed-frame latency from CPU encoding.

| Metric, milliseconds | Before | Unified |
| --- | ---: | ---: |
| CPU encode median / p95, 58 frames | 0.20 / 0.40 | 0.20 / 0.30 |
| Completed-frame median / p95, 58 frames | 630.2 / 700.2 | 659.8 / 734.1 |
| Scene GPU mean, 2 timestamp samples | 214.1 | 215.8 |
| Airborne GPU mean, 2 timestamp samples | 217.8 | 247.8 |
| Deposition GPU mean, 2 timestamp samples | 185.0 | 171.5 |

The software completed-frame median increased about **4.7%**, consistent with
richer material shading. This is not a speedup or hardware FPS result. Sparse
stage samples occur at different animation times and must not be summed or used
to infer changes in the unchanged scene/deposition algorithms. No statistical
significance or native GPU cost is established by this single run. Both runs own
17 GPU resources throughout, with **zero additional allocations** during the
64-frame sequence. Raw scopes and samples are in
[before measurements](splash-material/measurements-before-software.json) and
[after measurements](splash-material/measurements-after-software.json).

Reproduce captures with a running repository server:

```sh
CHROMIUM_EXECUTABLE=/usr/bin/chromium node scripts/capture-splash-lab.mjs \
  --times .95,1.25,1.6,5,8 --frames 64 --output /tmp/splash-material
```

To inspect in the application, use the existing feature branch and open
`experiments/splash-lab/` through the repository's development server. Replay or
scrub around 1.25 seconds, then 5–8 seconds. No simulator integration or stable
branch merge has been performed.
