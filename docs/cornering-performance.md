# Mission 7 — Cornering performance

## Outcome and scope

**A heading-dependent artwork rebuild was isolated and reduced without changing pixels or mechanics. The user's severe GPU/FPS degradation is not declared solved.** Contact integration also consumes most physics CPU time, but was not rewritten or tuned. Real browser cadence remains variable despite the localized improvement.

Working branch: `fix/cornering-performance`, from `fix/steering-input-continuity` at `e3cb371dc992a3457beec414eede2e9673ddce8c`. Comparison audit: `3870cc95d04abcec4d7859c11e1f9e6b78d009ad`. All protected branches are unchanged; no merge.

Only production change: [vehicle-sprites.js](../js/renderer/vehicle-sprites.js), 18 added / 3 removed lines. Supporting files are the focused browser pixel test, external profiling/replay scripts under [research/cornering-performance](../research/cornering-performance), and this report/evidence. No production profiling hooks or diagnostic UI were installed.

## Reproduction environment and workload

Linux cloud container, AMD EPYC 9V74 host, five visible logical CPUs and a four-CPU cgroup quota; 32 GiB memory limit. System Chromium **154.0.8037.57**, Node **v24.19.0**, headless, 1280×900 viewport. Primary timing uses Canvas with `--disable-gpu`; it cannot represent the user's RTX 5090/Brave/Vulkan performance. A separate SwiftShader WebGPU test executes GPU commands with the existing offscreen-target helper, not a real monitor swap chain.

The complete application RAF loop runs: physics, camera, sprites, game effects, Canvas drawing, DOM/SVG instruments and fault checks. Browser startup controls supply the actual parameters: 100 Hz, time scale 1, redline 7000, stall resistance .5, six constraint iterations, Pacejka B=10/C=1.9, motion blur .6. Smoke is **off by the browser default**, while skids and sparks remain enabled. No physical parameter was reduced for performance. Maps are enlarged to exclude walls; rolling history is seeded consistently. A fixed initial population of 32 balloons and seeded randomness exercise game/render work, including normal respawn.

The ten deterministic scenarios are idle; 15 m/s acceleration; neutral coast; constant .03/.15/.52 rad steering; ±.25 rad reversals every .2 s; .2 rad steering with braking/clutch; .2 rad with 70% throttle; and a labeled synthetic high-sideslip seed (β=.65, yaw=.5 rad/s, rear wheelspin factor 1.5). They are reproducible open-loop inputs, not validated steady circles or drifts. Definitions are in `scenarios.mjs`.

Each primary variant has two repeats, a .3 s warm-up and 2 s measured schedule at 120 Hz rendering. Tables combine 480 frames per scenario. Fine-grained profiling and uninstrumented timing run separately. Mechanical traces are compared exactly to verify that observation did not change results. Manual RAF timestamps represent rendering schedules; they do not measure real refresh or presented FPS. Physically identical commands are reasserted before frames to keep Mission 5's lost-input bug out of the branch comparison. Fine-profiled audit repeat 1 is conservatively excluded from timing summaries after a discarded diagnostic briefly overlapped; raw counters/telemetry remain. Uninstrumented branch comparisons and all optimization/grid runs were serial.

## Baseline: audit versus steering fix

Full-frame **CPU p95**, ms, without fine instrumentation:

| Scenario | Audit 3870cc9 | Steering fix e3cb371 |
|---|---:|---:|
| idle | 1.30 | 1.10 |
| acceleration | 8.30 | 7.60 |
| coast | 7.50 | 7.40 |
| small-turn | 7.60 | 9.70 |
| moderate-turn | 9.90 | 9.80 |
| maximum-lock | 8.90 | 9.20 |
| reversal | 7.00 | 7.90 |
| turn-brake | 4.90 | 5.00 |
| turn-power | 11.20 | 10.80 |
| sideslip | 11.60 | 9.80 |

All 40 paired branch traces have zero recorded numerical/state differences. Solver operations match exactly. The heading-dependent artwork code already exists in both branches. There is **no consistent timing regression attributable to the steering fix**; isolated tail differences remain noisy. Reliable mouse steering can now expose existing cornering work that a discarded command previously avoided. This does not establish the cause of every hardware-specific frame drop.

