# PERFORMANCE graphics upgrade

Renderer-only work on PERFORMANCE, continuing from `a762129`. No physics, terrain
height/friction, imported GLB geometry or source material parameters changed.
The original Baseline remains available. Earlier `graphics-stage1.md` records
intermediate work; this document describes the current authored-map additions.

## Use

Launch the existing laboratory and select **Schweinemotorwerke → Graphics: Balanced**. Try
Alpine pass, Industrial proving ground and Highland gravel stage. Terrain selection
resets the vehicle, as before. Graphics, exposure, camera and visual toggles do not.

The supplied `german_town_street_2k.exr` remains the default environment. The path
field also accepts local EXR/HDR URLs; EXR has been exercised, HDR-format support
has not. Set exposure, environmental illumination and sunlight independently.
The background checkbox switches between the photograph and the generated Z-up
sky. Environment rotation is omitted because r160 has no native scene-environment
rotation API; no custom reflection shader or newer Three version was introduced.

| Quality | Lighting/shadows | Surface and environment detail |
|---|---|---|
| Baseline | Original lighting, no environment or shadows | Original shader/filtering and bounded terrain |
| Performance | PMREM environment, 512px soft shadows | Original surface shader; minimal overhead |
| Balanced | PMREM, 1024px shadows | Surface shading, antialiased road paint, up to 8× anisotropy, outer landscape, support-gated contact shading, roadside cues |
| Cinematic | PMREM, 2048px shadows | Balanced plus up to 16× anisotropy and twice the roadside placement density |

Individual surface, contact and roadside controls are available. Anisotropy is
capped by hardware support. No preset changes the simulation clock or physics.

## Surface and roadside implementation

Asphalt uses restrained fine aggregate. Gravel has larger granular relief, dirt
has directional structure, grass has fine fibre detail, concrete has slab joints,
and rock has layered relief. Separate surface IDs and interpolated per-surface weights prevent concrete from acquiring
grass detail or rock being mistaken for gravel, including mixed boundary triangles. Procedural relief is shading-only;
it never displaces the contact surface. Fine detail fades with screen derivatives.
These are approximate procedural materials, not scanned or calibrated PBR assets.

Authored road coordinates come from the sampler's existing `road.distance` and
`road.width`, interpolated over the existing mesh. Balanced/Cinematic reconstruct
paint at world positions with derivative antialiasing, avoiding the original
256px texture's jagged line edges. Dash periods, widths and road corridors follow
`maps.js`; physical surface assignments stay unchanged. The original texture and
shader remain the Baseline comparison. Existing texture filtering gains mipmaps
and capped anisotropy only in upgraded detail presets.

Mountain roads receive pale delineator posts; the industrial yard uses yellow
posts; the gravel stage uses restrained stones. All sit beyond the existing road
shoulder and follow sampled height. Placement is deterministic and tile-cached,
with at most 96 instances per mesh and at most two visible instanced draws. They
are **visual cues with no collisions**, clearly labelled in the UI. No buildings,
barriers or hidden obstacles were introduced. The outer terrain uses the same per-map palette as the near surface. Upgraded
surfaces replace the old painted grain with derivative-filtered material detail,
avoiding stripes and a mismatched near/far color seam. Baseline keeps the original
painted texture.

## Vehicle and presentation

Existing PMREM illumination provides paint/chrome/glass reflections; the imported
material definitions and geometry remain preserved. Dynamic shadows and contact
shading follow simulation state. Existing orbit, chase, cockpit, top and contact
cameras remain. ACES and sRGB output remain the tonal pipeline. No bloom, AO,
clearcoat override or headlight material rewrite was added: those would add cost
or alter the supplied material intent without established benefit. Exposure is
available to manage bright surfaces; glass and headlamp appearance still depend
on the source asset. This does not promise Blender render parity.

## Verification and reproduction

From repository root:

```sh
python3 -m http.server 8000
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/authored-graphics-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/authored-graphics-benchmark.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/authored-driving-browser.mjs
```

The browser scripts use the installed Playwright and Chromium executable; no
runtime CDN or new application dependency is required. Open
`http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/`.

