# Shared-density tire smoke (v36)

Experimental branch: `verlet_gpt_v36_smoke_volume`, based on v35 `a388730`. The v35 branch and its original smoke shader are preserved. No vehicle physics, input, emission, particle integration, lifetime, curl noise or vehicle-airflow algorithms changed.

## Why the old smoke looked like separate puffs

`smoke.wgsl` independently evaluates procedural density and local offset-density shading for every billboard. Premultiplied over blending correctly increases coverage, but cannot make separately lit puffs share a light-extinction field. Billboard-local lighting also rotates with the puff rather than following the environmental sun.

Three explicitly selectable techniques now permit direct comparison:

0. **Original billboards:** the unchanged v35 shader and blend pipeline.
1. **Local lighting:** one density evaluation per fragment, derivative-based pseudo-normal, environmental illumination and approximate per-puff extinction. Cheapest alternative for sparse smoke in this software benchmark; independent lighting remains visible in overlap.
2. **Shared volume (default):** sum optical depth first, shade the resulting plume once. This gives the strongest coherence in dense overlap without a 3D volume or ray march.

## CPU / GPU responsibilities

The CPU retains the existing simulation and uploads. New CPU work is one 64-byte light/material/viewport uniform and one 16-byte bounds clear per shared frame. There is no new per-particle CPU processing, sorting or production particle readback.

The GPU retains existing airflow and smoke integration. A separate bounds reduction reads live particle positions/radii without writing them, using atomic min/max. It costs `ceil(smokeSlots/256)` workgroups. This is rendering work, including paused frames where camera/light may change; it does not advance smoke.

A half-width, half-height RGBA16Float target accumulates additive extinction, extinction-weighted radius, and extinction-weighted neutral luminance. The old procedural shape and lifetime envelope are retained. A final premultiplied pass samples that field inside the GPU-derived smoke rectangle:

- Beer–Lambert transmission `exp(-sum(tau))` makes overlap optically thicker.
- Four adjacent columns provide a logarithmically compressed height-gradient pseudo-normal. Compression retains detail in dense regions without making saturated opacity the normal map.
- Three projected incoming-light column samples approximate internal occlusion. An excess-upstream-depth estimate prevents treating the entire visible column as a fully buried sample, which made the first prototype uniformly dull.
- Bounded anisotropic single-scattering, directional light and ambient sky follow existing scene light direction, elevation, intensity, temperature and ambient controls.
- Optical depth controls opacity independently of scattering and internal shadow strength. No emissive rim, bloom, colored dye or artificial glowing outline is added.

This is a **2.5D column approximation**, not a physically exact volume. It does not recover true depth, exact multiple scattering, terrain occlusion or self-shadowing behind 3D obstacles. Incoming-light samples are limited to visible screen-space columns; lighting at the viewport boundary is approximate. Dense synthetic overlap remains softer than sparse detail. Fixed top-down viewing direction is approximated consistently; smoke does not become a 3D reconstruction.

## Cost and lifecycle

Shared shading uses one half-resolution density draw and one bounded composite draw, plus the bounds dispatch. The composite has eight filtered field samples per covered fragment. Density evaluation occurs once per puff fragment, instead of independently lighting each puff. Unlike a fullscreen composite, the extra lighting work is bounded to the visible plume rectangle; clearing the half-resolution target still touches that target.

Target memory is `ceil(width/2)*ceil(height/2)*8` bytes, plus 80 bytes for uniforms/bounds (about 4 MiB at 1920×1080). There are no per-frame texture/buffer allocations. Targets are reused, replaced on size changes and destroyed with renderer resources/device loss. Modes 0/1 retain an already allocated shared target for inexpensive comparison switching; it is released when the renderer is destroyed. Initialization failure retains the original GPU smoke path; the existing Canvas fallback remains intact.

