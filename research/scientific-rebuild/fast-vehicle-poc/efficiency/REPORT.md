# Recover computational efficiency — one focused pass

PERFORMANCE; baseline `a8be5c99d16140dafc042282691ae95b972a2181`. No branches, physical models, tolerances,
constitutive parameters, safety checks or historical fixtures changed. Original
source is loaded from Git for comparisons; shared physics dependencies are checked
against that revision. The containing commit plus source hashes identify delivery.

## Profile and retained changes

Baseline inspector self samples: rotorFlow 24.4%, reactions 21.7%, outer step
21.7%, GC 7.9%. Vertical operator/factor account for about 4.5%. Allocation sampling
identified rotor/reaction temporaries, outer-step arrays, slices/maps and flatMap.
Profiling covers 35 simulated seconds after warmup. Inspector overhead is present;
these samples are not the unprofiled throughput denominator.

**Reuse package, commit 3e21636:** private WeakMap cache of the suspension
Cholesky factor keyed by timestep, all relevant masses/inertias, stiffness, damping
and corner geometry, using Object.is checks. Right-hand sides still refresh from
current state and gravity/rest length. Each live vertical configuration retains
only its latest factor, avoiding an unbounded timestep cache. Call-private arrays
replace per-iteration slices/maps/flatMaps; RHS/solve/output/force buffers are
reused only within that call. Published diagnostics never alias a later call.
Already computed heading/steering trigonometry is reused without arithmetic
reordering. This package preserves all states **and diagnostics bit-for-bit**
against a8be5c9 in the exact-comparison tests, including parameter/timestep changes.

**Safeguarded dynamic Aitken:** unchanged fixed point G(x), residual r=G(x)-x.
For consecutive residuals, omega=-omegaPrevious*(rPrevious dot deltaR)/|deltaR|².
For a scalar affine fixed point this is the exact inverse of 1-G'. The next trial
is x+omega*r. Finite omega is accepted only in [.5,1.5], with nonincreasing residual
and nonnegative proposed normal loads; otherwise the update is plain Picard.
Zero/overflowed difference norms fall back to Picard. This is unpublished solver
relaxation, **not physical damping**, an extra force or a time substep. No state or
work is advanced by an unaccepted guess. Default is now 'aitken';
`step(s,input,h,{acceleration:'none'})` selects the independently measured reuse
package without acceleration. The original 24 evaluated-trial cap and
**1e-11 N actual force residual** still decide convergence. Original work, friction,
finite-energy, rotor-event and rollback checks are unchanged.

Both proposals improved complete-step CPU in the paired pilot and final aggregate;
no alternative solver or subsequent optimization campaign was attempted. Revert
the acceleration commit to recover exact reuse behavior, or revert both optimization
commits to restore a8be5c9. No frozen copy of the vehicle implementation is added.

## Paired complete-step measurements

Node v24.19.0, INTEL(R) XEON(R) PLATINUM 8573C, 5 exposed logical CPUs, four CPU-equivalents
quota, shared cloud host. Headless CPU; no browser/GPU/FPS claims. Seven identical
one-second cases at 1 ms; full warmup per method, five rotated-order runs per case,
first case run discarded. Median of four measured run statistics. Whole process
CPU includes common timer/counter collection; per-step wall time measures step.
Initialization, validation, profiling and serialization are excluded. No other
local tests or profiler ran concurrently. All 105 timing runs completed.

| Case | a8be5c9 CPU ms/sim s | Reuse | Reuse+Aitken | Complete-step speedup |
|---|---:|---:|---:|---:|
| acceleration | 86.62 | 84.03 | 40.86 | 2.12× |
| steering | 71.16 | 55.10 | 49.20 | 1.45× |
| braking | 64.49 | 49.83 | 40.20 | 1.60× |
| drift-recovery | 73.52 | 59.51 | 50.29 | 1.46× |
| recontact | 66.99 | 53.28 | 42.04 | 1.59× |
| clutch-transition | 56.16 | 46.52 | 39.73 | 1.41× |
| hold-release | 53.44 | 36.86 | 35.60 | 1.50× |

Equal-case CPU means: **67.48 → 42.56 ms/sim s**,
**1.59× throughput**, 36.9% lower CPU.
Reuse alone: 1.23×. Aitken adds 1.29× over reuse. These are
ratios of aggregate costs, not averaged speedup ratios. The older published
97.9 ms/s is **not** used as the denominator: warmup, JIT and host load differ.
The raw pilot is retained separately; final numbers come only from benchmark.json.

| Case | Baseline / optimized trials per step | Baseline median / p95 / p99 ms | Optimized median / p95 / p99 ms | Worst baseline / optimized ms |
|---|---:|---:|---:|---:|
| acceleration | 8.604 / 6.087 | 0.0557 / 0.1406 / 0.2703 | 0.0307 / 0.0708 / 0.1842 | 0.648 / 0.551 |
| steering | 8.311 / 6.598 | 0.0564 / 0.1422 / 0.2474 | 0.0402 / 0.1102 / 0.1963 | 0.871 / 1.027 |
| braking | 9.069 / 6.654 | 0.0534 / 0.1307 / 0.2384 | 0.0343 / 0.0858 / 0.1772 | 0.698 / 0.445 |
| drift-recovery | 9.206 / 7.374 | 0.0608 / 0.1430 / 0.2592 | 0.0408 / 0.1024 / 0.2061 | 0.768 / 1.097 |
| recontact | 9.088 / 7.009 | 0.0544 / 0.1357 / 0.2785 | 0.0345 / 0.0711 / 0.1839 | 0.903 / 1.555 |
| clutch-transition | 6.480 / 5.130 | 0.0547 / 0.1204 / 0.2375 | 0.0359 / 0.0679 / 0.1826 | 0.559 / 2.360 |
| hold-release | 4.843 / 3.940 | 0.0542 / 0.1008 / 0.2058 | 0.0358 / 0.0850 / 0.1837 | 2.268 / 0.544 |

