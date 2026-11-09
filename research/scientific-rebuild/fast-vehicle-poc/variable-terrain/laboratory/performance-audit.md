# PERFORMANCE_2 CPU/GPU audit: measurement milestone

Base 544d3f1. No physics, parameters, assets, audio or rendering quality changes. No optimization/speedup is claimed or retained: evidence from this cloud cannot identify the cause of the reported 110–170 FPS on an RTX 5090. The local target GPU/display are unavailable, and this environment's native WebGPU presentation is already independently failing. A reliable target-hardware ranking remains pending.

## Implemented measurement corrections

The former GPU timer was WebGL-only. WebGPURenderer now enables timestamp-query infrastructure when supported and asynchronously resolves render-pass batches during explicit measurements. The animation loop does not await GPU completion. Only one resolution is in flight; epochs discard stale results and initial accumulated queries are flushed. Results identify batch scope: these durations exclude presentation and are not correlated one-to-one with frame intervals. GPU timing itself can perturb workload, so compare timing on/off. WebGL disjoint-query behavior remains.

CPU capture separates physics, accepted-contact recording, conversion, smoke, scene transforms, tracks, CPU render submission (legacy field `webgl`), spatial-audio update, dashboard and full callback. These are wall-clock sections, not sampled CPU instruction time. Unattributed callback work includes inputs/clock and instrumentation. Reports add 1% low FPS (1000 divided by mean slowest ceil(1% of intervals)) and Chromium's heap estimate when available. Heap size is not allocation rate/GC time, and neither resource counts nor heap are VRAM bytes. Browser traces remain necessary for GC, pipeline stalls and detailed render-pass attribution.

## Executed cloud measurements

Linux x64, Node v24.19.0, AMD EPYC 9V74, Chromium/ANGLE Vulkan SwiftShader. Paused reference vehicle, Baseline graphics, fixed state/camera, 500 ms between cases, four 10-second measurements. All cases reported settingsChanged=false and hiddenDuringRun=false; state equality was asserted. Single ordered run, not randomized repetitions; differences can include warm-cache/order/noise effects. This is not a driving or RTX benchmark.

| Measurement | Mean FPS | 1% low FPS | Median ms | P95 ms | P99 ms | Mean CPU callback ms |
|---|---:|---:|---:|---:|---:|---:|
| Full | 39.50 | 14.99 | 16.70 | 33.40 | 50.00 | 2.081 |
| Dashboard disabled | 42.03 | 13.05 | 16.70 | 33.40 | 50.10 | 1.407 |
| Scene updates disabled | 39.64 | 15.99 | 16.70 | 49.90 | 50.10 | 1.668 |
| Render submission disabled | 60.00 | 59.52 | 16.70 | 16.70 | 16.80 | 0.435 |

Ranked observations for this workload only:

1. Render/presentation path has the largest demonstrated pacing effect. Submission-off restores the cloud's approximately 60 Hz cadence. This does not separate GPU execution, driver synchronization and compositor scheduling.
2. CPU render submission is the largest timed CPU component: mean 1.347 ms in full mode. This is CPU-side elapsed time, potentially including driver waiting, not GPU shader cost.
3. Dashboard mean 0.192 ms; disabling it reduced callback cost but did not improve P95/P99 or 1% lows in this single run. There is no justified feature-removal optimization.
4. Scene transforms mean 0.134 ms and conversion 0.097 ms. Skipping scene updates barely changed mean FPS, so a scene rewrite is not supported by these data.

Physics is paused, audio disabled, and smoke inactive here; their cost under driving/sliding is NOT ranked. Allocation/GC, terrain-recentering spikes, HDR/shadow cost and RTX GPU passes remain NOT MEASURED. WebGL GPU elapsed-query support was unavailable in this run. Raw summaries are `results/performance-audit-cloud.json`.

A separate actual offscreen WebGPU fixture supports timestamp-query and returned 430.24643 ms for its render-pass batch on the software backend. `results/gpu-timestamp-webgpu.json` records this. It verifies timestamp API execution; it is not a vehicle frame duration, RTX estimate or speedup denominator.

## Reproduction and RTX collection

From repository root:

```
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/performance-audit-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/gpu-timestamp-browser.mjs webgpu
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/analyze-performance.mjs research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/results/performance-audit-cloud.json
```

