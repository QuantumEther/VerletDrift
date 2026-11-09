# RTX 5090 WebGPU presentation investigation

## Supplied capture

`vehicle-ab-audit.json`: complete 10-case paused audit, foreground, no reported setting changes, Linux/X11 Chrome 156, native WebGPU, flat terrain, Cinematic, normal camera, 1252×783 drawing buffer and CSS canvas, render scale 1. Browser-reported devicePixelRatio was 0.4166667; this does not by itself establish the browser zoom or OS display scale. The recorded commit and hardware/driver fields are null. In addition, the recorded smoke settings omit the current source's `submitted` field, so the exact served code/version is unverified. The user identifies the GPU as an RTX 5090.

| Case | Mean FPS | 1% low | P95 / P99 interval | Estimated missed refreshes |
|---|---:|---:|---:|---:|
| Baseline | 206.67 | 68.72 | 8.4 / 12.6 ms | 333 / 13.88% |
| No scene updates | 207.30 | 67.87 | 8.4 / 12.5 ms | 327 / 13.62% |
| No render submission | 239.98 | 232.56 | 4.2 / 4.3 ms | 0 / 0% |
| No terrain | 209.78 | 66.14 | 8.4 / 12.5 ms | 302 / 12.58% |
| No vehicle | 208.48 | 66.96 | 8.4 / 12.5 ms | 315 / 13.12% |
| No smoke submission | 207.08 | 73.66 | 8.4 / 12.6 ms | 329 / 13.71% |
| No direct lighting | 202.69 | 58.56 | 8.4 / 12.6 ms | 373 / 15.54% |
| No tracks | 207.88 | 55.42 | 8.4 / 16.6 ms | 321 / 13.38% |

Baseline callback P99 was 1.6 ms, maximum 3.9 ms. All callbacks in the nine timestamp-disabled cases were below 4.17 ms; the timestamp-enabled baseline had one 4.4 ms callback. Timestamp-enabled GPU render-pass batch median was 0.1966 ms, P99 0.7209 ms, 1212 batches. These are neither complete GPU frame times nor presentation latency and are not frame-aligned. The estimated misses assume 240 Hz, not a direct compositor-present counter.

This demonstrates an association with submitting the rendering path, not the exact failing stage. No individual component toggle restored 240 Hz in this single fixed-order run. Active particle and mark counts were not recorded in that capture, so the no-smoke/no-tracks cases do not prove the cost of a populated plume or marks. Lighting-off retains HDR; smoke lighting also reads the sun/ambient intensity even when those scene lights are hidden. One run does not distinguish small effects from warmup/order/noise. It does not prove the GPU is idle, or distinguish command queueing, other GPU passes, compositor, swapchain, driver synchronization and scheduling. No optimization or speedup has been claimed.

## New controlled modes

The original raw WebGL-clear diagnostic remains available on WebGL only. The Frame Diagnostics selector now offers an empty render pass and a single triangle for **both** WebGL and WebGPU, using the same renderer, canvas, quality, dimensions and clock. Full laboratory remains the reference. The paused A/B runner captures 15 cases: original component toggles, empty pass, triangle, 75% and 50% scales, and a timestamp-off baseline. It requests GPU timestamps in other cases when supported, restores the original scale/settings and checks state/camera. Diagnostic omissions and reduced scales are measurement only, not an optimization. `effects` now records live particle/mark counts; `visualState` records vehicle, wheels, camera position and target at capture boundaries. Viewport/screen, visualViewport scale and renderer pixel ratio are recorded. Capture commit is user-supplied and not automatically verified.

The user can repeat the audit in WebGPU and WebGL on the same hardware/browser with the same explicit scale, canvas/DPR, model, terrain, quality, camera and initial pose. Enter the same verified checkout commit and GPU/driver, allow assets and shader warmup, keep the tab foreground, and download both JSON files. Reproduce a populated smoke/mark scenario separately if those costs matter. Run multiple interleaved repetitions and compare timing-enabled/off baselines; changing backend reloads the experiment, so verify recorded pose and effect activity rather than assuming they match.

```
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/compare-presentation.mjs webgpu-audit.json webgl-audit.json
```

The tool rejects changed/hidden captures and mismatched display/scene settings, reported commits, pose or recorded particle/mark counts. Missing provenance/pose/counts is labeled unverified. Matching counts do not prove identical particle positions or mark geometry. Empty/minimal comparisons omit scene-pose checks because they do not draw those objects. GPU batch times remain separate from frame intervals and CPU submission.

## Trace and scaling procedure on the RTX

1. Record Chrome version, driver, session type (X11/Wayland), GPU routing and the information at `chrome://gpu`. Record monitor refresh and compositor/display scaling in the OS; do not change driver or system settings automatically.
2. Run the full/empty/triangle cases first at 100% rendering scale, then the 75% and 50% cases with the same CSS viewport and camera. Compare GPU batch, CPU submission, median/P95/P99 and 1% lows. A scale-dependent result suggests pixel/overdraw or bandwidth work; an unchanged result leaves fixed submission/presentation overhead as a hypothesis, not proof.
3. Test normal browser zoom versus 100% zoom in a separate labeled experiment. Adjust the window as needed and record devicePixelRatio, renderer pixel ratio, CSS size, drawing buffer, viewport scale and screen size. Do not interpret lower FPS or resolution alone as a zoom/driver cause.
4. Record Chrome DevTools Performance traces for repeatable full, empty and triangle runs. Inspect Main, Frames and available GPU/compositor tracks for submission, queue waits, scheduling and presentation. Capture tracing-on/off runs because tracing itself can disturb pacing. If compositor/GPU details are absent, use an available Chromium/Perfetto trace with GPU, viz and compositor categories; do not infer missing timing. Inspect traces for private information before sharing.
5. Only after a repeated, matched experiment identifies a specific operation should an optimization be retained and measured before/after. Disabled rendering is never a claimed FPS improvement.

## Validation limits

`node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs` passed 35 tests. The paused runner passed fifteen short functionality cases, exact physical-state preservation, settings/scale restoration and cancellation during a resolution case. `presentation-mode-browser.mjs --webgl` and without that flag compiled/drew all three scenes and verified distinct GPU readback pixel sums at matching 526×329 targets. These cloud tests use software/offscreen rendering and do not measure native RTX presentation, 240 Hz, driver behavior or visual parity. See `results/presentation-mode-{webgl,webgpu}.json` and `results/mode-*` captures. The new measurements on the actual RTX and browser traces remain required to identify the stage responsible.
