# Mission 14 — measured performance, preserved mechanics

Base: `bf4505252f615beacfdb177cf5c53f37f9d3739e`, existing branch
`scientific-rebuild/12-braking-and-tire-contact`. The stale local checkout was
fast-forwarded to that remote ancestor; no branch or merge commit was created.
Only Experiment 11 source, focused tests/tools and this result directory change.
Experiments 1–10, tire constitutive equations/parameters, drivetrain laws,
suspension, steering, clocks, controls, audio and navigation remain unchanged.

## Measured result

**Overall physics throughput: 1.137×** on the matched aggregate workload;
**2× target not met**. A CPU cost falls **924.26→791.35 ms/simulated second**;
B falls **996.52→897.71 ms/simulated second**. These are equal-scenario/rate
aggregate CPU costs, not averages of headline speedup ratios. Paired median
candidate/control CPU ratios are 0.851 A and 0.867 B; bootstrap intervals and
all per-rate distributions are in `summary.json`.

| Tire | Hz | CPU ms/sim s before → after | Median tick ms | p95 tick ms | p99 tick ms |
|---|---:|---:|---:|---:|---:|
| A | 1000 | 1233.21 → 1076.42 | .901 → .819 | 1.469 → 1.354 | 1.917 → 1.791 |
| A | 500 | 788.14 → 677.96 | 1.351 → 1.159 | 2.097 → 1.936 | 2.744 → 2.509 |
| A | 250 | 751.42 → 619.66 | 2.217 → 1.827 | 3.080 → 2.690 | 3.883 → 3.277 |
| B | 1000 | 1341.64 → 1295.28 | 1.015 → .904 | 1.604 → 1.492 | 2.223 → 2.163 |
| B | 500 | 957.50 → 804.54 | 1.449 → 1.226 | 2.322 → 1.896 | 3.202 → 2.686 |
| B | 250 | 690.41 → 593.30 | 2.304 → 1.934 | 3.211 → 2.890 | 3.973 → 3.910 |

Step quantiles above are medians of per-run quantiles, not pooled ticks.
All 630 runs completed. A has 13,275,036 convex / 143,964 endpoint iterations;
B has 17,796,512 / 144,040, **identical across backends** in the measured
non-warmup workload. Maximum work residual: 1.094e-8 J; constitutive impulse
residual: 3.662e-11 N s, below unchanged acceptance bounds. There is no claimed
iteration-count reduction or proof of universal real-time feasibility at 1000 Hz.

**B retention: FAIL**. All 504 additional all-floor A/B runs completed, but
41/84 scenario/rate/floor combinations exceed 1.10× median CPU cost (maximum
2.101×). This short two-measured-repeat screen does not certify tight tails;
it establishes no basis for promoting B to the default.

Separate V8 sampling estimates **1.663→1.462 GB allocated per simulated second**
in the 1000-Hz recovery workload (about 12% lower). It includes transient objects
collected during profiling; it is statistical, not an exact allocation count.
Post-GC deltas include the profiler's own records and are not comparable leak
measurements. Significant object churn remains. Heap deltas from the paired runs are retained, including outliers. Its GC
event counts are invalid/missing: Node delivered listener events after the
single event-loop drain and the timed filter discarded them. A corrected
two-turn drain is used in the separate `gc-recovery.json` measurement; the
original timing records are preserved rather than silently repaired.

## Retained implementation

1. **Strictly interior disc certificate and isolated hot loop.** For a friction
   disc of radius L, `max(abs(x),abs(y)) <= L/2` implies norm <= L/sqrt(2).
   Such a point cannot be projected by the original algorithm. Skip only its
   unused `Math.hypot`; otherwise execute the original projection. Sequential
   matrix products, FISTA iterates, residual criterion, scalar polish,
   reconstruction, clutch-mode tests and all work gates are unchanged. No
   square-root approximation or relaxed convergence is used. Scratch arrays are
   private to the solve. `contactKernel='dense'` retains the original loop.
2. **Candidate-local inertia reuse.** Endpoint trials start from the same
   detached mechanical basis. Reuse its masses, rotor inverse, selector gradient
   and assembled 18×18 inverse inertia; recompute geometry-dependent contact
   rows, free velocities, bounds and forces. Nothing survives a candidate or
   subdivision. `disableOperatorCache=true` enables the uncached control.
3. **Rigid visual batching.** Bake rigid decorative siblings, including their
   local instances, into same-material geometry. Keep independently animated
   parents, pickable mechanisms, transparent materials and paint that becomes
   transparent in X-ray separate. Preserve shadows, normals, UVs and triangles.
   `?unbatched` selects the old scene assembly for controlled comparison.
   Startup geometry memory can increase; batching is not presented as a memory
   reduction or a demonstrated software-GPU FPS improvement.