33 Node tests and the responsive WebGL browser check passed. The A/B browser test passed all four state-preservation checks. The WebGPU offscreen timestamp fixture passed actual pixel readback with timestampSupported=true. No target hardware test was executed.

On the RTX, serve the repository (`python3 -m http.server 8000`) and open the laboratory with native WebGPU. Record browser version, chrome://gpu or Firefox GPU report, OS, driver, display refresh, power mode and adapter routing. Use explicit render resolution (not Auto), identical viewport/DPR, vehicle, terrain, graphics, exposure, camera and audio for WebGL/WebGPU. Warm up until GLB/EXR ready and shader compilation settles. Keep the tab foreground; reject settings-changed/hidden captures.

Open frame diagnostics, measure Full first, download JSON. Repeat each condition three times in interleaved baseline/test order. With a paused identical pose, independently test dashboard off, scene updates off, submission off, smoke off, marks off and the incremental terrain/vehicle/lighting/tracks/other controls. Restore baseline before each change. Diagnostic toggles are measurement-only. Separately compare shadows/HDR with explicit settings and record differences; do not describe those captures as identical quality. For dynamic workload use repeatable inputs/reset and physical-time windows; paused comparisons cannot quantify physics/terrain/contact cost. Capture steady driving, hard braking, lateral sliding, smoke and recentering. Keep audio enabled/disabled consistent.

Collect with GPU timing off and on to quantify probe overhead. Download full JSON (not just the panel summary); analyzer ranks CPU stages and retains slowest raw frames. Record a browser Performance trace with memory/GC and GPU tracks for the worst case. Investigate whether long intervals occur with short CPU callbacks and low GPU batch duration (presentation/routing hypothesis), or whether CPU/GPU spikes correlate with dashboard, physics-step count, terrain updates, shadow passes or smoke overdraw. Do not infer a cause solely from FPS.

## Decision

No rendering optimization accepted yet. Current evidence favors completing target-hardware attribution over changing shaders, shadows, physics or quality. The next useful input is a matched RTX baseline plus render-submission-off and GPU-timestamp captures. Stable 240 FPS has not been demonstrated.

## Automated local A/B runner

The frame-diagnostics panel now has **Run paused A/B audit (~3 minutes)**, Cancel and **Download A/B audit JSON**. Load the desired vehicle/terrain/quality, let GLB/EXR loading and shader warmup finish, and optionally pause during an existing smoke plume. Start the runner and keep the camera/tab unchanged. It freezes physics, disables editing controls and captures fifteen conditions (one-second warmup, ten-second recording each): all components, no dashboard, no scene updates, no render submission, no smoke submission, no terrain, no vehicle, no direct lights, no tracks, no grid/roadside/force vectors/smoke, empty render pass, minimal triangle, 75% and 50% resolution, and baseline without GPU timestamps. The other conditions request GPU timestamps when supported. The baseline uses incremental mode with every component enabled. Empty and triangle use the same renderer, canvas and physical state. Resolution cases intentionally vary the drawing-buffer scale while retaining CSS viewport and camera. It restores diagnostic settings, disabled states and the prior pause state on completion or cancellation. Except for the explicitly labeled resolution cases, conditions retain the same resolution and all retain the underlying physical state; lighting/geometry omissions are explicitly diagnostic only. Camera integrity tolerance is 1e-8 m to allow orbit-control roundoff. State equality is exact.

The smoke checkbox changes submission visibility and leaves particle state intact, unlike the production smoke disable control which clears it. This test includes the visible smoke/shadow work, but does not remove all CPU particle updates. The direct-light toggle is not a complete HDR/lighting-off test; smoke lighting can still use the hidden lights’ intensity values. The no-grid/roadside/force-vector case also hides smoke in incremental mode, so it is not an isolated grid-only measurement. The empty scene/no-submission cases do not isolate GPU arithmetic from presentation. No condition changes physics parameters or graphics quality. Full JSON retains per-frame rows for analysis. GPU-timestamp overhead is assessed against the first baseline, subject to order/warmup/thermal effects; repeat the suite rather than treating one pass as conclusive.

`node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/audit-runner-browser.mjs` runs short 500 ms functionality checks, asserts all fifteen cases complete, checks physical-state and settings restoration, and checks cancellation restoration. These are not performance benchmarks or RTX results. Summary: `results/audit-presentation-check.json`.