`gpuProfile=1` exposes asynchronous density/bounds timestamps when supported, sampled every ten frames. Those values exclude composite shading. Use the dedicated benchmark for separate bounds/density/shading timestamps. CPU encode time is never presented as GPU execution time.

## Controls

Rendering → Smoke material:

- Smoke shading: original / local / shared.
- Smoke optical density: default 1.
- Light scattering: default 1.
- Internal shadowing: default 0.8.

These persist and participate in settings export/import/reset. Existing smoke and airflow settings remain unchanged. Use the existing environment light controls/presets for side light, backlight, daylight and overcast.

## Evidence and reproduction

Open [comparison viewer](smoke-volume/index.html) through the development server. It contains same-frame drift/stop clips and matched sparse/dense/overlap captures. Lighting captures cover daylight, overcast, side light and backlight; the viewer shows daylight/backlight. All 36 captures have GPU validation records in `static-validation.json`.

```sh
python3 serve.py
# In another terminal, with project test dependencies installed:
node scripts/compare-smoke-materials.mjs --output /tmp/smoke-materials
node scripts/capture-smoke-materials.mjs --scenario drift --output /tmp/smoke-motion
node scripts/capture-smoke-materials.mjs --scenario stop --output /tmp/smoke-motion
node scripts/benchmark-smoke-materials.mjs --samples 12 --output /tmp/smoke-cost.json
```

Scripts default to Chromium/SwiftShader for cloud reproducibility. To measure actual hardware, use `--native` and optionally `CHROMIUM_EXECUTABLE=/path/to/chromium`. Check recorded adapter identity. A native request alone does not prove hardware acceleration. Production has no synchronous timing readbacks; the isolated benchmark deliberately waits and reads timestamps outside the application loop.

The moving comparisons advance the original emitter/airflow once, then shade both modes at the identical timestamp (zero further simulation delta). They show real emission with ordinary gameplay zoom, not enlarged hand-drawn clouds. Static high-overlap fixtures are separately labeled. The clips are low-rate captures of continuous simulation; they do not establish high-refresh frame pacing.

## Measured comparison

Cloud adapter: Google SwiftShader (fallback/software), 640×480, 512 slots; sparse has 24 live, dense/overlap have 512 live. Four warmups and twelve recorded samples per condition, alternating technique order. Frozen particles, fixed time, no competing capture/test workload. Values below are median **GPU pass timestamps in milliseconds on software**, not native RTX or Mac performance. CPU command submission and observed queue completion are recorded separately in [raw results](smoke-volume/benchmark.json). The isolated pass sum excludes simulation, uploads, final presentation and UI.

| Scene | Pixels/metre | Original | Local | Shared half | Shared full |
|---|---:|---:|---:|---:|---:|
| sparse | 20 | 8.83 | 7.83 | 10.60 | 18.09 |
| sparse | 80 | 43.04 | 21.57 | 35.64 | 46.32 |
| dense | 20 | 178.44 | 133.18 | 59.67 | 126.41 |
| dense | 80 | 1323.97 | 801.29 | 214.20 | 781.10 |
| overlap | 20 | 107.22 | 74.84 | 20.41 | 71.57 |
| overlap | 80 | 1994.08 | 1225.35 | 321.07 | 1149.96 |

The dense cases support reducing repeated procedural fragment work and shading combined density. Sparse cases expose the extra pass/target cost; local lighting can be preferable there. Half resolution is the experimental default for dense-plume quality/cost, not a claim of universal speedup. Native RTX 5090 and Apple GPU execution time, full-game frame pacing, high-refresh behavior and compositor bandwidth remain unmeasured in this environment. Run the native benchmark on the target machine before drawing hardware conclusions.

For deliberately dense moving comparisons, append `--dense` to the motion-capture script. This selects existing emission/lifetime settings (200, 3 s) only in the test harness; production defaults are preserved. At sparse production settings, separate emission gaps remain: the renderer does not fabricate smoke between disconnected particles or change spawn rates to conceal them.
