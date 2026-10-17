# Renderer performance investigation

Baseline: `f1f0b59` (`verlet_gpt_v21_gpu_rendering`), preserved in a detached
worktree for comparisons. This investigation preserves vehicle physics,
integration/timesteps, handling, emission rules, artwork and default UI.

## Hardware and evidence boundary

The user's working configuration is PRIME-offloaded Brave on X11/XWayland with
Vulkan enabled and the high-performance WebGPU preference. The diagnostic
identified **NVIDIA / Blackwell**, with all high-performance clear tests passing.
The user reports smoother full-simulator driving with the new smoke/materials.
The prior mixed-adapter presentation failure is not a shader workload limit.

The reported GPU is an **RTX 5090 Laptop GPU**, 24 GiB, 150 W as reported by
nvidia-smi. Desktop 5090 results and power budgets are not appropriate targets.
This workspace has software WebGPU only. Its GPU timings are genuine timestamp
measurements of software execution, **not measurements of the user's 5090**.
No native FPS or GPU speedup percentage is claimed here.

## Ranked findings

| Priority | Cost / evidence | Action |
| --- | --- | --- |
| 1 | Ground material covers every pixel; authored blur evaluates it up to 32 times. Cost scales with backing resolution and samples. Software isolated tests show it is expensive. | Keep existing shader. Test native render-pass time, resolution and blur settings before changing it. The attempted uniform-table rewrite was rejected. |
| 2 | Smoke performs two domain-warped density evaluations per covered pixel; large overlapping puffs multiply fill/ALU/blending cost. | Move affine rotation and seed trig to vertices; skip fully filtered noise octaves using their exact mean. Preserve density, animation, particle counts and shading. |
| 3 | Every physics update formerly resent all skid opacity **and draw order**, even for static sources. Each retained event was looked up in a WeakMap twice. | Cache first-pass event slots, update only dirty opacity spans, and resend order only when it changes. Preserve source ordering, fades and slot recycling. |
| 4 | Offscreen arrows, paint, splats and balloons were packed, uploaded and submitted. | Conservative CPU viewport rejection before packing, including balloon strings/shadow offsets, arrow heads and edge guard. Preserve existing budgets and order. No gameplay objects removed. |
| 5 | Smoke spawn/spark packing allocated temporary JS arrays. | Write directly into reusable typed staging buffers. Keep exact field order and values. |
| 6 | CPU encode time and GPU execution time were easy to confuse; compute was excluded from optional render timestamps. | Add separate sparse compute timestamps and an opt-in live 30-second capture of CPU work, GPU stages, frame pacing, uploads, counts and dropped substeps. |
| 7 | Canvas vehicle/ghosts, DOM telemetry, CPU physics and effect bookkeeping remain on the main thread. | Measure actual CPU frame/render/simulation-loop distributions before moving work. No solver or interpolation changes in this investigation. |

## Implemented optimizations and practical bounds

### Resident skid data

For an unchanged 4,000-event source, the previous recurring payload was 32,000
bytes of opacity/order plus ordinary world data. The updated source generates
zero skid writes. In a controlled complete scene, final-frame world uploads fell
from 32,388 to 388 bytes. **This static case is a best case**, not a claim that
normal driving has no uploads: fading events still upload their actual opacity.

An alternating 20,000-event CPU bookkeeping benchmark with mocked GPU writes
measured mean update time about **0.85 → 0.59 ms** for static events and
**1.01 → 0.90 ms** with every event fading. Static payload fell 160,000 → 0 bytes;
fully fading payload fell 160,000 → 80,000 bytes because order stayed resident.
These are this host's JavaScript cache costs, excluding real driver/transfer
costs, not a native full-frame speedup. Real writeBuffer calls and full-app native
CPU timings are recorded separately by the live recorder.

The cache still scans source events to observe authoritative fading/removal.
Avoiding that scan would require explicit event revisions or a different source
contract. This was not introduced silently.

### Smoke

Rotation is affine, so rotated UVs can be calculated at each vertex and
interpolated. Particle-constant seed sine/cosine moves to the vertex stage as
well. Filtered-out FBM octaves contribute their original exact .5 mean without
hashing. No octave or particle-density reduction is applied to visible detail.

