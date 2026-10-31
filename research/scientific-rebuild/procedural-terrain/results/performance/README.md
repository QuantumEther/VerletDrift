# Experiment 11 performance and early-stall correction

Baseline: `3f7a0d9`. Same branch; Experiments 1–10 and the original simulator are unchanged. No terrain amplitude, inertia, spring, damping, physics frequency, contact/work tolerance or endpoint iteration limit was relaxed.

## Diagnosed failures

1. **CPU overload:** repeated dense `J M^-1 J^T` construction and temporary FISTA arrays dominate the CPU profiles. Full-state cloning adds cost but is not the primary bottleneck. The prior 6 ms render-frame budget limits throughput even after optimization. The debt was already capped at 50 ms; there was no unbounded catch-up spiral.
2. **Immediate ordinary selector interruption:** 120 N first-selector input on stationary road terrain rejects at 0.006 simulated seconds (selector q=0.00948100444 m), with the explicit unsupported non-flat gear-event message. Rejection and observer rollback are tested. This limitation remains; the UI now distinguishes it from overload and energy/nonconvergence faults. The explicit stationary first-gear setup remains available.
3. **Long driving stall:** the original 180 s mixed scenario stopped at 139.912 s. At the 80th endpoint iteration position error was exactly zero and velocity error 2.17e-19, but local normal-work error was 1.000325608e-9 J, just above the unchanged 1e-9 J gate. Global residual was 3.00e-9 J. The near-zero displacement gradient used start-point derivatives, introducing first-order bias as its roundoff guard grew with world coordinates (x≈896.687 m, y≈156.365 m). It was a local work-gate defect, not a failure to converge the endpoint state. The complete checkpoint and inputs are in `long-drive-failure.json`.

## Production changes

- Experiment-11-local implementation of the **same** convex backward-Euler/FISTA/polish algorithm. Compute `M^-1 J^T` once per row, exploit exact zero support, and reuse iteration buffers. Forty deterministic constrained cases exactly match the inherited solver, including impulses, velocities, iterations and residuals. The drivetrain inverse-inertia block and all constraint groups remain intact.
- One detached private mechanical basis per candidate; no complete state clone inside the endpoint loop. Copy solver-mutated records for each endpoint trial. Geometry/configuration belongs to the private basis, never the caller. Deep-frozen-basis tests cover all differential modes; original accepted states remain unchanged by subsequent candidates.
- Cache only unchanged start contact data, original energy and point Jacobians; reuse the just-evaluated endpoint coordinates. Recompute endpoint terrain normals, gradients, material and reactions each iteration. Previous trial impulses only seed the next constrained solve; original physical velocities still define the timestep. KKT, work and convergence gates are unchanged.
- Use midpoint derivatives in the roundoff-dominated near-zero terrain secants. This removes first-order work bias; the approximation has cubic local work error. The original work gate remains authoritative. The saved 139.912 s checkpoint now advances deterministically, with at most four endpoint iterations; its peak local work residual across the next 100 steps is 5.45e-14 J (previous failing step: 1.000325608e-9 J). Refinement at 2/1/0.5 ms reduces checkpoint state error from 1.8065e-4 to 6.1176e-5.
- Bounded 12 ms physics budget per display frame, retaining 1 ms steps, 32 maximum steps and 50 ms pending debt. No false time advancement. Always-visible telemetry separates render FPS, physics steps/s, simulation/wall ratio, pending debt and discarded wall time. Fault types are explicit.
- Mesh sampling/color assignment is one pass with reusable colors, only when terrain identity or integer world origin changes. Per-update timing/count is observable. Closed terrain diagnostics no longer serialize every refresh. Open suspension diagnostics use actual terrain loads, current elastic energy and the accepted terrain ledger.

## Isolated headless timing

Sequential Node 24 runs after other profiles completed; 1,000 production steps per case, same seeded road and input protocol. Times are milliseconds. These fixtures initialize a running engine/selected gear explicitly; the separate live browser run starts the actual engine. Earlier concurrent/profiled runs showed much larger costs and are retained, but are **not** used for the headline comparison.

| Road case | Before median / p95 / worst | After median / p95 / worst | Median speedup |
|---|---:|---:|---:|
| stationary | 0.739 / 1.307 / 4.694 | 0.323 / 0.817 / 2.196 | 2.29× |
| accelerate-steer | 3.166 / 4.530 / 9.689 | 0.926 / 1.527 / 4.403 | 3.42× |
| brake | 2.818 / 4.659 / 8.558 | 0.806 / 1.366 / 2.447 | 3.50× |

Acceleration/steering mean contact iterations per accepted endpoint solve: 100.195 → 2.324. Endpoint iteration counts are effectively unchanged (~4.87/step). Optional stage instrumentation (additional overhead) measures mean per requested step: setup/private basis 0.079 ms, endpoint record copying 0.089 ms, terrain/reactions/frames 0.155 ms, unified solver/driver preparation 0.788 ms, energy/endpoint checks 0.068 ms. Saved `contactIterations` counts describe the final accepted endpoint; current live `lastStepCases` and `terrainLedger.contactIterations` now include all endpoint/clutch trial work. Full 18-case runs include E10 and E11 flat controls plus idle/acceleration/steering/braking; their timing tails include concurrent machine load.