No solver iteration is omitted. A remains the application default; B remains
headless research. Detailed contact microtimers deliberately run the identical
reference arithmetic loop and label it `reference-instrumented`; use uninstrumented
throughput or CPU sampling for fast-path timing. Their iteration counts remain
valid because the algorithms are bit-identical.

## Rejected / deferred candidates

Sparse nonzero Hessian traversal, four-way loop unrolling, preclassified
projections and hot-loop separation alone did not show reliable whole-vehicle
benefit in their pilots. Their code was removed; raw pilot results remain.
The successful shortcut is a sufficient interior test, not one of those failed
arithmetic replacements. Inertia-only effects are separately measured from the
combined implementation in `paired-final.json`.

Changing locked-mode seeds, convergence steps or endpoint predictors changes
iteration histories and potentially finite-tolerance results. The dominant
locked-mode cost is real, but a new convex algorithm/scaling/acceleration needs
an independent solution certificate and equivalent-state validation. No such
unproven replacement is retained to force a 2× claim. Previous Mission 13 matrix
reuse and B's private mode seed remain available unchanged. A worker cannot
remove the observed SwiftShader rendering bottleneck; worker/input-ordering
and interpolation changes are deferred rather than adding another scheduler.
No GPU physics migration was attempted. *The Arithmetic Floor* was not present
in the checkout; it is not used as evidence of an achievable speedup.

## Observed browser limitation and remaining cost

The real-RAF top-view 1000-Hz acceleration/steering/braking phases completed
before and after. Observed steering steps/wall-second: **558→670**; braking:
**347→464**, with render cadence approximately 55–60→59–60 FPS. Acceleration
was 788→796 steps/s. These are single, wall-scheduled observations with
nonidentical input-onset simulation times, not deterministic speedup estimates.

At **500 and 250 Hz**, sustained maximum steering after launch encounters the
existing terrain energy guard in **both** versions. The subsequent braking
phase is **not executed**, because the clock is correctly fault-paused. Four
captured entry states were rerun through the archived base and optimized code
with identical throttle/steering and timestep: both reject with **bit-identical
candidate residuals and unchanged state**. See `browser-fault-replay.json` and
its reproduction tool. This is a preserved model/domain limitation, not a
passing driving scenario or a reason to weaken the energy check. The bounded
functional browser tests are separately recorded in `verification.json`.

Locked-clutch convex iterations, 5–8 endpoint trials/tick, repeated transient
records and terrain/contact construction remain important CPU/allocation costs.
The measured A 1000-Hz aggregate still costs more than one CPU second per
simulated second. Lower rates also change numerical response and can hit the
above work guard; the reference default is not changed. SwiftShader shading
remains the 3D bottleneck. Hardware-GPU performance and improved 3D frame tails
are **not established** by these results. Further invasive solver/worker changes
are stopped at diminishing returns rather than weakening scientific guarantees.

## Measurement interpretation

Node v24.19.0, Linux x64, Intel Xeon Platinum 8573C shared cloud host (five exposed logical CPUs), four CPU-equivalents
cgroup quota. External load/frequency are uncontrolled. CPU cost is user+system
CPU milliseconds per actually simulated second. Wall step quantiles are
nearest rank. Initialization/serialization are outside timers. The final paired
sweep uses seven deterministic scenarios (acceleration, braking, steering,
combined, lateral recovery, wheel-overspeed recovery, unloaded-wheel recontact),
1/2/4 ms, A/B, floor 0.5 m/s, three backends, five repetitions (first warmup),
0.5 simulated seconds/run. Backend order alternates within each repeat. Whole
validated time-zero fixtures are privately cloned outside timers. No steps are
dropped. A separate all-four-floor A/B sweep alternates A/B order.

`dense` = original loop and no operator reuse; `interior` = new loop without
operator reuse; `isolated` = both selected improvements. The name `isolated`
refers to the hot arithmetic function, not another vehicle simulator.

Heap deltas include garbage and are not allocation counters. GC events in the corrected recovery run are filtered to the timed interval;
the original broad-sweep GC samples are missing as explained above. `memory.json` and allocation
profiles are separate V8 statistical samples (32 KiB sampling); sampled bytes
are estimates, not exact allocation totals. Post-GC profiler retention is not
claimed to be a leak or an application heap cap.

