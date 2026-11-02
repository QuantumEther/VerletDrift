# PERFORMANCE: exact clutch and brake constraints

Implemented on **PERFORMANCE**, base `9a8593a152584bc513334f7a0981a34f8ed984cd`.
All historical source, fixtures and results remain unchanged. New files are
confined to this fast-vehicle POC. No production integration, branch campaign,
gearbox, terrain, steering or rendering changes. Original `model.js` remains the
smooth-friction benchmark; explicitly import `constrained-model.js` for this experiment.

## Mechanical method

`constraints.js` integrates five rotors under frozen external torques: four wheel
inertias and one engine inertia. Front brakes are independent scalar constraints;
the engine and rear brakes are solved **together**, preserving the ideal open
differential relation. With g=G/2, clutch slip is
`omegaEngine-g*(omegaRL+omegaRR)`. Reaction equations are:

```
Iw * dot(omega_i) = torque_i + (rear ? g*Tc : 0) - brake_i
Ie * dot(omegaEngine) = torqueEngine - Tc
```

At nonzero spin/slip, friction has its full opposing capacity. At zero, the
reaction is in the static interval and enforces zero acceleration when feasible.
Brake and clutch static/kinetic capacities are equal (ideal Coulomb friction).
Clutch capacity is unchanged rated 30 Nm times requested engagement; brake
capacities reuse the unchanged hydraulic/cable law. No tanh brake/clutch force,
RPM assignment, arbitrary synchronization threshold or artificial damping.

For a trial Tc, each static rear brake is obtained by clipping the effective axle
torque to its capacity. Clutch slip acceleration S(Tc) is continuous, strictly
decreasing and piecewise affine. Its zero, clipped to the clutch capacity,
requires at most five affine intervals (four rear-brake breakpoints), **no root
iteration or optimizer**. Moving-wheel brakes/slipping clutch have fixed signs.

Within each constant-force regime, angular velocities are affine in time. Advance
to the earliest wheel-stop or clutch-slip-zero event, solve reactions again, and
finish the remaining time. A hard **16-segment limit per flow** rejects unresolved
problems; full vehicle state/time/diagnostics remain unpublished on failure.
The independent 1,000-case challenge observed at most five segments. Vehicle
benchmark `segments` fields count the **corrector flow only**; a predictor flow
is also executed and included in all CPU timings.

Clutch-only exchange conserves shaft-referred momentum
`Ie*omegaEngine + Iw/G*(omegaRL+omegaRR)`; rear wheel-speed difference is not
artificially locked. For no external torques, full engagement heat is independently
checked against `0.5*slipInitial^2/(1/Ie+G^2/(2*Iw))`.
Brake heat is the integral of brake torque times wheel speed; clutch heat is the
integral of Tc times slip. Both are nonnegative. Each affine segment integrates
these quantities exactly, with external work and rotor kinetic-energy checks.
Stopping may release again under an excessive applied torque, in either direction.

Only roundoff-sized zero/root canonicalization is permitted, including concurrent
brake and clutch rows. The velocity correction is bounded by 128 machine epsilons
times rotor-speed scale; larger corrections are rejected. A mass-weighted
projection respects wheel zeros, followed by an exact stored clutch-row relation.
Roundoff energy is reported separately, not hidden in a damping term. Rotor
energy checks scale with represented kinetic energy to account for cancellation.

## Whole-vehicle time level and scope

`constrained-model.js` uses an **explicit midpoint body/contact step**, with exact
frozen-torque rotor flows for its half-step predictor and full-step corrector.
The predictor does not commit work or advance physical time. Same-stage tire
forces and normal loads remain the original four-wheel combined-friction law;
clutch/brake reactions and wheel spin are replaced together, without a second
suspension or a competing chassis velocity. Rotor external-work integrals replace
the corresponding engine/tire work terms; brake/clutch heat is counted once.