Median production respawn time (10 calls, including 100 private validation steps): flat 52.1 → 38.5 ms, hills 525.2 → 64.7 ms, rough 480.1 → 39.4 ms, road 459.7 → 50.5 ms. These reset runs had concurrent load, so they are indicative, not isolated microbenchmarks.

## Sustained numerical driving

The unchanged 180 s mixed protocol (throttle, braking, steering reversal and handbrake) now completes all 180,000 steps. All 180 one-second samples report engine running. It advances over the seeded road, reaching 8.646 m/s, peak pitch 0.006704 rad and roll 0.003979 rad. It takes 128.032 wall seconds in the measured headless run (other measurements were active). Peak per-step full residual is 5.3945e-9 J, signed accumulated residual 9.6640e-7 J, and sum of absolute residuals 2.23385e-4 J. There are 736,053 endpoint iterations (4.09/step), 249,701 accepted-endpoint contact iterations, clutch heat 373.433 J, and no rejected/faulted step. Worst wall time of a step was 84.64 ms under concurrent load; this is not a real-time latency guarantee. Full one-second traces and summary are preserved in `soak-after.json.gz`.

## Browser performance and interaction

Chromium 154.0.8037.57, verified ANGLE Vulkan SwiftShader (no `/dev/dri` device), 1280×900, real uncontrolled RAF. The unchanged E10 reference is also only about 2–4 FPS here. CPU/GPU contention strongly changes frame-time tails; short 2 s windows have only 2–5 frame samples. A hardware-GPU acceptable-FPS gate therefore **remains unverified**. Do not interpret controlled RAF regression tests as a frame-rate benchmark.

Representative road stationary frame median/p95/worst: baseline 416.7/416.7/433.4 ms (5 samples), final 449.9/450.0/500.1 ms (5 samples). Sim/wall ratio improves from 0.0099 to 0.0211 in that short window; debt remains ≤50 ms. The throttle/steering input window improves 0.0023 → 0.0208, but these short windows do not start the engine and are not proof of powered acceleration. The separate `browser-real-start.json.gz` waits for a genuine running engine (21.6 wall seconds here) before driving: acceleration/steering reaches 0.02782 m/s, braking reduces it to 0.01370 m/s, and the engine stays running with no clock fault. The software-rendered display remains slow.

Sampled whole-application allocations with minor/major collected objects included: 357.3 MB/11.19 s before versus 171.8 MB/11.37 s after the solver optimization. CPU-profile GC samples are 37.4 versus 46.0 ms: a GC-time reduction is **not** demonstrated. These include renderer/diagnostic activity, differ in accepted step count, and are not exact solver-only allocation rates or GPU memory. Raw compressed CPU and allocation profiles are retained for inspection.

## Verification / limitations

42 Experiment 11 tests and 24 unchanged Experiment 10 tests pass, including historical energy fixtures, exact flat-reference trajectory, contact loss, drivetrain/steering/brakes, rollback, state isolation, the saved long-driving failure and timestep refinement. Chromium checks cover all terrain presets, actual powered driving, terrain diagnostics, explicit selector-fault recovery, tracks and inherited mechanical inspection. Final browser command output is retained alongside this report.

Supported UI terrain remains seed 42, amplitude 0.001 m and roughness 0.1. Non-flat moving gearbox subdivision remains unsupported. Three minutes of the specified headless protocol is not arbitrary-terrain or unlimited-duration validation. Hardware-GPU frame rate and acceptable real-time playability are still an explicit acceptance gate; this cloud software renderer cannot establish it. No public deployment is implied.

## Reproduction

```sh
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
node --test --test-isolation=none research/scientific-rebuild/four-corner-load-transfer/tests/*.test.mjs
BENCH_MODELS=road BENCH_MODES=stationary,accelerate-steer,brake STEPS=1000 node research/scientific-rebuild/procedural-terrain/tools/benchmark.mjs
PROFILE=1 BENCH_MODELS=road BENCH_MODES=accelerate-steer node research/scientific-rebuild/procedural-terrain/tools/benchmark.mjs
SOAK_SECONDS=180 node research/scientific-rebuild/procedural-terrain/tools/soak.mjs
node research/scientific-rebuild/procedural-terrain/tools/reset-benchmark.mjs
CHROMIUM_PATH=/usr/bin/chromium REAL_START=1 PERF_KINDS=road PHASE_MS=3000 node research/scientific-rebuild/procedural-terrain/tools/browser-performance.mjs
CHROMIUM_PATH=/usr/bin/chromium CPU_PROFILE=1 PERF_KINDS=road node research/scientific-rebuild/procedural-terrain/tools/browser-performance.mjs
```

For the baseline, extract `git archive 3f7a0d9 research/scientific-rebuild` into a separate temporary directory and copy only the benchmark tools there; do not replace current production source or change branches. Run timing comparisons sequentially without concurrent profiles. Decompress `.cpuprofile.gz` to import into Chromium DevTools. Environment variables tune benchmark duration/cases only, never the physical timestep.