The first `baseline.json` is a CPU-sampled exploratory run concurrent with unit
tests; use `cpu-profile-summary.json`/`baseline.cpuprofile.gz` for attribution,
not that run's throughput as an acceptance denominator. Acceptance uses the
within-process uninstrumented controls. Pilots have fewer repetitions and are
selection evidence, not additional independent validation.

Chromium rendering uses **ANGLE Vulkan SwiftShader**, not hardware graphics.
The paused 800×500 comparison alternates before/after scene assembly, normal
and X-ray, three repetitions (first warmup), 1 s warmup + 2.5 s real RAF per
view. It checks frozen physical state. Draw calls decrease **209→182** with
**57,012 triangles unchanged**. Software FPS remains approximately 2 and its
short p95/p99 tails are noisy; no hardware-GPU or 240 FPS claim is justified.
Screenshots/pixel differences are retained. Driving performance separately uses
real RAF, top view and actual engine/clutch inputs at all three rates, comparing
the archived base against current source. These short browser runs are
observations rather than confidence intervals or long-term handling validation.

Numerical outcomes, CPU ratios, quantiles, solver/endpoint counts, GC observations
and test statuses are in `summary.json` and `verification.json`. No performance
claim implies calibrated real-world vehicle fidelity.

## Verification and GC follow-up

- Experiment 11: **76/76** tests (70 original + six focused preservation/batching tests).
- Experiment 10: **24/24**, unchanged sources.
- A: default and explicit **1,080-state bit-exact** replays pass.
- B: original reference and matrix-only **1,680-state bit-exact** replays pass;
  selected B still has its previously documented warm-start differences against
  the older fixture (maximum physical difference 1.284e-8 N), within the unchanged
  comparison bound. Dense-vs-new selected B complete states also match exactly
  in the new deterministic tests.
- Inherited controls/engine/gear/clutch/brakes/steering, twelve inspection views,
  marks, reset/rebuild: browser **PASS**. Bounded terrain integration and all
  eleven navigation routes: **PASS**. Forty JS syntax checks pass.
- Experiments 1–10, production and historical fixtures/results are unchanged.

Corrected 1000-Hz recovery GC probe, two measured one-second runs per tire/backend:
A collections **90→82**, total pause duration **34.13→31.20 ms** over two simulated
seconds. B collections **50→44**, pause duration **21.07→21.74 ms**. Thus fewer
collections do **not** establish uniformly smaller pause tails. These short
observations and raw events are in `gc-recovery.json`; they do not repair or
replace the missing broad-sweep GC samples.

## Reproduce from repository root

```sh
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
node --test --test-isolation=none research/scientific-rebuild/four-corner-load-transfer/tests/*.test.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs --explicit
VARIANT=reference node research/scientific-rebuild/procedural-terrain/tools/contact-replay.mjs
VARIANT=matrix node research/scientific-rebuild/procedural-terrain/tools/contact-replay.mjs
node research/scientific-rebuild/procedural-terrain/tools/contact-replay.mjs --equivalent
CHROMIUM_PATH=/usr/bin/chromium QUICK=1 node research/scientific-rebuild/procedural-terrain/tests/browser-inherited.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/procedural-terrain/tests/browser-terrain.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/procedural-terrain/tests/browser-navigation.mjs
```

From `research/scientific-rebuild/procedural-terrain` (run benchmarks serially):

```sh
DURATION=.5 REPEATS=5 KERNELS=dense,interior,isolated node tools/performance-m14.mjs > results/performance-m14/paired-final.json
PAIRED_AB=1 FLOORS=.25,.5,1,2 DURATION=.3 REPEATS=3 KERNELS=isolated node tools/performance-m14.mjs > results/performance-m14/ab-retention.json
DURATION=1 REPEATS=3 CASES=recovery STEPS=.001 KERNELS=dense,isolated node tools/performance-m14.mjs > results/performance-m14/gc-recovery.json
node --expose-gc tools/memory-m14.mjs > results/performance-m14/memory.json
CHROMIUM_PATH=/usr/bin/chromium node tools/browser-performance-m14.mjs
mkdir -p /tmp/m14-base
# From repository root, prepare the preserved browser control, without a branch:
git archive bf45052 research/scientific-rebuild | tar -x -C /tmp/m14-base
# Back in procedural-terrain:
CHROMIUM_PATH=/usr/bin/chromium M14_BASE=/tmp/m14-base node tools/browser-driving-m14.mjs
```

Do not recapture historical expected fixtures. Generated before/after timing
files vary with the host; numerical fixture comparisons must still pass.

Regenerate the summary with `python3 tools/summarize-performance-m14.py`. Replay the captured browser failures with `M14_BASE=/tmp/m14-base node tools/replay-browser-faults-m14.mjs`.
