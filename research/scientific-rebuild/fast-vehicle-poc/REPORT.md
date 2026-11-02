# Fast vehicle architecture: initial feasibility result

**Decision:** computationally feasible in this small headless envelope; **not a drop-in physics replacement**. No integration is proposed or performed. Stop this experiment here.

Base: `af74de28443278fcc7ed2f9816bfc80c0c4793fc`, branch `scientific-rebuild/12-braking-and-tire-contact`. New-file SHA-256 provenance is in `results/provenance.json`; the containing Git commit identifies the delivered snapshot. Historical files remain unchanged.

## Measured cost

Node 24.19.0, Linux 6.18.57, Intel Xeon Platinum 8573C, five exposed logical CPUs, cgroup quota four CPU-equivalents, shared cloud host. Headless CPU work only: **no browser, FPS or GPU performance claim**.

Six one-second scenarios at 1 ms; four repetitions, discard first per scenario, alternate method order. Tables use median of three run statistics. Aggregate is the ratio of sums of scenario median CPU costs, not an average of speedup ratios. Whole-run CPU includes stepping and common state extraction; per-step wall times exclude extraction. Initialization, serialization and extra validation diagnostics are excluded. Final timing run had no other local tests running; shared-host noise remains. See `results/timing.json`.

| Case | Strict CPU ms/sim s | POC CPU ms/sim s | Ratio | Strict inner/outer iterations per step |
|---|---:|---:|---:|---:|
| acceleration | 847.03 | 27.95 | 30.3× | 203.4 / 4.87 |
| steering | 838.14 | 17.93 | 46.8× | 187.1 / 4.98 |
| braking | 1312.10 | 15.44 | 85.0× | 443.8 / 5.61 |
| drift-recovery | 1279.73 | 10.32 | 124.0× | 328.0 / 5.87 |
| recontact | 1267.66 | 9.73 | 130.2× | 402.5 / 5.71 |
| clutch-transition | 678.34 | 10.83 | 62.6× | 119.4 / 3.91 |

Equal-scenario aggregate: **67.5×**; strict 1037.17 versus POC **15.37 CPU ms per simulated second**. New model: zero solver/endpoint iterations, four RK4 stages, 16 tire evaluations per step. The ratio measures different reduced architectures, **not equivalent solutions or a production speedup**.

| Case | Strict median / p95 / p99 step ms | POC median / p95 / p99 step ms | Largest observed strict / POC ms |
|---|---:|---:|---:|
| acceleration | 0.7153 / 1.1938 / 1.4519 | 0.0089 / 0.0233 / 0.0747 | 4.444 / 0.434 |
| steering | 0.6390 / 1.1105 / 1.4408 | 0.0076 / 0.0092 / 0.0368 | 4.369 / 0.601 |
| braking | 1.0111 / 1.6041 / 2.0698 | 0.0074 / 0.0085 / 0.0342 | 5.235 / 0.482 |
| drift-recovery | 1.1095 / 1.7375 / 2.2423 | 0.0073 / 0.0091 / 0.0398 | 6.091 / 0.554 |
| recontact | 1.2256 / 1.8232 / 2.0952 | 0.0077 / 0.0093 / 0.0503 | 3.479 / 0.475 |
| clutch-transition | 0.6557 / 1.0232 / 1.4387 | 0.0074 / 0.0091 / 0.0633 | 5.632 / 0.580 |

Worst observations are not guaranteed worst-case latency. No optimization campaign, worker or GPU work was attempted. Allocation volume and garbage collection were not separately instrumented; short-run tail times include runtime/JIT effects.

## Dynamics and accuracy

`results/comparison.json`: both methods completed all six scenarios at 1, .5 and .25 ms; no reference acceptance checks were relaxed. Strict uses the existing nested terrain solver on a **constant +1 mm plane**. POC uses a zero-height plane; reference chassis/hub heights are initialized and reported with the corresponding translation. This exercises the actual terrain path without introducing slope differences. Initial velocities and represented spring geometry match.

The initial zero-height sampler selected the inherited flat solver instead. Those separately labeled `inherited-flat-*` records are preserved, but are **not** the headline nested-solver benchmark. Validation runs overlapped some local regressions; only the separate final `timing.json` run supplies headline timing.

| Case, after 1 s | Model position difference m | POC minus strict heading rad | POC minus strict speed m/s |
|---|---:|---:|---:|
| acceleration | 0.0229524 | -5.62681e-20 | 0.0396018 |
| steering | 0.118278 | 0.010962 | -0.109629 |
| braking | 0.20712 | -5.92139e-19 | -0.078466 |
| drift-recovery | 0.178473 | -0.0898275 | -0.0634861 |
| recontact | 0.0102629 | 3.24594e-05 | -0.0563755 |
| clutch-transition | 0.00617519 | -1.12384e-20 | -0.0075135 |

