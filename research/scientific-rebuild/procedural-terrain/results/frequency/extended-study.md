# Extended frequency verification and default recommendation

Default recommendation: **retain 1000 Hz as the compatibility/reference default**. No lower rate is certified as an equivalent replacement for tire transients. Stability and closed energy ledgers do not preserve physical damping. Even the reference rate has numerical damping; it is not ground truth. No mass, stiffness, physical damping, contact law, force/work tolerance or endpoint iteration limit was changed.

## Sustained vehicle advancement

Same 180 s analytic input schedule at each rate, evaluated at `i/hz` rather than an accumulated floating-point time. Engine/gear state is an explicit stationary first-gear running-engine fixture, not an engine-start demonstration. Throttle, braking, countersteering and handbrake use the existing actual coupled vehicle. These driving traces predate selector-stop refinement; no stop force is applied in this protocol. The later selective refinement and its real solve counts are documented in selector-stop-study.md. Times include shared-machine load, so they are throughput observations rather than isolated tail-latency promises.

| Hz | Completed seconds | Wall seconds | Sim / wall | Peak residual J | Signed accumulated residual J | Endpoint iterations |
|---|---:|---:|---:|---:|---:|---:|
| 1000 | 180.0 | 121.26 | 1.48 | 5.39e-09 | 9.7e-07 | 736064 |
| 500 | 180.0 | 79.94 | 2.25 | 1.08e-08 | 1.01e-06 | 434124 |
| 250 | 180.0 | 62.47 | 2.88 | 2.17e-08 | 1.06e-06 | 286465 |
| 200 | 180.0 | 59.32 | 3.03 | 2.71e-08 | 1.07e-06 | 252289 |
| 100 | 180.0 | 57.65 | 3.12 | 5.47e-08 | 1.19e-06 | 225592 |

All five complete with zero numerical faults. The traces contain one-second speed/load/pitch/roll/engine-mode samples and full-step residual extrema. They are not full long-duration position/heading/rotor trajectories.

## Independent suspension reference and measured production decay

Use the actual reference masses, spring, damper and tire stiffness from `createVertical`. For symmetric heave, M=diag(80,24) kg, K=[[8000,-8000],[-8000,88000]] N/m, C=[[320,-320],[-320,320]] Ns/m. Solve continuous poles from the 4×4 first-order system; no fitted vehicle parameters are substituted. The low/high continuous damping ratios are 0.173189 / 0.116322, damped frequencies 1.50244 / 9.52164 Hz. This is an illustrative model, not measured-car accuracy.

For the implemented linear all-contact vertical discretization, D=(M+h*C+h²*K/2)^-1, v1=D*(M*v0-h*K*q0), q1=q0+h*v1. Eigenvalues of this discrete update give numerical decay through log(lambda)/h. The analysis independently verifies spring work, damping and the backward-Euler kinetic loss identity for every rate. Energy closure explicitly includes that numerical loss; it does not make it disappear.

Production tests displace the sprung heave by 10 mm (four seconds) or all four wheels by 1 mm (one second) on the supported terrain, with the engine off. Wheel oscillation is sampled at 50 Hz. Least-squares decay fits match the independent discrete-pole predictions; the analysis asserts <0.5% relative mismatch for the low mode and <2% for the high mode. Pitch/roll subsystem predictions exclude tangential tire coupling and are not claimed as independent full-vehicle pitch/roll eigenmodes.

| Hz | Measured body-heave damping ratio | Measured wheel-heave damping ratio | Wheel ratio error vs continuous reference |
|---|---:|---:|---:|
| 4000 | 0.173776 | 0.119927 | 3.10% |
| 2000 | 0.174335 | 0.123518 | 6.19% |
| 1000 | 0.175470 | 0.130649 | 12.32% |
| 500 | 0.177735 | 0.144697 | 24.39% |
| 250 | 0.182244 | 0.171807 | 47.70% |
| 200 | 0.184484 | 0.184809 | 58.88% |
| 100 | 0.195541 | 0.243531 | 109.36% |

100 Hz approximately doubles the high-mode damping ratio relative to the continuous illustrative model. Coarser rates are therefore not physically transparent performance settings. Do not retune the physical damper to cancel numerical damping. A future lower-cost, higher-order integration proposal would need a joint position/contact-work derivation and the same rollback/constraint checks, not a post-solve coordinate correction.