This localized integrator adaptation is deliberately selectable. It is **not**
the old RK4 scheme, nor an exact integration of the force-varying coupled vehicle.
The usual midpoint truncation error and contact/engine discontinuities remain.
The new solution exactly holds the frozen rotor constraints, not an implicitly
converged endpoint tire/terrain system. No existing acceptance gate was relaxed.
The new POC retains its own finite-state/rotor-work transactional checks, not the
strict reference's full-step energy gate. Existing synthetic suspension, tire,
engine torque and geometric parameters were not tuned.

Preserved limitations: fixed gear, ideal massless open differential, reduced
small-angle body kinematics, omitted shaft/housing gyroscopic dynamics, prescribed
steering, flat plane, uncalibrated velocity-slip tires and incomplete engine
lifecycle. Angular momentum claims apply to the reduced shaft coordinates, not
full 3D chassis/housing mechanics. This is **static wheel-brake holding**;
velocity-based tires still lack true static road friction, so arbitrary hill or
external chassis-force holding is not established. Chassis stopping is reported
at 0.01 m/s, not claimed to be exact zero body velocity.

## Validation and reproducibility

From repository root, Node v24.19.0, no new dependencies:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs research/scientific-rebuild/fast-vehicle-poc/constraints.test.mjs
# 19/19 PASS: original smooth-model tests plus 10 new test groups
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
# 82/82 PASS, including A/B constitutive tests
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
# PASS: 36 fixtures, 1,080 bit-exact accepted states + rejected-step isolation
# Run separately, with other local tests stopped:
node research/scientific-rebuild/fast-vehicle-poc/constraint-benchmark.mjs
```

New tests cover independent analytical momentum/heat fixtures; slip, lock,
capacity release, reopening, brake stopping/holding/release in both directions;
simultaneous engine/clutch/brake constraints and asymmetric rear breakaway;
**243 static problems checked by independent dense 27-face enumeration**;
1,000 fixed-seed impulse/work tests; starter-driven vehicle holding, dynamic
wheel lock, rear handbrake, symmetry, reverse braking, deterministic replay,
transactional invalid-state rejection, energy and timestep refinement.
All new JS files also passed `node --check`. No browser test or UI change.

`results/constraints/benchmark.json` records all 84 timing runs and 63 refinement
trajectories: seven cases, three models, 1/.5/.25 ms. Every requested trajectory
completed. Locked speed residual was **exactly zero** in recorded locked states;
maximum rotor energy residual was **4.81e-13 J**, maximum roundoff velocity
correction **1.42e-14 rad/s**. Combined friction utilization never exceeded one;
no positive instantaneous tire power or positive step contact work was recorded.

## Complete-step performance

Node 24.19.0 / Linux, Xeon Platinum 8573C, five exposed logical CPUs with four
CPU-equivalents quota on a shared host. **Headless CPU only**, no GPU/FPS claims.
One second per case at 1 ms, four repetitions, first discarded, rotated method
order; median of three remaining run statistics. Whole-run process CPU includes
stepping and common state extraction; per-step wall time excludes extraction.
Refinement, initialization and serialization are outside timing. Final timing
had no concurrent local test jobs. Cloud/JIT/GC noise remains; no latency guarantee.
Strict uses the genuine nested path on a constant +1 mm flat plane; POC uses a
zero-height plane with matched, translated initial geometry. This avoids the
inherited zero-height flat dispatch. No strict tolerances or safeguards changed.

| Case | Smooth CPU ms/sim s | Constraints CPU ms/sim s | Strict CPU ms/sim s | Constraint/smooth | Strict/constraint |
|---|---:|---:|---:|---:|---:|
| acceleration | 13.40 | 46.46 | 1503.34 | 3.47× | 32.4× |
| steering | 13.66 | 38.61 | 1133.54 | 2.83× | 29.4× |
| braking | 20.02 | 37.79 | 1569.01 | 1.89× | 41.5× |
| drift-recovery | 10.79 | 35.42 | 1659.09 | 3.28× | 46.8× |
| recontact | 11.69 | 19.60 | 1606.79 | 1.68× | 82.0× |
| clutch-transition | 10.02 | 41.89 | 912.64 | 4.18× | 21.8× |
| hold-release | 10.74 | 40.09 | 764.05 | 3.73× | 19.1× |

Equal-scenario mean: **12.90 → 37.13 CPU ms/sim s**, a **2.88× cost (+187.7%)**. Strict: 1306.92 ms/sim s; remaining throughput ratio **35.2×**. These are ratios of aggregate CPU costs, not averaged ratios. Incremental cost includes the changed outer integrator; it does not isolate the constraint kernel. The model remains reduced and is not physically equivalent to the strict reference.

| Case | New median / p95 / p99 step ms | Worst new step ms |
|---|---:|---:|
| acceleration | 0.0138 / 0.0883 / 0.2210 | 0.761 |
| steering | 0.0147 / 0.0609 / 0.1795 | 3.056 |
| braking | 0.0133 / 0.0404 / 0.1127 | 1.091 |
| drift-recovery | 0.0153 / 0.0409 / 0.1227 | 0.328 |
| recontact | 0.0130 / 0.0204 / 0.1096 | 0.475 |
| clutch-transition | 0.0172 / 0.0622 / 0.1895 | 0.976 |
| hold-release | 0.0157 / 0.0443 / 0.1270 | 1.269 |

Raw records also retain smooth/strict latency statistics and trajectory differences.
Worst observed latency is not WCET. No memory/GC attribution or kernel-only timing
was performed. The observed overhead is retained for correctness; no further
optimization campaign was undertaken.

## Accuracy cost and decision

New-model braking from 5 m/s reaches 0.01 m/s at **0.78127 s / 1.91288 m**,
versus smooth **0.78870 s / 1.86083 m**, strict **0.83910 s / 2.06748 m**.
Exact dry friction changes the dynamics; these are not equivalent-solution timing
comparisons, nor measured real-car stopping distances.

| Case | New max cumulative work residual, 1 / .5 / .25 ms (J) | New position difference, 1 vs .25 ms (m) |
|---|---:|---:|
| acceleration | 8.8952e-06 / 2.145e-06 / 5.2728e-07 | 9.0697e-09 |
| steering | 0.00028653 / 7.0276e-05 / 1.74e-05 | 7.4935e-08 |
| braking | 0.00084785 / 0.00020451 / 5.0274e-05 | 2.0917e-06 |
| drift-recovery | 0.0029925 / 0.00076367 / 0.0001904 | 5.2779e-06 |
| recontact | 0.0056656 / 0.0012497 / 0.00020549 | 1.3596e-07 |
| clutch-transition | 5.01e-06 / 1.002e-06 / 2.4555e-07 | 4.0853e-07 |
| hold-release | 3.7107e-06 / 9.134e-07 / 2.2665e-07 | 2.4569e-08 |

The new worst energy/work error is **0.00567 J** in recontact at 1 ms, decreasing
to **0.000205 J** at .25 ms. The old smooth-model recontact error in this exact
workload was 0.000603 J at 1 ms: whole-vehicle energy accuracy **regressed** despite
accurate rotor accounting. It is not corrected by extra damping or relaxed strict
reference checks. Smooth cases exhibit expected second-order midpoint refinement;
discontinuous contact and engine conditions limit clean order estimates.
New 1 vs .25 ms final position differences remain below 5.3e-6 m in these cases;
these are self-refinement results, not proof of real-world fidelity. Mode/event
histories and wheel-speed/yaw differences are saved in the raw JSON.

**Decision:** retain this isolated, explicitly selectable constraint prototype.
Its local clutch/brake mechanics pass the independent checks and retain substantial
CPU headroom; whole-vehicle integration accuracy is a visible trade-off, so this
is not approved as a production replacement. All old implementations remain intact.
**Next priority:** a bounded check of contact/constraint time-level consistency and
whole-step energy accuracy through recontact before expanding mechanical features.
Do not start that work in this task.