Alternating software-GPU shader A/B samples were noisy and did not establish a
reliable GPU-time improvement. The changes remove repeated arithmetic and
preserve pixels, but their native benefit remains to be measured. No claim of
volumetric self-shadowing or scene-depth soft intersections is added.

### Culling and allocations

Bounds use logical world coordinates, camera/shake, zoom, geometry extents and
an edge margin; GPU backing resolution does not change culling scale. A circle
conservatively contains rotated arrow heads. Balloon bounds contain both string
and displaced shadow. Original source limits and ordering remain intact.

CPU particle emission/integration continues for offscreen effects. Smoke compute
also continues, so pool lifetime/recycling is not coupled to the view. The smoke
particle pool and seeded RNG calls are unchanged.

## Rejected terrain experiment

A candidate precomputed blur offsets/weights once per frame instead of evaluating
sample trig/powers per fragment. It required a uniform array and dynamic reads.
Pixel comparisons matched within one 8-bit level, but alternating before/after
passes on the same software device did not demonstrate a benefit and generally
regressed. A no-blur fast path did not establish a consistent win either.

**Both the uniform-table path and fast path were removed.** The production ground
shader is byte-identical to baseline. The rejected measurements are retained and
labelled; full-scene runs containing that candidate must not be presented as final
performance results. Sparse timestamps and software scheduling limit inference.
A native-specific experiment could be revisited with the user's capture data.

## Live 5090 capture

Open the simulator in the proven NVIDIA/PRIME/X11 browser instance with:

```
?gpuPower=high-performance&gpuProfile=1&quality=balanced
```

The optional corner panel displays CPU frame work and GPU render/compute time.
Warm up the scene for several seconds, then click **Record 30s performance**.
A JSON report downloads automatically. No console snippet or Node installation is
needed. Remove `gpuProfile=1` to remove the panel and profiling resources.

Capture separately under comparable window size/DPR/settings:

1. Stationary, little accumulated paint/smoke.
2. Sustained drifting with smoke and accumulated marks.
3. Heavy paint/particles and camera zoom changes.

Reports include initial/final renderer/adapter, actual backing dimensions,
quality, per-frame CPU execution, uploaded bytes/draw calls, smoke slots and
culling counts; GPU render and compute execution samples are de-duplicated.
Frame-time distributions include median/p95/p99 and standard deviation. The
reported 1% low is based on rAF **cadence**, not independently measured displayed
FPS. Hidden tabs and backend switches terminate the capture rather than silently
mixing different conditions. Samples are bounded to 15,000 frames.

CPU simulation-loop time includes snapshots/bookkeeping around physics. CPU
render time includes Canvas/DOM/GPU command encoding. CPU GPU-encode time is a
subset of render time; **do not add those categories**. GPU render and compute
are actual, separate timestamp-query intervals. They exclude Canvas, browser
compositing/presentation, driver gaps and whole-frame end-to-end latency. No
synchronous GPU completion wait or readback is added to live frame submission.
If timestamp-query is unavailable, GPU metrics remain unavailable rather than
being inferred from JavaScript time. The profiler itself adds some overhead.

## Interpreting the results and tuning

Frame budgets are 16.67 ms at 60 Hz, 8.33 ms at 120 Hz, and 4.17 ms at 240 Hz.
Leave headroom for browser presentation and spikes. CPU and GPU can overlap;
do not simply add every CPU/GPU number and label it end-to-end frame time.

- If GPU render time dominates, compare the same scene at balanced/high and
  different GPU backing scales. Pixel cost grows with the **square** of linear
  resolution. Ultra's 1.25 multiplier adds approximately 56% pixels before caps.
- If render time rises sharply only with smoke, investigate a separate reduced-
  resolution smoke target/upsampling or a density atlas. Those trade quality,
  extra passes and memory for less overdraw and need native A/B evaluation.
- If empty scenes are expensive, isolate procedural ground and authored blur
  sample count. A world-stable tile/material cache may help, but needs filtering,
  zoom and memory validation before replacing analytic shading.
