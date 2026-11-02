# Mission 17 — isolated coupled-step experiment

**Recommendation: do not integrate this prototype.** It reproduces the tested
reference dynamics and preserves the acceptance checks, but complete steps cost
**2.76× more CPU than strict** and **3.50× more than balanced**, with worse tails.
This is an evidence-based cost/robustness/complexity decision, not a numerical
speed threshold. Keep the existing nested strict/balanced path for vehicle work;
park the joint prototype rather than entering another optimization cycle. Balanced
remains an explicit opt-in; the default is still strict.

Base `8cb9413e3936e51502f6ac53d036a769ad8846e2`, same existing branch
`scientific-rebuild/12-braking-and-tire-contact`. All additions are under this
research directory. Production, previous experiments and all historical fixtures
remain byte-identical. No browser integration or second parallel vehicle runs.

## Complete-step profile

32 short source runs cover A/B, strict/balanced, acceleration, saturated slip,
drift recovery, braking, recontact, clutch locking, stall and selector rejection.
Measured stage **wall** time: setup8.3%, trial copying6.7%, terrain/reactions8.7%,
unified contact solve71.9%, energy/endpoint validation4.5%. Profiling includes its
own timers; uninstrumented repeated runs provide the performance comparison.

Repeated setup, copies, terrain sampling, row/Hessian construction and solving
both locked/sliding clutch candidates occur inside roughly five endpoint trials.
However most geometry-dependent work is not a reusable constant. A joint method
must either differentiate that coupling or spend iterations resolving it. Mission
16's cheap frozen-QP Newton result alone does not establish full-step savings.

## Derivation: one joint nonlinear method

Let `a` be eleven endpoint generalized velocities (body longitudinal/lateral,
yaw, column, heave, pitch, roll and four hub velocities) and `z` the16 contact/
brake/steering/clutch impulses. The other seven rotor/selector velocities are
eliminated exactly using the source's momentum map.

At proposed `a`, use the original endpoint kinematics, `q1=q0+h*v1`, world
translation/yaw quadrature, end steering linkage, discrete terrain-normal
potential gradient, midpoint spring compression and endpoint damping. This gives
`N(a)`, terrain frames, `J(a)`, and

```
v_target(a,z) = v_free(a) - M^-1 J(a)' z
D(a) = J(a) M^-1 J(a)' + C
rhs(a) = J(a) v_free(a) + bias
G(a,z) = a - select_geometry(v_target(a,z))
H(a,z) = z - P_C(a)(z + (rhs(a)-D(a)z)/L(a))
```

Solve `[G,H]=0` jointly (27 unknowns), rather than solving a complete QP inside
each endpoint fixed-point iteration. For frozen geometry, H is exactly the
original convex QP optimality map. With load-dependent friction discs this is a
**nonlinear, state-dependent feasible-set problem**, not one globally convex QP.
A unique global root/convergence guarantee is not established.

One damped block semismooth Newton solver is implemented. Impulse columns use
analytic projection derivatives from Mission16; geometry columns use centered
finite differences with cube-root-machine-epsilon increments. All residuals
re-evaluate actual terrain, loads, bounds and contact rows; no stale load or
force model is accepted. Scalar pivoted elimination uses1e-12 search-direction
regularization only. Maximum20 Newton updates and12 Armijo trials bound failure;
there is no inner FISTA solve, recursive refinement or fallback to a slower
solver to conceal nonconvergence. Trial impulses are projected onto current
constraints. Initial guesses use entry velocities/accepted impulse history.

The source clutch modes are enumerated with unchanged capacity, slip sign and
work-admissibility rules. All physical masses, inertias, coefficients and force
laws remain unchanged, including the existing entry-time tire frame/torque and
B-coefficient policy. Constant setup is precomputed privately once per candidate.

`generate.mjs` creates an isolated source adapter with only probe/supplied-solver/
mode hooks, and a source-derived atomic publication/subdivision wrapper. Original
physical updates and acceptance guards remain verbatim. Unit tests compare
reduced assembly against that original-code probe at perturbed endpoints and
all clutch modes. Generated-source hashes are in `results/provenance.json`.

## Correctness, saturation and transitions

The initial35ms screen found eight independent KKT-check failures despite passing
original energy/constitutive guards. Applying the same certificate to the source
FISTA cases found none. **No certificate threshold was relaxed:** the independent
certificate was added as a required joint termination condition before final
validation/benchmarking. `initial-screen.json` preserves the finding.

Final validation: **32 complete joint trajectories**, 13,800 accepted joint
steps: seven dynamic scenarios × A/B × strict/balanced at0.35s, plus1s braking.
All accepted-state samples are finite; independent certificate failures: **0**.
There are **2,058 saturated tire force stages** in these trajectories, closing
Mission16's saturation coverage gap. These include large initial sideslip,
rear overspeed and a handbrake interval, not a scripted yaw or tire animation.

Largest joint-minus-matched-reference differences:

| Quantity | Measured maximum |
|---|---:|
| World position | 9.206e-11m |
| Heading | 2.957e-12rad |
| Body velocity component | 6.904e-10m/s |
| Yaw rate | 3.475e-11rad/s |
| Wheel speed | 1.264e-9rad/s |
| Tire force component | 7.878e-7N |
| Normal load | 1.783e-7N |