Differences are meaningful, particularly braking and recovery. Prescribed steering omits the existing steering mechanism; smooth clutch/brake friction replaces stick/lock behavior, engine input dynamics differ, gearbox/carrier inertia and aligning moments are absent. Neither implementation is a calibrated real-world truth; this comparison does **not** establish physical equivalence.

| Case | 1 vs .25 ms position error, strict / POC m | 1 vs .25 ms maximum wheel-speed error, strict / POC rad/s |
|---|---:|---:|
| acceleration | 0.0002374 / 1.534e-13 | 8.984e-05 / 1.161e-11 |
| steering | 0.0003074 / 4.924e-12 | 0.0005111 / 2.075e-12 |
| braking | 0.00177 / 4.329e-08 | 3.59e-18 / 2.251e-09 |
| drift-recovery | 0.0009091 / 0.001034 | 0.003875 / 0.003683 |
| recontact | 0.0001957 / 1.171e-07 | 0.0002073 / 6.829e-08 |
| clutch-transition | 1.742e-05 / 9.77e-15 | 2.027e-05 / 2.274e-13 |

Finer-step results are convergence evidence, not an independent physical oracle. Most smooth POC cases converge very closely; recovery includes saturated friction and a strictly-after-.2 s handbrake command, so its activation is quantized differently at each timestep. Discontinuous input/contact events do not inherit smooth RK4 fourth-order accuracy. No event times are silently snapped.

Three-second mechanical checks (`results/mechanical.json`): drive reaches 1.8574 m/s; steering at .08 rad reaches .61862 rad heading change. Braking from 5 m/s with clutch open reaches .01 m/s at approximately .74245 s and 1.80320 m. At .25 ms the stopping distance changes by about 0.000000365 m; this is numerical consistency of an uncalibrated model, not real stopping-distance precision. Handbrake acts only at rear rotors and slows the vehicle. Peak pitch/roll across these cases are approximately .0742/.1133 rad, within the intended small-angle envelope. Suspension normal loads redistribute dynamically, including wheel unloading and recontact.

## Energy and tests

Analytical generalized force/velocity power pairing is checked independently by a centered finite directional derivative of total energy. Tire slip power, brake work and clutch slip work are nonpositive. Shaft-referred clutch momentum transfer and equal/opposite suspension work are tested. Five work quadratures advance at the same RK4 stages as the mechanics.

Worst three-second cumulative energy/work residual is the recontact case: **0.0006231 J at 1 ms**, **0.00001448 J at .5 ms**, **0.000003131 J at .25 ms**. Smooth drive residual falls from 4.76e-8 to 1.77e-10 J. Contact switching limits convergence order. This new integrator does not reproduce the strict reference's per-step energy-gate/rollback algorithm; its finite-state transactional publication is a weaker safeguard. A positive numerical ledger error is reported, not canceled with extra damping. Observed tire contact power never becomes positive, but this is not proof of real pneumatic-tire accuracy.

Executed:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs
# 9 passed, 0 failed
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
# 82 passed, 0 failed; includes A/B constitutive regression
node --test --test-isolation=none research/scientific-rebuild/four-corner-load-transfer/tests/*.test.mjs
# 24 passed, 0 failed
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
# PASS: 36 fixtures, 1080 bit-exact accepted states and rejected-step isolation
```

All new modules also passed `node --check`. Exact reproduction commands for measurement and summation are in [README.md](README.md). No browser test was performed: this deliverable intentionally has no browser interface.

## Capability and completion cost

Implemented here: four independent rotor and vertical wheel states, heave/pitch/roll suspension load transfer, shared combined-slip friction limit, prescribed front steering, rear fixed-ratio engine/differential torque coupling, regularized friction clutch, service brakes and rear handbrake. Same-stage force evaluation, explicit reactions and one energy ledger; no stabilizers or fabricated handling forces.

Missing: exact clutch/brake sticking and holding, manual gear events, differential/carrier/input-shaft inertias, complete engine lifecycle/input filtering, dynamic steering/aligning moments, terrain slopes and collision events, finite-angle/gyroscopic coupling, full tire transient/calibrated behavior, UI/rendering/inherited laboratory features. The README specifies the reduced equations and constants. Existing simulators continue to supply their own capabilities unchanged.

Completion is **substantial mechanical and validation work**, not adding a renderer: stiff/locked constraint event handling, consistent shaft/housing inertia reduction, terrain/finite-travel contact, mechanism interfaces, and broad convergence/regression validation must each be resolved. Their CPU cost is unmeasured; the present timing cannot be extrapolated to a completed architecture. A defensible engineering schedule cannot be inferred from this bounded experiment. No claim that 67.5× survives completion.

Smallest justified next step, if separately authorized: isolate exact clutch stick/slip and zero-speed brake holding in this same reduced energy ledger, measuring their physical and CPU cost before adding any other mechanism. **Not implemented here.** Preserve the strict reference; do not integrate this POC into production.
