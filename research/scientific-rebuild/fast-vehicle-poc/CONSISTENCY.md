# Contact/constraint consistency — PERFORMANCE

**Result:** work-consistent coupling passes the bounded numerical checks, with
substantial measured CPU headroom. No production integration. Existing
`model.js`, `constrained-model.js`, `constraints.js`, strict sources and historical
fixtures/results remain unchanged. Select the corrected step explicitly:

```js
import {create, step, energy} from './consistent-model.js';
```

Branch: **PERFORMANCE**; base `5f6683b84b1bf0900ea596fa270e9e5983dee2aa`.
The containing Git commit identifies delivery; `results/consistency/provenance.json`
records exact new-source hashes and data provenance. No new branch or features.

## Diagnosis: state updates and work used different velocities

| Quantity | Previous constrained step | Corrected step |
|---|---|---|
| Body contact velocity | explicit predicted midpoint | actual endpoint-average velocity |
| Tire-law wheel velocity | predicted half-step rotor speed | exact rotor travel / h |
| Rotor torque work | exact rotor travel (already correct) | same travel used by force law and ledger |
| Body/vertical position | h times predicted velocity | h times endpoint-average velocity |
| Suspension force/loss | predicted q/v | endpoint-midpoint q/v |
| Normal support | penetration at predicted midpoint | discrete gradient of existing unilateral elastic energy |

The old body impulse was h*F_mid, but its kinetic-energy change pairs that impulse
with `(v0+v1)/2`, not the predicted velocity. Rotor work was correctly integrated
through brake/clutch events, yet tire forces were chosen from a different rotor
velocity. Positions and spring/normal forces also failed the potential-energy
work identity, especially when contact appeared/disappeared. Changing only the
reported work would disguise these state-update errors.

`trace-time-levels.mjs` independently reconstructs the old work defect as the sum
of body kinetic-work and potential-work defects. In its isolated engine-off,
clutch-open recontact case, the final -0.00523421945 J defect splits into
-0.00160607056 J kinetic and -0.00362814889 J potential defects. Their independent
sum agrees with the old ledger at roundoff. These diagnostic inputs intentionally
differ from the full benchmark; both are saved and reproducible.

## Correction: one shared stage, no optimizer

For the existing normal elastic potential
`Phi(z)=0.5*kt*max(R-z,0)^2`, use
`Nbar=-(Phi(z1)-Phi(z0))/(z1-z0)`, with the analytical derivative for coincident
endpoints. The implementation uses factored expressions, never an epsilon to hide
a singularity. For compression at both endpoints this is ordinary midpoint
support; at contact crossing it includes the correct elastic energy change.
Both-airborne endpoints give exactly zero support. This is a discrete integration
of the existing potential, not a new contact parameter or artificial force.

One bounded Picard loop closes four normal and eight tangent force components.
Each trial solves the seven-coordinate linear midpoint suspension system, advances
planar impulses, executes the **unchanged** exact five-rotor flow, then evaluates
the unchanged combined-slip law using work-conjugate averages. Body heading uses
its endpoint midpoint; rotor average is exact integrated travel/h, including lock
and stop events. Engine external torque retains the previous predicted-midpoint
sample and its exact rotor-travel work; no engine redesign is included.

The vertical matrix is `M+h*C/2+h^2*K/4`, Cholesky-factored **once per step**,
with triangular substitution per trial. No FISTA, QP, numerical tire root, repeated
large matrix construction or nested terrain-endpoint loop. This **is** a shared
vehicle force-consistency iteration, not a claim of zero coupling work. At most
24 force trials; failure rejects the step. Observed maximum: twelve. All trial
and predictor rotor segments are counted in the new timing records. Existing
16-segment rotor-flow cap remains unchanged. No silent retries, timestep changes,
time drops or adaptive subdivision.

Convergence requires every support/tangent component to agree within **1e-11 N**.
Friction excess is bounded at **2e-11 N** and tangential contact work must satisfy
a roundoff/residual-scaled passivity check. These are numerical consistency bounds,
not fitted handling tolerances. Normal loads in `s.consistency.normal` and its
forces are **step averages**, not instantaneous endpoint observations; support can
remain positive over a step ending airborne because that step released stored
compression energy. Instantaneous endpoint loads can still be read from state.

With q1-q0=h*vbar, midpoint suspension forces give exact quadratic spring work;
the support secant gives exact unilateral tire spring work. One tire impulse
applies body force/moments and wheel reaction torque. Thus

```
Delta E = Te*integral(omegaEngine dt)
        + h*sum(Fx*averageSlipX + Fy*averageSlipY)
        - brakeHeat - clutchHeat - h*sum(c*relativeSuspensionVelocityBar^2)
        + rotor-roundoff + force-closure roundoff.
```