## Component trajectories and events

`components-one-second.json.gz` adds an incline/downhill case and a smooth localized bump, giving 54 one-second production runs. The incline uses a 0.001 gradient with neutral/clutch open; the bump is a 1 mm analytic Gaussian with exact gradients and a consistent respawn, then rolling initialization. The files retain SI-separated errors in position, heading, velocity, yaw, wheel/engine speed, wheel height, attitude, normal load, kinetic/potential energy and dissipation against the 2000 Hz reference. Component energy excludes the pressure-plate axial subsystem; that has its own ledger. No assumption that the 2000 Hz reference is ground truth is made.

At matched 0.1 s samples, recontact normal-load differences vs 2000 Hz reach 7.25 / 21.32 / 47.64 / 59.81 / 111.83 N at 1000/500/250/200/100 Hz. These include event phase and are not all-step peak-force differences. A low energy residual alone would miss them. Dense contact-event timing and application-specific load-error acceptance gates are still required before endorsing a coarse rate.

The separate four-second starter study includes 4000 Hz refinement. Engine firing is decided at the beginning of a step; files distinguish decision time, state observation time and the preceding threshold-crossing bracket. Decisions are approximately 1.822 s (1000/500 Hz), 1.820 s (250/200/100 Hz), versus 1.82175 s at 4000 Hz. This resolves a specific neutral-start case, not clutch/selector event certification. The inherited fixed 1 ms impact-force average is now explicitly labelled in the UI; physical impulses are unchanged.

## Browser, regression and unresolved gates

52 Experiment 11 tests and 24 unchanged Experiment 10 tests pass. Chromium verifies all selectors preserve state during switching and actually advance flat/road vehicles with the selected h and correct accepted-time accounting. Existing experiments and the public simulator remain unchanged.

The prior hardware probe still reports SwiftShader and no GPU device. Real per-frequency software-rendered engine-start/driving pilot traces are now retained in selector-stop-study.md; hardware-rendered driving/frame-time/allocation benchmarks remain outstanding; software/browser regressions are not a claim of RTX or real-GPU throughput. Additional remaining gates: dense clutch/selector event comparisons, constant-speed cornering with a justified driver protocol, long-duration full-state trajectory comparisons, independent component error acceptance requirements and hardware-GPU performance. Supported seed/amplitude/roughness bounds remain unchanged.

## Reproduction

```sh
PHYSICS_HZ=500 SOAK_SECONDS=180 node research/scientific-rebuild/procedural-terrain/tools/soak.mjs
node research/scientific-rebuild/procedural-terrain/tools/event-frequency.mjs
node research/scientific-rebuild/procedural-terrain/tools/driving-frequency.mjs
STUDY_CASES=stationary,heave,pitch,roll STUDY_HZ=4000,2000,1000,500,250,200,100 STUDY_SECONDS=4 node research/scientific-rebuild/procedural-terrain/tools/driving-frequency.mjs > /tmp/osc.json
STUDY_CASES=wheel-heave STUDY_HZ=4000,2000,1000,500,250,200,100 STUDY_SAMPLE_HZ=50 node research/scientific-rebuild/procedural-terrain/tools/driving-frequency.mjs > /tmp/wheel.json
python3 research/scientific-rebuild/procedural-terrain/tools/modal-frequency.py /tmp/osc.json /tmp/wheel.json
```

NumPy and SciPy are analysis-only dependencies; they are not required by the application.

## Fidelity-preserving query optimization

After these measurements, production terrain evaluation was changed to reuse samples only at the exact same candidate endpoint. Cached/uncached actual vehicle states and contacts are bit-identical at all five selectable rates. For 0.1 s coupled driving tests, terrain queries drop from 16,544 to 10,544 at 1000 Hz and from 5,440 to 3,400 at 100 Hz. This is deterministic work reduction, not an approximation. The 180 s timing table above predates this extra optimization.

A separate 1000-step acceleration/steering probe gives uncached/cached mean 1.700/1.498 ms, p95 4.554/3.356 ms, but median 1.001/1.020 ms. Shared rendering load makes the timing difference inconclusive; no stable median-latency gain is claimed. Raw probes are retained.

See [selector-stop correction and live pilot timings](selector-stop-study.md) for the coarse-step failure, bounded rollback-safe refinement and explicit internal work accounting.
