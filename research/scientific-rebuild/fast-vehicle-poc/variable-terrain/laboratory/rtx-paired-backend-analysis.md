# RTX 5090: paired WebGL/WebGPU audit

User-supplied `vehicle-ab-audit_webGL.json` and `vehicle-ab-audit_webGPU.json`. Both 15-case paused audits completed with settingsChanged=false and hiddenDuringRun=false, 10 seconds per case, Chrome 156 on X11/Linux, native rendering, Cinematic, same CSS canvas 1255×784, drawing buffer 1045×653, device/renderer pixel ratio 0.833333, scale 1, same screen/window metadata. WebGL reported NVIDIA GeForce RTX 5090 Laptop GPU through ANGLE/OpenGL; WebGPU reported NVIDIA Blackwell. Reported commit and hardware/driver fields were blank, so exact served revision and driver are unverified. The capture was served from GitHub Pages; this does not prove the branch tip was deployed.

## Results

| Case | WebGL mean FPS / P95 / P99 | WebGPU mean FPS / P95 / P99 | Comment |
|---|---|---|---|
| Full baseline | 194.90 / 8.4 / 12.6 ms | 196.36 / 12.4 / 12.6 ms | Different camera positions; not a matched full-scene comparison |
| Empty pass | 197.08 / 12.4 / 12.6 ms | 200.80 / 8.4 / 12.6 ms | Same display settings; independent of vehicle pose |
| Single triangle | 195.90 / 12.4 / 12.6 ms | 200.77 / 8.4 / 12.5 ms | Same display settings; dedicated fixed camera |
| 75% render scale | 197.74 / 8.4 / 12.6 ms | 193.24 / 12.4 / 12.6 ms | Compare scales within each backend, not across differing full-scene cameras |
| 50% render scale | 194.78 / 12.4 / 12.6 ms | 198.48 / 8.4 / 12.6 ms | Same qualification |
| Submission disabled | 239.98 / 4.3 / 4.3 ms | 216.18 / 4.3 / 4.3 ms | Diagnostic only; GPU run had a 987.6 ms outlier |

In the WebGPU no-submission case the single 987.6 ms interval accounts for approximately 236 of 238 estimated 240 Hz missed refreshes. The reported mean and 1% low include it. Excluding only that interval gives approximately 239.76 FPS; that conditional number is provided to explain the distribution, not as a replacement benchmark or claimed improvement. The cause of that outlier is unknown. Both cases still have P99 4.3 ms, indicating the ordinary intervals were near one 240 Hz refresh.

Full-scene cameras were materially different: WebGL [17.35, -22.94, 9.33] versus WebGPU [5.90, -7.80, 3.70], same target. The comparison tool correctly flags vehicle/camera pose for full-scene and scale cases. Empty and triangle cases pass its settings comparison, with commit identity unverified. Both audits record zero active particles and zero marks throughout; they do not measure active smoke or skid-mark load.

WebGPU baseline CPU render submission mean/P99 was 0.359/0.7 ms; empty was 0.095/0.2 ms and triangle 0.108/0.3 ms. WebGL baseline was 0.199/0.4 ms; empty 0.019/0.1 ms and triangle 0.028/0.1 ms. These are CPU wall times, not GPU execution or presentation latency. GPU timestamp medians were 0.1311 ms for the WebGPU baseline and 0.0655 ms for empty/triangle; these are asynchronous render-pass batches, not complete frame or presentation measurements. WebGL's timer reports elapsed render queries and is not an equivalent WebGPU batch metric.

## Interpretation and limits

Both backends remain around 195–201 FPS with empty or trivial scene submissions, while ordinary no-submission intervals are near 240 Hz. Lowering resolution within each full-scene run does not produce a stable gain. This is evidence favoring a fixed per-frame submission/presentation-chain cost over scene complexity or pixel fill as the dominant factor in this paused, inactive-smoke workload. It does not distinguish browser/compositor scheduling, driver queueing, swapchain presentation, VSync, GPU synchronization or other GPU work. A single fixed-order run cannot quantify small differences or establish causation. No rendering-disabled case is an FPS optimization.

Timestamp-on baseline versus timestamp-off baseline differs by about 5 FPS on both backends, but order, noise and a single repetition prevent attributing that difference to measurement overhead. P95/P99 remain similar. GPU timestamp values cannot rule out work outside the measured pass or compositor delays. Browser zoom and display scaling were not varied; viewport scale was 1 and DPR 0.833333 in both. No Chrome/GPU trace was supplied.

## Next targeted measurement

On the same checkout and monitor, enter the full commit hash and GPU/driver in Frame Diagnostics. Repeat the empty and triangle cases at 100%, 75% and 50% scale in interleaved order, with timestamps separately on and off, in both backends. Record several repetitions. Capture Chrome Performance and, where available, Chromium/Perfetto GPU/viz/compositor traces for the same empty-pass and no-submission conditions; compare rAF scheduling, queue submissions, GPU work and presentation events. Record Chrome version, driver, GPU routing and X11/Wayland; compare browser zoom/display scaling only as a separately labeled experiment with buffer dimensions recorded. Do not change system settings automatically. The test is intended to distinguish which part of the fixed chain is responsible before choosing an optimization.

No physics, audio or graphics code was changed and no optimization is claimed from this analysis.