- If CPU render time dominates while GPU time is short, investigate Canvas
  ghosts/HUD, per-frame object packing and DOM work before adding GPU algorithms.
- If CPU simulation time dominates, renderer tweaks cannot solve it. Preserve
  solver/timestep/handling and investigate separately under an authorized scope.
- If frame pacing is poor despite short execution times, inspect browser refresh
  settings, scheduling/compositing, power/thermal behavior and shader warmup.
  Fan speed or 100% utilization is not an efficiency or latency metric.

Keep the proven NVIDIA path and use AC power/appropriate system power mode when
comparing sustained laptop results. A refresh-limited app may legitimately leave
GPU headroom. Forcing maximum utilization, disabling browser safeguards or
changing physics frequency is not a rendering optimization.

## Deferred architectural work

GPU draw-indirect compaction/spatial bins, a fully GPU-resident paint cache,
GPU spark integration and moving the Canvas vehicle into the GPU scene may be
worthwhile at larger scales. They are not implemented here. Current small spark
pools and ~8,000 smoke slots do not by themselves justify a parallel rewrite.
Smoke flag recycling still uses one bounded asynchronous readback, and the
existing shared RNG/pool replay coupling remains a documented limitation.


## Regression and reproduction

Final automated checks: **155 unit tests passed; 43 ordinary browser tests passed
with seven adapter skips; 13 isolated GPU/diagnostic tests passed**, exercising
all skipped GPU cases. Numerical tolerances are unchanged. Physics modules,
constants, state, emitter source and the complete physics-step section match the
baseline byte-for-byte. Tests cover dirty upload ranges, source ordering/duplicate
references, camera-edge bounds, actual GPU rendering/culling/timestamps, frozen
smoke time, device loss/fallback, quality/resize behavior and profiler export.

Controlled before/after pictures cover empty ground, retained marks, mixed paint,
smoke and authored blur. Earlier candidate comparisons were pixel-identical in
empty/marks/mixed scenes; smoke/blur differences were at most one 8-bit level.
Final production captures and raw results are in [performance evidence](validation/performance/).

```
node scripts/benchmark-skid-cache.mjs --baseline /path/to/baseline/checkout
node scripts/benchmark-smoke-shaders.mjs --baseline /path/to/baseline/checkout --backend software
node scripts/benchmark-renderer.mjs --scenes empty,drift,combined,smoke,blur --frames 120 --fenced --output /tmp/render-run
```

The first test uses mocked writes. The latter two require the normal development
server, installed Playwright and its browser (or CHROMIUM_EXECUTABLE). The renderer
benchmark uses real offscreen WGSL and labels its adapter; `--fenced` waits only
inside the benchmark and measures completion pacing rather than producer cadence.
GPU timestamps in that harness cover the main pass, not compute. For native
live full-app render/compute measurements, use the browser recorder above.
A requested native backend is not proof that hardware was selected: inspect the
reported adapter/fallback fields. Small software timestamp samples do not justify
hardware speedup claims.


Final full-scene software samples (two GPU main-pass timestamps per scene,
1024×768, 30 deterministic frames per run) were:

| Scene | Before GPU samples, ms | After GPU samples, ms |
| --- | --- | --- |
| Empty | 109.2–133.7 | 115.8–126.3 |
| Retained marks | 199.3–201.3 | 199.3–206.6 |
| Mixed paint/marks | 202.5–202.6 | 202.9–220.9 |
| Smoke | 207.2–216.0 | 213.7–239.5 |
| Authored blur | 810.4–812.5 | 833.4–865.7 |

These sparse sequential runs **do not establish an overall GPU speedup**. Some
samples and CPU encode means increased. The same-device alternating isolated
smoke test was noisy with near-equal medians; the unchanged ground shader also
shows between-run variation. Do not extrapolate these software results to NVIDIA.
The deterministic upload reduction and CPU cache bookkeeping measurements are
the demonstrated gains; total native frame-time benefit remains an open gate.
Final images for all five scenes are **pixel-identical** to baseline on this
software adapter. No quality reduction was used to manufacture performance gains.