Results and limitations of this run are appended below after execution. Saved
`authored-*-baseline.png` and `authored-*-balanced.png` pairs use matching cameras
and resolution. Browser snapshots record backend, resource counts and geometry.
Environment diagnostics separately expose load/decode wall time, CPU PMREM
submission time and decoded source bytes. Submission time is not GPU execution;
source bytes are not total VRAM. Changing environment path/loading state now
invalidates an active frame measurement instead of silently mixing conditions.

## Remaining limitations

The distant terrain is coarser than contact geometry; narrow features and its
near/far seam can remain visible. Roads are sampled/interpolated, not high-resolution
road meshes. Decorative cues are non-colliding and stylistic. Fog is a simple distance
model, and the sky has no volumetric clouds or dynamic weather. The environment
photograph is infinitely distant, with no local reflection probes. No hardware
RTX 5090 measurement, 240 Hz claim, HDR-format fixture, exhaustive long-run leak
proof or real-world material calibration is supplied. Existing visual/physical
wheel-radius differences are preserved. Production and historical labs remain
untouched.

## Measured preset comparison (this run)

Chromium on ANGLE/Vulkan **SwiftShader**, not an RTX GPU. Industrial map, 1500×1100 browser viewport, 100% render scale, same paused state/camera, at least 2s warmup and 10s measured RAF per preset.

| Preset | Frames | Mean FPS | Frame median / p95 / p99 (ms) | CPU WebGL median / p95 / p99 (ms) |
|---|---:|---:|---|---|
| baseline | 63 | 6.22 | 166.6 / 183.3 / 183.4 | 0.5 / 0.8 / 1.0 |
| performance | 18 | 1.79 | 566.6 / 600.0 / 600.0 | 0.9 / 2.8 / 2.8 |
| balanced | 13 | 1.21 | 783.3 / 1433.2 / 1433.2 | 1.3 / 7.1 / 7.1 |
| cinematic | 13 | 1.27 | 783.3 / 800.0 / 800.0 | 1.1 / 1.9 / 1.9 |

GPU timer queries were unsupported: there are **no measured GPU execution times**. Main-pass draw counts were 23/24/31/31; these counters do not include every shadow pass. Upgraded windows have as few as 13 frames, giving weak tail estimates. CPU scene-preparation medians were 0.1–0.2 ms, excluding occasional terrain recentering in this paused workload. Software presentation is substantially slower with the upgrade; no hardware usability or 240 Hz claim follows.

The environment report recorded 147.4 ms load/decode wall time (this reset may benefit from the bounded decoded-source cache), 62.2 ms CPU PMREM submission and 16 MiB decoded source data. These are not cold-load guarantees, GPU timings or total memory figures. Raw records: `results/authored-graphics-performance.json`. Older flat-scene measurements are a different workload and are not used to claim a speedup.

## Executed correctness checks

Node v24.19.0 / Chromium 154.0.8037.57, Linux x64, host reports Intel Xeon
Platinum 8573C / five logical CPUs. All **18 laboratory Node tests passed**,
including existing adapter, Mustang preservation and authored-map physical tests.
The separate driving browser run passed cold start, both gear-key layouts, actual
propulsion, upshift, left/right steering and handwheel correspondence, braking,
hills, appearance/camera switching, reference selection and missing-GLB fallback.
It reported no unexpected browser errors. Its snapshots and captures are saved
under `results/authored-driving-*`; the model's authoritative physics was unchanged.

The authored-map browser suite checks real EXR loading, supported contact after
settling, matched graphics switches with exact frozen-state equality, roadside
toggling, existing cameras/diagnostic modes and resize. A final run and quality
benchmark cover the final surface weights. No dropped simulation time, extra
simulation clock or artificial vehicle animation was introduced.

## Collect RTX measurements

On the desktop browser, choose Schweinemotorwerke, the industrial map, workshop camera and
100% render scale. Settle, pause, and keep window size, camera and exposure fixed.
Open rendering diagnostics; optionally enable the asynchronous GPU timer. For
each graphics preset, allow at least five seconds to warm up, start the existing
10-second measurement and download its JSON. Repeat in Chromium and Firefox if
comparing browsers. Confirm the backend identifies the intended hardware GPU;
unsupported/disjoint GPU samples remain unmeasured. Do not compare differently
sized windows, moving and paused cases, or software results as equivalent work.
For driving cost, make a separate unpaused measurement: tile updates are excluded
from the paused comparison above. Existing minimal/empty/incremental modes remain
available to isolate submission and scene preparation.