## Physics and solver cost

Before optimization, mean costs for moderate turning are: total tick 1.99 ms; tires 1.86 ms; suspension .014 ms; engine plus post-contact synchronization .014 ms; steering .003 ms; constraints .003 ms; body integration .002 ms. Sub-millisecond stage measurements are timer-quantized. Tire timing includes contact integration; these nested values must not be added twice.

Every tick makes four top-level `integrateWheelContact` calls. Per-tick means below include all four wheels; depth is the observed maximum. Callback counts include longitudinal and lateral target callbacks, excluding the four final diagnostic target reads in `tires.js`.

| Scenario | Recursive splits | Max depth | Rotor solves | Bisections | Force callbacks | Tire ms |
|---|---:|---:|---:|---:|---:|---:|
| idle | 0.00 | 0 | 12.00 | 0 | 36 | 0.03 |
| acceleration | 25.81 | 6 | 166.88 | 6675 | 7343 | 1.22 |
| coast | 36.50 | 6 | 230.98 | 9239 | 10163 | 1.69 |
| small-turn | 45.10 | 6 | 282.60 | 11304 | 12435 | 1.97 |
| moderate-turn | 41.31 | 7 | 259.84 | 10394 | 11433 | 1.86 |
| maximum-lock | 38.72 | 7 | 244.31 | 9772 | 10750 | 1.68 |
| reversal | 42.97 | 7 | 269.85 | 10794 | 11873 | 1.89 |
| turn-brake | 16.99 | 6 | 113.97 | 4319 | 4769 | 0.96 |
| turn-power | 38.66 | 7 | 243.98 | 9759 | 10735 | 1.76 |
| sideslip | 40.83 | 7 | 257.01 | 10280 | 11308 | 1.79 |

Moderate-turn contact time per wheel averages FL .540, FR .389, RL .549 and RR .357 ms/tick. Expensive work is not confined to the coupled rear axle. Steering/engine/suspension do not dominate these captures.

Source explanation:

- [wheel.js](../js/physics/wheel.js): each recursive interval evaluates one full step and two half steps. Rejected intervals recurse into both halves, recomputing trial work. Each advance invokes the bounded rotor solve; ordinary moving contacts execute its 40 bisections. Counter identities verify nodes=1+2×splits and advances=3×nodes per wheel call.
- [tires.js](../js/physics/tires.js): callbacks repeatedly evaluate the nonlinear combined-force target, normalized Pacejka functions, scrub blend and relaxation. Sharp near-zero-slip response and force-memory transients require refinement even in straight coasting. Moderate-turn subdivision work is only about 13% above coast here; it is not an orders-of-magnitude turn-only explosion.
- Frozen real-call probes retain the captured inertia, load, dt, initial forces and relaxation, but diagnostically replace the feedback target by its constant value at the original wheel speed. In the moderate-turn witness, solves fall 153→45 and bisections 6120→1800; the original target slope at the endpoint is about 38,990 N/(rad/s). Maximum-lock witness: 171→45 solves. This supports stiffness-driven refinement. **The constant-target experiment changes the equations and is not a proposed repair.** Remaining refinement also comes from relaxation transients. Probe slopes are of the original target, including when evaluated at the diagnostic endpoint.

No convergence failure occurred; maximum observed depth is 7 of the existing cap 12. The theoretical cap is still large: 8,191 interval nodes and 24,573 rotor solves per wheel, up to roughly 3.93 million bisections across four wheels/tick. No runtime guarantee on arbitrary states is claimed. There are no unbounded solvers added.

The fixed bisection count and repeated trial/callback work offer future optimization candidates, but the existing tire-law semantics/relaxation passivity and sequential shared-rear reaction are already known to be physically problematic. Per the mission's stop condition, **that solver was left untouched**. Its smallest correction boundary remains the isolated rear rotor/input-shaft/contact impulse and work contract plus a defensible tire transient contract, not another whole-drivetrain/steering redesign or promotion of the rejected research solver. No tolerances, frequency, substeps or forces were relaxed/clamped.

## Confirmed rendering bottleneck and correction