Total trials per seven simulated seconds: 55601 → 42792
(23.0% fewer); reuse leaves counts unchanged. Fewer trials were retained
because **actual CPU improved**, not because iteration count alone is a speed metric.
Worst observed latency is not a hard deadline guarantee; per-case/JIT/GC noise and
raw runs are preserved. These figures do not establish a new speedup against the
strict simulator, which was not rerun for throughput in this scope.

## Allocation and garbage collection

Inspector statistical allocated-byte estimates over 35 simulated seconds:
5555675944 → 3518156032,
**36.7% lower**. Sampling interval 16 KiB, including objects collected
by minor/major GC; this is not exact allocation accounting or retained heap.
GC self-sample share was 7.9% → 8.0%, while total sampled execution time fell.
In the unprofiled measured windows GC event duration was
1.684 → 1.130 ms/sim s; event counts across
28 measured simulated seconds per method were 243 → 149. Asynchronous GC
entries are attributed after timing windows drain; durations are not CPU-time
attribution. Per-run live heap deltas are in raw data and are not treated as
allocation volume. RotorFlow/reactions remain the main hotspot (about 54.5% of
optimized self samples). They were left unchanged; no wider rewrite was attempted.

## Correctness and numerical differences

- **34 POC tests passed**, including original mechanical/independent analytical
  tests and five new cache, aliasing, exact replay and accelerated-equivalence groups.
- **82 strict-reference tests passed**; **1,080-state bit-exact A replay passed**.
- Reuse is bit-exact at 1/.5/.25 ms, including diagnostics; invalidation checks
  vary timestep, mass/inertia, stiffness, damping and corner geometry.
- All 21 case/rate comparisons with all three methods completed. Acceleration
  preserved clutch/brake mode histories in every sample; locked speed residual
  is exactly zero, static brake holding/release and deterministic replay pass.
- Largest absolute difference across all 30 state/work fields: 1.818989e-12
  (SI units per field); full per-field maxima are in raw validation records.
  Maximum cumulative mechanical energy/work residual: **1.955414e-11 J**.
- All force residuals remain <=1e-11 N and friction excess <=2e-11 N. Original
  force-passivity, whole-step energy and exact rotor checks run on every accepted
  step. No tolerance was loosened or extra damping added.
- Nonconvergence/invalid inputs preserve state, time and diagnostics; subsequent
  calls cannot mutate published arrays. Original timestep-refinement tests passed;
  every state at three rates also closely matches the original convergent method.

| Case | Final position difference 1 vs .25 ms, baseline / optimized m |
|---|---:|
| acceleration | 4.48134e-9 / 4.48134e-9 |
| steering | 3.66780e-8 / 3.66780e-8 |
| braking | 6.65701e-7 / 6.65701e-7 |
| drift-recovery | 5.29681e-6 / 5.29681e-6 |
| recontact | 3.37318e-7 / 3.37318e-7 |
| clutch-transition | 1.49801e-8 / 1.49801e-8 |
| hold-release | 5.08134e-8 / 5.08134e-8 |

Inherited model limitations are unchanged: synthetic reduced vehicle, flat plane,
fixed gear/ideal differential, temporary velocity-slip tires, frozen engine torque
sampling and bounded fixed-point convergence. Energy closure is not real-world
validation, and the tested envelope is not a universal convergence proof. No
production, GUI, renderer, terrain, gearbox or physical model feature changed.
Stop after this focused optimization pass.

## Reproduction

From repository root, no new dependencies:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs research/scientific-rebuild/fast-vehicle-poc/constraints.test.mjs research/scientific-rebuild/fast-vehicle-poc/consistency.test.mjs research/scientific-rebuild/fast-vehicle-poc/efficiency/efficiency.test.mjs
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
# Stop other local tests before timings/profiles; do not run them together.
node research/scientific-rebuild/fast-vehicle-poc/efficiency/benchmark.mjs
PROFILE_BASELINE=1 node research/scientific-rebuild/fast-vehicle-poc/efficiency/profile.mjs
node research/scientific-rebuild/fast-vehicle-poc/efficiency/summarize-profile.mjs /tmp/vehicle-efficiency-profile baseline
node research/scientific-rebuild/fast-vehicle-poc/efficiency/profile.mjs
node research/scientific-rebuild/fast-vehicle-poc/efficiency/summarize-profile.mjs /tmp/vehicle-efficiency-profile optimized
node research/scientific-rebuild/fast-vehicle-poc/efficiency/report.mjs
```

Create /tmp/vehicle-efficiency-profile before profiling if absent. Raw inspector
profiles stay there; only compact aggregates are committed. Sampling and timings
vary between runs. New result files overwrite only this optimization's directory;
historical research outputs remain untouched. All new modules passed node --check.
