# Graphics upgrade: verified scope and remaining work

Tested from PERFORMANCE base `ba6e49e`, with renderer-only changes. Production physics,
terrain sampling, drivetrain equations, GLB geometry and source material parameters
remain unchanged. This is a usable lighting/surface upgrade, **not completion of the
entire cinematic environment overhaul**.

## Using the upgrade

Open `index.html` through an HTTP server and select Graphics → Balanced. Baseline
remains the default for comparison. Performance uses HDR illumination and 512px
shadows; Balanced adds procedural surface detail and contact shading with 1024px
shadows; Cinematic raises shadows to 2048px. These names describe budgets, not a
hardware performance guarantee. Exposure, environment intensity, sunlight, background,
surface detail and contact shading are adjustable without resetting physics.

The supplied `german_town_street_2k.exr` is decoded locally and processed with PMREM.
A replacement `.exr` or `.hdr` path can be loaded; failure retains the previous map.
EXR was exercised; HDR format support is wired but unverified. Matching Three r160
loaders and fflate retain their license notices. Decoded sources have a bounded
two-entry cache; GPU PMREM/shadow resources are explicitly disposed on replacement.
Full renderer resets still require GPU environment processing.

Terrain detail follows sampled surface classification and world coordinates, adding
aggregate, grass texture and concrete joints where those classes occur. It changes
shading, not terrain geometry or contact. Balanced/Cinematic include restrained,
support-gated contact shading aligned to actual contact normals. Baseline and
Performance bypass the procedural shader additions. Vehicle animation still reads
only the authoritative simulation state.

## Executed verification

From repository root:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/{adapter,custom-mustang,graphics}.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/graphics-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/graphics-comparison.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/graphics-benchmark.mjs
```

Node: **11 passed, 0 failed**. Chromium browser checks passed: real EXR loading,
Mustang driving/steering, terrain change, view/resource checks, four quality presets,
paused-state invariance, detail/contact toggles and missing-environment recovery.
The browser scripts require Playwright and `/usr/bin/chromium`; no new runtime
application dependency was introduced. These are focused renderer/adapter checks,
not a rerun of every historical physics experiment.

Matched captures: `results/graphics-baseline.png` and `graphics-balanced.png`.
Driving evidence: `results/graphics-stage1-browser.json` and accompanying images.
Raw measurements: `results/graphics-performance.json`.

## Measured rendering cost

Chromium, ANGLE Vulkan **SwiftShader software renderer**, identical 1500×1100 browser
viewport, camera and 100% render scale; paused physics; at least 2s warmup and 10s
measurement per preset. This isolates presentation, not complete driving throughput.

| Preset | Frames | Mean FPS | Frame median / p95 / p99 (ms) | CPU submission median / p95 / p99 (ms) |
|---|---:|---:|---|---|
| Baseline | 74 | 7.35 | 133.3 / 166.7 / 166.8 | 0.4 / 0.9 / 2.8 |
| Performance | 21 | 2.04 | 483.4 / 516.6 / 533.3 | 0.6 / 1.9 / 3.3 |
| Balanced | 19 | 1.81 | 549.9 / 633.3 / 633.3 | 0.8 / 2.6 / 2.6 |
| Cinematic | 18 | 1.79 | 550.0 / 683.4 / 683.4 | 0.8 / 1.0 / 1.0 |

CPU submission is not GPU execution. Valid GPU timer samples were unavailable.
Short software-rendered windows give weak tail estimates. Upgraded rendering is
substantially more costly here; no RTX 5090 or 240 Hz performance claim is justified.
Use the laboratory's existing diagnostics on the user's hardware before selecting
a permanent quality default.

## Remaining limitations

No scanned PBR assets, extended scenery, distant landscape, new sky model, environment
rotation or postprocessing were added. The finite terrain patch/horizon remains.
Surface detail is procedural and approximate; contact shading is an illustrative
visual approximation. Native wheel/physical radius differences remain unchanged.
Complete authored-map/camera coverage, HDR-format fixtures, initialization-stutter
measurements, long-run memory tests and hardware-GPU profiling remain outstanding.
The wider cinematic art-direction mission is therefore partial. No physical equations
were altered to improve appearance.

Launch from repository root with `python -m http.server 8000`, then open
`http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/`.