The original `bodyArtwork()` keys its cache by heading rounded to 1/24 rad and eight lighting values. Every changed heading bucket redraws/filter-processes the 384×672 PNG and temperature tint, even though those operations do not depend on heading. Only the final directional gradient depends on heading.

The correction caches one heading-independent base keyed by the same lighting values, then copies it and applies the unchanged gradient. It retains the original final bitmap transfer, quantization, dimensions, composition order and lighting invalidation. It adds **one bounded 384×672 RGBA canvas (~0.98 MiB nominal pixels)**, not a growing cache of headings. GPU/driver backing overhead is unmeasured.

Across both moderate-turn repeats there are exactly 82 heading-cache misses before and after. Artwork mean falls **.75→.34 ms/frame**, p95 **4.20→1.90 ms**. Maximum-lock artwork p95 is 4.10→1.80 ms; powered-turn 4.30→1.90 ms. The source-level invariant and repeated reductions support this localized conclusion independently of unrelated frame noise.

## Matched before/after benchmarks

All values are ms. Frame columns are **median / p95 / p99 / worst** from uninstrumented full-loop execution. Tick/render columns are means from separately instrumented runs; they are not summed with uninstrumented frame samples. No physics algorithm or settings differ between variants.

| Scenario | Frame before | Frame after | Tick before→after | Render before→after |
|---|---|---|---:|---:|
| idle | 0.60 / 1.00 / 1.40 / 3.40 | 0.60 / 1.00 / 1.60 / 3.10 | 0.09→0.09 | 0.61→0.65 |
| acceleration | 4.50 / 6.90 / 11.70 / 27.00 | 4.70 / 7.00 / 13.70 / 27.70 | 1.34→1.27 | 3.65→3.71 |
| coast | 4.40 / 6.80 / 19.40 / 36.30 | 4.60 / 7.80 / 19.10 / 40.90 | 1.83→1.82 | 3.06→3.27 |
| small-turn | 5.20 / 8.90 / 16.80 / 31.50 | 4.80 / 7.10 / 9.30 / 41.40 | 2.09→2.07 | 3.40→3.49 |
| moderate-turn | 5.20 / 10.20 / 13.00 / 21.40 | 5.10 / 8.20 / 11.50 / 58.90 | 1.99→1.88 | 4.28→3.82 |
| maximum-lock | 5.00 / 10.00 / 21.30 / 28.20 | 4.80 / 7.20 / 11.50 / 32.30 | 1.78→1.74 | 3.81→3.42 |
| reversal | 4.90 / 8.20 / 11.80 / 26.90 | 5.10 / 7.90 / 11.90 / 25.50 | 1.99→2.01 | 3.88→3.70 |
| turn-brake | 3.20 / 5.30 / 14.80 / 23.30 | 3.30 / 5.00 / 8.20 / 25.30 | 1.05→0.85 | 2.87→2.74 |
| turn-power | 5.60 / 11.70 / 25.00 / 30.30 | 5.00 / 9.00 / 22.60 / 35.30 | 1.87→1.97 | 4.51→4.14 |
| sideslip | 5.40 / 11.60 / 20.40 / 29.10 | 4.90 / 9.20 / 22.50 / 30.70 | 1.90→1.80 | 4.40→3.77 |

Moderate-turn p95 improves about 20%; maximum-lock about 28%; powered-turn about 23%. **Not every metric improves.** Coast p95 is 6.80→7.80 ms; moderate-turn worst is 21.40→58.90 ms. Frame tails and live cadence are not certified by this patch. Identical operation counts and mechanics do not imply identical GC, raster, scheduling or host-contention timing. No higher worst case was hidden by limiting samples or tuning physics.

Additional 100 Hz physics schedules (one repeat each, 2 s):

| Render schedule | Scenario | Frame p95 before→after | Frame p99 before→after | Steps/frame |
|---|---|---:|---:|---:|
| 60 Hz | coast | 10.40→10.50 | 13.70→13.10 | 1.66 |
| 60 Hz | moderate-turn | 14.00→10.40 | 20.60→16.90 | 1.66 |
| 60 Hz | reversal | 10.60→9.70 | 20.90→11.30 | 1.66 |
| 240 Hz | coast | 5.50→6.50 | 9.50→10.20 | 0.42 |
| 240 Hz | moderate-turn | 8.20→6.70 | 17.20→9.50 | 0.42 |
| 240 Hz | reversal | 7.00→7.70 | 17.70→11.40 | 0.42 |