These are numerical differences in the existing synthetic reduced model, not
claims of real-car accuracy at these scales. Engine/clutch/gear event logs match
on the1ms grid, including opening/re-engagement and stall. Braking distance is
2.067528m in both methods (0.01m/s stop threshold with interpolation); timing
interpolants do not imply sub-timestep event resolution.

Maximum full energy residual7.886e-8J (<unchanged1e-7J), constitutive impulse
residual1.564e-10Ns (<unchanged2e-8Ns), friction excess1.14e-13N (roundoff).
Independent maximum KKT residual6.854e-10 is within the unchanged per-problem
certificate bound. Original finite/power/constitutive checks, local work identity,
endpoint position tolerance and complete-step energy checks remain active.

Corrected dedicated `transitions.json` is authoritative for gear events: both
A/B non-flat selector cases reject at6ms with state/history rollback. Flat
neutral-to-first shifts **delegate the original path**, remain bit-exact and
actually engage first; no joint-solver gear-event speedup is claimed. Legacy
transition rows in `validation.json` are excluded from joint-trajectory totals.
Subdivision tests verify exact requested elapsed time, observer coverage and
atomic rollback after a later rejected substep. Unsupported non-flat gear events
were not silently implemented or skipped.

## Complete-step performance and decision

Node24.19.0, Linux x64, Intel Xeon Platinum8573C, five exposed logical CPUs/shared
host. CPU=user+system process time; per-step latency is wall time. No renderer or
GPU is involved. Seven scenarios × A/B × both accuracies × five repetitions,
first warmup; method order alternates. Each method has6.72 measured simulated
seconds per accuracy. Both start from identical states/inputs. Step timers include
all setup, cloning, Jacobians, linear solves, line searches, checks and publication;
whole-run CPU additionally includes common trace/event extraction. Independent
external capture/snapshots are disabled for these performance runs; the mandatory
internal KKT termination check is included in joint cost.

| Accuracy/method | CPU ms/simulated s | Median step ms | p95 ms | p99 ms | Worst observed ms |
|---|---:|---:|---:|---:|---:|
| Strict reference | 1857.53 | 1.412 | 2.055 | 2.440 | 131.90 |
| Joint/strict | 5125.46 | 2.887 | 4.598 | 7.692 | 307.71 |
| Balanced reference | 1371.99 | 1.073 | 1.706 | 2.130 | 129.30 |
| Joint/balanced | 4808.52 | 2.809 | 4.121 | 6.289 | 401.20 |

Quantiles are medians of per-run quantiles. Maxima are observed outliers, not
WCET; their causes were not isolated. No hardware-independent latency guarantee
is inferred. Joint performs zero FISTA iterations, yet needs **45.1/40.9 terrain
and problem evaluations per step**, versus5.68/5.03 reference endpoint trials.
Numerical geometry differentiation, matrix rebuilding, allocations and dense
27-variable factorization outweigh eliminated FISTA work. Iteration counts alone
would give a misleading positive verdict.

**Do not integrate.** The local nonlinear formulation is mathematically defensible
and numerically agrees in the bounded tests, but this implementation has no
measured complete-step advantage and adds considerable complexity. The recommended
next step is to retain the existing balanced nested solver and park this prototype;
no further optimization pass is justified under this mission.

## Limits and reproduction

Tests use1ms, road seed42/amplitude1mm/roughness0.1, A and B at0.5m/s floor.
Longer runs, material discontinuities, other terrain envelopes, reverse/standstill
assistance and arbitrary active-set histories are not certified. Finite-difference
geometry Jacobians and semismooth contact changes give no global robustness
proof. All failed steps preserve their last accepted state; there are no resets,
artificial stabilizers, changed parameters or dropped simulation time.

From repository root, without a new branch:

```sh
node research/scientific-rebuild/coupled-step-challenge/generate.mjs
node --test --test-isolation=none research/scientific-rebuild/coupled-step-challenge/test.mjs
node --test research/scientific-rebuild/contact-solver-challenge/test.mjs
node research/scientific-rebuild/coupled-step-challenge/profile.mjs
DURATION=.35 CERTIFY=1 ROLLBACK=1 TRACES=1 OUT=validation node research/scientific-rebuild/coupled-step-challenge/compare.mjs
DURATION=1 CASES=braking CERTIFY=1 ROLLBACK=1 TRACES=1 OUT=braking node research/scientific-rebuild/coupled-step-challenge/compare.mjs
DURATION=.02 CASES=selector,flat-shift CERTIFY=1 ROLLBACK=1 OUT=transitions node research/scientific-rebuild/coupled-step-challenge/compare.mjs
DURATION=.12 REPEATS=5 CASES=acceleration,saturated,drift-recovery,braking,recontact,clutch-lock,stall OUT=performance node research/scientific-rebuild/coupled-step-challenge/compare.mjs
node research/scientific-rebuild/coupled-step-challenge/check-reference.mjs
python3 research/scientific-rebuild/coupled-step-challenge/summarize.py
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
```

Run timing comparisons serially. Six coupled tests and five reused mathematical
tests pass; the unchanged1,080-state A exact replay passes. `results/summary.json`
contains unit-separated errors and counts; raw repeated results, sampled traces
and source hashes are retained. Traces store every10th1ms diagnostic point to
bound size; reported comparison maxima use every accepted1ms sample. No previous
benchmark artifact was regenerated or overwritten.