No residual is added to a work term, state energy, torque or damping. A new
whole-step guard checks this identity independently of convergence. Its bound is
1024 machine epsilons times energy/work scale, plus support-force residual times
wheel vertical travel. Nonfinite energy is rejected even if all state components
are individually finite. All state, time and diagnostics publish only after every
guard passes; failed force closure and invalid-input snapshots remain unchanged.

## Executed validation

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs research/scientific-rebuild/fast-vehicle-poc/constraints.test.mjs research/scientific-rebuild/fast-vehicle-poc/consistency.test.mjs
# 29 PASS / 0 FAIL: original smooth/constraint tests plus ten consistency groups
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
# 82 PASS / 0 FAIL, including A/B constitutive regression
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
# PASS: 36 fixtures, 1080 bit-exact accepted states and rejected-step isolation
node research/scientific-rebuild/fast-vehicle-poc/trace-time-levels.mjs
# Run benchmark separately with other local tests stopped:
node research/scientific-rebuild/fast-vehicle-poc/consistency-benchmark.mjs
```

All new modules also passed `node --check`. The new tests independently check
support-energy secants, an analytical combined-slip fixture and unchanged tire
transcription, linear/angular impulse balance, spring/damper reaction balance,
directly calculated mechanical energy and work, brake holding/release, rear wheel
lock, exact clutch equality, recontact, braking, recovery, timestep refinement,
determinism, and transactional rejection of nonconvergence/nonfinite energy.

All **84 timing runs and 63 refinement trajectories completed**. Seven cases,
three methods, and 1/.5/.25 ms. Recorded locked-clutch speed residual remains
**exactly zero**. Static wheel brakes remain exact; body equilibrium has only
roundoff-scale drift, without a reset/clamp. Rotor heat, impulse and work checks
remain unchanged. Maximum observed averaged friction excess was approximately
5e-13 N. Positive discrete contact work was at most about 1e-69 J (roundoff near
zero), below the independently derived passivity bound.

## Accuracy before/after

Maximum cumulative energy/work residual over one second, at 1 ms:

| Case | Previous J | Corrected J |
|---|---:|---:|
| acceleration | 8.89521e-06 | 6.82121e-13 |
| steering | 0.000286528 | 8.6402e-12 |
| braking | 0.000847851 | 3.18323e-12 |
| drift-recovery | 0.0029925 | 6.30962e-12 |
| recontact | 0.00566559 | 6.82121e-13 |
| clutch-transition | 5.01001e-06 | 5.91172e-12 |
| hold-release | 3.71068e-06 | 5.27134e-13 |

Across all corrected rates/cases, the largest cumulative work residual was below
2e-11 J. It is now at the floating-point accumulation floor; reducing h is not
expected to produce a clean error-order curve for this accounting residual.
**Energy closure is not proof of trajectory accuracy or real-world fidelity.**

| Case | Corrected final position difference vs .25 ms, 1 / .5 ms (m) | Max wheel-speed difference vs .25 ms, 1 / .5 ms (rad/s) |
|---|---:|---:|
| acceleration | 4.4813e-09 / 8.962e-10 | 5.8232e-07 / 1.1647e-07 |
| steering | 3.6678e-08 / 7.3356e-09 | 1.8574e-07 / 3.715e-08 |
| braking | 6.657e-07 / 1.6508e-07 | 0 / 0 |
| drift-recovery | 5.2968e-06 / 3.6564e-07 | 4.1794e-06 / 8.8948e-07 |
| recontact | 3.3732e-07 / 1.139e-08 | 5.9128e-07 / 8.1898e-08 |
| clutch-transition | 1.498e-08 / 6.4567e-09 | 1.4332e-07 / 1.7511e-08 |
| hold-release | 5.0813e-08 / 1.0161e-08 | 9.063e-07 / 1.8125e-07 |

`state-refinement.json` records errors for **every represented state variable**
with units, including vertical suspension coordinates/velocities and engine speed.
Smooth cases show expected midpoint refinement; contact/lock/input and engine
cutoff events prevent a universal order claim. Event histories are saved in the
raw benchmark. The correction changes the old constrained trajectories only
slightly here: maximum matched-path position difference is about 3.3e-6 m,
heading 9.5e-7 rad, wheel speed 0.00079 rad/s. Numerical energy leakage was not
removed by changing friction, engine torque, suspension or steering parameters.

Braking from 5 m/s reaches 0.01 m/s at approximately **0.781268 s / 1.912886 m**,
versus previous **0.781265 s / 1.912884 m**. These digits demonstrate numerical
comparison, not measured real-car braking accuracy. Differences against the
strict reference remain much larger (up to about .19 m path / .089 rad heading)
because the reduced models omit several strict-reference mechanisms. Neither
model is treated as a physically perfect oracle.

## Complete-step CPU cost

Node 24.19.0, Linux, Xeon Platinum 8573C, five exposed logical CPUs and four
CPU-equivalents quota on a shared cloud host. **Headless CPU only**; no browser,
FPS or GPU claim. One simulated second at 1 ms; four repetitions per case/method,
first discarded, method order rotated. Tables use medians of the remaining three
run statistics. Whole-process CPU includes stepping, state extraction and counters;
per-step wall time excludes extraction. Initialization, validation/refinement and
serialization are excluded. Timing had no concurrent local test workload.

The strict adapter runs the genuine nested terrain path on a constant +1 mm
plane; POC geometry is translated to its equivalent zero-height plane. This
avoids accidentally timing the inherited flat-path dispatch. Strict safeguards,
tolerances and Strategy A are unchanged. Final measurements followed finite-energy
guard verification; pilot timing was not used for the table.

| Case | Previous CPU ms/sim s | Corrected CPU ms/sim s | Strict CPU ms/sim s | Corrected / previous | Strict / corrected |
|---|---:|---:|---:|---:|---:|
| acceleration | 49.87 | 175.36 | 998.30 | 3.52× | 5.7× |
| steering | 27.19 | 104.48 | 932.00 | 3.84× | 8.9× |
| braking | 22.96 | 156.07 | 1407.39 | 6.80× | 9.0× |
| drift-recovery | 17.05 | 77.46 | 1433.78 | 4.54× | 18.5× |
| recontact | 13.80 | 66.85 | 1404.30 | 4.85× | 21.0× |
| clutch-transition | 18.84 | 55.47 | 749.71 | 2.94× | 13.5× |
| hold-release | 15.92 | 49.60 | 637.36 | 3.11× | 12.9× |

Equal-scenario means: **23.66 → 97.90 CPU ms/sim s**; **4.14× cost**, +74.23 ms/sim s. Strict: 1080.41 ms/sim s. Remaining measured throughput ratio: **11.0×**. These ratios use aggregate CPU costs, not averaged case ratios; they do not compare physically equivalent full simulators. Shared-host/JIT/GC variation prevents interpreting earlier missions' ratios as controlled hardware comparisons.

| Case | Corrected median / p95 / p99 step ms | Worst observed ms |
|---|---:|---:|
| acceleration | 0.0648 / 0.2274 / 0.4208 | 2.389 |
| steering | 0.0565 / 0.1354 / 0.2584 | 0.642 |
| braking | 0.0643 / 0.1719 / 0.4905 | 3.123 |
| drift-recovery | 0.0616 / 0.1501 / 0.2861 | 0.887 |
| recontact | 0.0547 / 0.1276 / 0.2159 | 1.012 |
| clutch-transition | 0.0534 / 0.1082 / 0.1949 | 2.229 |
| hold-release | 0.0520 / 0.1209 / 0.1876 | 0.939 |

Worst observations are not hard latency guarantees. Raw data includes previous
and strict latency/counters. The corrected cost includes closing the shared force
stage and the new whole-step guard; it is not a kernel-only timing. One 7x7
factorization and 1+iterations rotor flows are executed per step, with 4 initial
and 4*iterations shared-stage tire evaluations. No hidden contact substeps.
Measured force convergence, not an arbitrary speed target, determined retention.
No further optimization pass was performed.

## Remaining limits and decision

The local work/time-level defect is corrected in this isolated selectable model.
Retain it for further bounded research, **not production integration**. Exact
rotor locking/holding is preserved, but force variation inside a step is still a
numerical approximation. Endpoint support secants do not resolve every possible
intra-step contact event; engine torque remains a frozen predictor sample.
Picard convergence is demonstrated only in this envelope, not universally proved.
The 24-trial cap may reject larger steps or more demanding parameters; failures
must be reported, never silently accepted or retried at a larger timestep.

Inherited limitations remain: reduced small-angle rigid-body mechanics, fixed gear,
ideal massless differential, omitted housing/gyro effects, prescribed steering,
flat plane, no calibrated pneumatic tire/transient law, and incomplete engine
lifecycle. Static **wheel-brake** holding does not add static tire/road friction or
establish arbitrary grade holding. No gearbox, terrain, steering, rendering, UI
or browser features were added. Production and historical reference implementations
are unchanged. The next priority, if separately authorized, is validating the
same method over a wider bounded operating envelope before adding mechanisms;
that work is not started here. Stop after this corrected proof of concept.