The 120 Hz means are about .83 steps/frame; 60/240 Hz means are 1.66/.42. Controlled schedules drop zero substeps. They intentionally decouple supplied timestamps from execution time: a slow 240 Hz benchmark is not evidence that the machine presents 240 FPS. Event edges can reach different ticks across render schedules; comparisons are exact **within each matched schedule**, not claims of identical sampled inputs across schedules. Full distributions, wheel counts and memory samples are preserved in the evidence bundle.

## Real browser inputs, cadence and memory

Separate runs use actual RAF time and actual mouse/keyboard events, with fixed timestamps disabled, tracing off and no input-debug panel. They cover gradual steering, rapid reversals, release/re-grab, D throttle and A/S braking/clutch. No intervention was used to force a stable circle. The following are **RAF cadence FPS**, not measured physical display/scanout FPS:

| Run | Cadence FPS before→after | CPU frame p95 before→after | Completed steps/wall s before→after | Dropped steps |
|---|---:|---:|---:|---:|
| idle | 60.00→60.01 | 2.70→2.70 ms | 99.97→99.68 | 0/0 |
| straight | 49.54→52.80 | 14.60→14.30 ms | 99.76→99.36 | 0/0 |
| gradual-power | 49.67→48.75 | 16.00→17.40 ms | 99.69→99.54 | 0/0 |
| countersteer | 51.64→49.52 | 15.30→14.80 ms | 99.35→100.06 | 0/0 |
| turn-brake | 55.61→57.34 | 11.90→9.50 ms | 99.66→99.64 | 0/0 |

Actual presented FPS is **unavailable** on this headless host. Live captures do not establish smoothness on the user's PC. Simulation time stays close to wall time even when cadence falls: multiple physics steps are completed per frame, rather than silently claiming a lower frame rate means fewer physics ticks.

All 36 steering observations per variant reach the requested road angle within 150 ms, with maximum angle error below 1e−12 and an intervening physics tick. Input automation round-trip p95 after the repair is 43.26 ms for gradual powered steering, 20.42 ms for countersteering and 22.75 ms for braking/steering. These include IPC/scheduling and are not hardware-to-photon latencies. The after-run still has 53/52 ms long tasks in powered steering and a 56 ms task in countersteering. The improvement does not eliminate event-loop blocking.

A separate CDP trace with the optional input-debug panel enabled observed GC and raster/layout activity. Example straight-driving capture: 93 MinorGC events totaling 50.21 ms, max 1.97 ms; two MajorGC events totaling 20.21 ms, max 13.68 ms. Nested GC event names are not added again. This supports allocation/collection as a contributor to tails, not proof that every long frame is GC or that the application leaks. Short normal captures grow JS heap roughly 1.4–4.3 MB while retaining diagnostic samples; long-term steady memory and physical GPU residency were not measured.

## Numerical and browser regressions

- Original audit versus steering fix: 40 paired traces, zero recorded differences; exact solver counts.
- Before versus lighting cache: 40 paired traces across all ten scenarios, zero differences in 52 recorded fields (wheel speeds, forces, relaxed forces, loads, engine RPM/shafts/clutch pedal/torque/heat, gear/mode, steering/SAT, chassis velocity/acceleration/heading/yaw and constraints). Sideslip is derived from the identical velocity/heading inputs. Instrumented/uninstrumented traces also match exactly.
- Additional all-ten-scenario replay explicitly includes clutch-state labels and synchronizer torque/heat. Observed labels are open and locked; both match exactly. Slipping coverage comes from the existing rotational-drivetrain tests, not a claim that this replay visited every mode. The 60/240 Hz matched comparisons are exact. Nominal straight-line asymmetry is unchanged; the existing rear-order yaw defect is not repaired or concealed.
- Maximum recorded chassis constraint correction in the matched cache workload is 8.33e−14 m. No observed convergence failures/nonfinite state. Unchanged solver code and identical operation paths/outputs preserve its existing convergence behavior; this is not validation of the model's physical realism.
- Pixel test: **280 cases**, zero changed channel values, including heading changes, repeated angles, lighting/temperature changes, lighting disabled/re-enabled and translucent ghosts, on OffscreenCanvas and HTML canvas paths. The same two tests also pass under the software GPU launch configuration.
- Browser checks: **33 passed** (artwork, Mission 6 continuity, audit parity, input reliability and UI integration); **4 passed** under the software WebGPU configuration (two artwork tests plus Canvas/GPU pending-input paths). The GPU path waits for submitted work and stays ready without a renderer error.
- Headed native X11 test: **1 passed**, actual Ctrl+R and Ctrl+Shift+R reload, neither intercepted nor dispatched as starter commands. R-start/repeat/running/starting/text-entry and A/S/D/F behavior pass in the existing input tests. This is Linux coverage, not native macOS Meta+R verification.
- Full unit suite: **274 passed / 7 failed**, unchanged. All **46 Mission 01 chassis numerical tests**, nine wheel-solver tests, 13 rotational-drivetrain tests and four engine-start tests pass. Four pre-existing static-clutch heat failures at 50/100/200/400 Hz and three pre-existing wheel-omega expectations (exact idle, immediate over-rev synchronization, pre-contact creep) remain. No assertion was weakened or marked expected-failure.

## Reproduction and remaining boundary

[summary.json](cornering-performance-data/summary.json) contains complete browser parameters, branch/source hashes, distributions, comparisons and checks. [measurements.json.gz](cornering-performance-data/measurements.json.gz) retains bounded counters/timings, sparse full-precision telemetry, full-trace hashes, live observations and GC summaries. Full raw captures can be regenerated; no plots or repository-wide audit were added.

Run from the repository root:

```sh
node research/cornering-performance/run.mjs --out=/tmp/mission7-baseline
node research/cornering-performance/run.mjs --candidate --out=/tmp/mission7-cache
node research/cornering-performance/run.mjs --candidate --grid --out=/tmp/mission7-grid
node research/cornering-performance/run.mjs --quick --probe --out=/tmp/mission7-wheel-probe
node research/cornering-performance/run.mjs --candidate --parity --out=/tmp/mission7-state
node research/cornering-performance/interactive.mjs --input-debug
node research/cornering-performance/interactive.mjs --baseline --no-trace --out=/tmp/mission7-normal-before
node research/cornering-performance/interactive.mjs --no-trace --out=/tmp/mission7-normal-after
node research/cornering-performance/summarize.mjs
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test --config=research/cornering-performance/playwright.config.mjs cornering-artwork-parity steering-input-continuity steering-physics-parity input-reliability ui-integration
CORNERING_SOFTWARE_GPU=1 node node_modules/@playwright/test/cli.js test --config=research/cornering-performance/playwright.config.mjs cornering-artwork-parity steering-render-paths
DISPLAY=:96 node node_modules/@playwright/test/cli.js test --config=research/cornering-performance/playwright.config.mjs steering-native-refresh
```

Use `CHROMIUM_EXECUTABLE` for another browser. Native refresh requires an existing Linux X11 display, xwininfo and libXtst; it skips before browser startup otherwise. Linux optional Rollup/esbuild binaries were installed locally for this cloud unit run and cleaned afterward; manifests were unchanged. Profiling transformations are served only by these external scripts, with guards against source-boundary drift and bounded tick/frame/trace aggregation. Normal play pays no profiling cost.

**Remaining boundary:** physics CPU is still expensive, GC/layout/raster tails remain, smoke-enabled and hardware GPU workloads may behave differently, and no stable 120/240 FPS or user-PC guarantee is made. The next evidence needed for the user's reported severe loss is a matched capture on their actual browser/backend/resolution/settings (the existing `?gpuProfile=1` recorder plus a browser performance trace), not an assumed solver replacement. Any future contact optimization must honor the known mechanical/constitutive correction boundary first.

Deliberately unchanged: steering input ownership and shortcuts; engine/clutch/gear equations, inertia and state policy; tires/grip/relaxation/SAT; suspension, geometry, yaw damping, chassis/wheel integration; physics frequency/time scale/substeps/tolerances; vehicle appearance and artwork; default parameter values. No Mission 02/03 changes, research solver, assistance or handling correction was integrated. No branch was merged.
