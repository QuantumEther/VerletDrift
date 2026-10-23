# Mission 4 — coupled rotational research: candidate rejected

Branch `research/drivetrain-coupled-solver`, based on repair commit `214cda9`.
**Research outcome: static holding is corrected, but full mechanical acceptance fails. Do not integrate this candidate into production.** Production files, other branches, and the original failing assertions are unchanged. There are no keyboard, rendering, tire-curve, chassis, or tuning changes.

## Method and assumptions

The standalone [kernel](../research/drivetrain/coupled-solver.mjs) accepts explicit state, constant per-tick combustion/starter/signed drag torque, nonnegative viscous drag and friction capacities, two contact callbacks, and a timestep. It returns all four signed shaft speeds, end forces, clutch/brake/contact impulses, mode, individual work terms, residual and operation counters. It has no imports or global vehicle state. One factory instance owns reusable scratch arrays; calls on the same instance are synchronous and not reentrant.

Let `e,i,l,r` be signed crank, input, left-wheel and right-wheel angular speeds; inertias are `Ie,Ji,Il,Ir`. With an engaged fixed signed ratio `g`, an ideal open differential imposes `i=g(l+r)/2`. Its massless gears split input torque equally; its housing reacts torque, so conservation refers to generalized rotor momentum rather than spatial angular momentum of the whole car. Input inertia is counted once. Neutral retains an independent input rotor and disconnects the wheels. No gear changes, combustion modes, governor, stall detection or clutch-pedal logic live in the kernel.

For `h=g/2` and engaged reduced velocity `v=(e,l,r)`:

```text
    [ Ie       0             0       ]
M = [  0   Il + Ji h²       Ji h²    ]
    [  0      Ji h²      Ir + Ji h²  ]

A = [ 1  -h  -h ]     (clutch slip)
    [ 0   1   0 ]     (left brake)
    [ 0   0   1 ]     (right brake)
```

The off-diagonal terms are essential. In the statically locked state, eliminating `e=i` adds **Ie+Ji** to the shared rear inertia. In neutral, use `v=(e,i,l,r)`, diagonal mass and clutch row `(1,-1,0,0)`.

For `v̄=(v₀+v₁)/2`, positive friction impulses `J` oppose their constraint velocities; positive tire impulse `Q` accelerates the body and reacts against wheel rotation:

```text
M(v₁−v₀) = dt (Tcomb + Tstarter + Tdrag − b ē) ue
           − Aᵀ J − Σ Rj Qj uj

|Jc| ≤ C dt; |Jbj| ≤ Bj dt
Av₁ = 0 for a sticking constraint
Jk = capacity_k dt sign((Av₁)k) for a sliding constraint
```

The linear mechanical solve includes external torque, brakes and both road reactions simultaneously. Define `H=M+dt b ue ueᵀ/2`. For trial contact impulses, compute the free velocity using H, then use `W=A H⁻¹ Aᵀ` to enumerate at most 27 clutch/brake active sets. Each candidate requires a linear solve of order at most three. An open clutch has zero impulse. A locked clutch is capacity-limited, rather than determined by pedal position. Initial gearbox-incompatible state is rejected; no speed clamp repairs it.

The production contact interface advances wheels independently, recursively step-doubling a scalar implicit solve. Reusing that call sequence cannot make the final crank-coupled contact speeds simultaneous. The research adapter instead extracts the **actual** `pacejkaForce`, `slipAtOmega`, `longitudinalTarget` and `contactTarget` closures from `tires.js`, supplies explicit kinematic/load inputs, and passes them to the joint solve. Source-boundary checks make it fail if those functions disappear. No tire equations are copied or edited. The adapter is Node-only; the numerical kernel needs only callbacks.

The existing relaxation ODE remains `dF/dt=(Ftarget−F)/τ`. For a target frozen at the unknown midpoint wheel speed, integrate it analytically:

```text
a = exp(−dt/τ); w = (1−a)/(dt/τ)
F₁ = a F₀ + (1−a) Ftarget(ω̄)
Q  = dt [w F₀ + (1−w) Ftarget(ω̄)]
```

This retains the physical force law and relaxation time, but changes the **numerical quadrature** from production's adaptive implicit steps. Two residuals for the mean rear forces are solved by bounded finite-difference Newton steps and line search. Physical force bounds constrain the search domain; no extra damping, force correction or speed clipping is added. Lateral kinematics/combined-grip inputs and body contact velocities are prescribed and held over a tick. Returned body-port work does not constitute a fully integrated chassis energy test.

## Work accounting and rejection

For the chosen discrete trajectory, multiplying the momentum equation by v̄ gives:

```text
ΔK = Wcomb + Wstarter + Wdrag + Wroad − Hclutch − Hbrake
Wcomb = dt Tcomb ē; Wstarter = dt Tstarter ē
Wdrag = dt Tdrag ē − dt b ē²
Wroad = −Σ Rj Qj ω̄j
Hclutch = Jc(ē−ī); Hbrake = Σ Jbj ω̄j
WbodyPort = Σ Qj Vj
Hcontact = Σ Qj(Rj ω̄j−Vj) = −Wroad−WbodyPort
```

The returned `contactHeat` is this **signed port dissipation**, not an assumed nonnegative heat counter. `passive` becomes false if clutch, brake or contact terms are negative beyond 1e−8 J. Negative values are returned unchanged. A balanced algebraic work journal is necessary but is not sufficient evidence of physically correct work.

Two independent rejection conditions remain:

1. **Endpoint clutch friction misses an event inside the tick.** In neutral start from `e=0,i=1`, `Ie=.25,Ji=.02`, starter 40 Nm, clutch capacity 10 Nm. Initial clutch torque helps the crank. Slip reaches zero at **1/700 s**, then clutch torque becomes a static holding reaction. Exact physical slip heat is **0.007142857143 J**. The candidate uses endpoint active states and midpoint work over the entire tick, missing that change in acceleration. Endpoint speeds happen to match the exact solution in this example, but the work does not. This requires event-aware integration/quadrature, not a heat-counter correction.
2. **Carried tire force is not unconditionally passive at the contact port.** After slip changes sign, the unmodified first-order lag can retain force with the old sign. Even exact frozen-speed ODE integration gives negative `Q(Rω−V)` for `V=10 m/s, ω=10 rad/s, R=.3 m, F₀=2500 N, τ=.03 s, dt=.01 s` using the production target. This occurs without the rotational solver. Real tire elasticity could return stored energy, but the existing force-only lag supplies no constitutive stored-energy law to account for it. Thus the model cannot guarantee port passivity for arbitrary admitted force histories. This result does not establish that every return of contact energy is physically artificial.

| Hz | Candidate clutch-event heat, J | Exact heat, J | First active contact interval ends, s | Contact port dissipation in that interval, J |
|---:|---:|---:|---:|---:|
| 50 | −0.020370370 | 0.007142857 | .4600 | −9.866332121 |
| 100 | −0.005555556 | 0.007142857 | .4600 | −3.238787957 |
| 200 | 0.001851852 | 0.007142857 | .4400 | −0.232253360 |
| 400 | 0.005555556 | 0.007142857 | .4375 | −0.001816257 |

The contact trace starts at crank/input 160 rad/s, wheels 40 rad/s, ratio 4, road speed 5 m/s, forces zero, engine torque 50 Nm, left/right grip coefficients 1/.5 and 3000 N normal load each. The 3200 Hz trace still has an active contact interval. These tests fail normally, without `it.fails` or weakened assertions. Work residual in the rejected intervals remains near roundoff; the tests distinguish accounting identity from passivity.

## Verified results and convergence

The exact original static fixture reproduces unchanged. Supplying its same combustion/drag law to the research solve yields:

| Hz | Production split recorded clutch heat, J | Coupled static heat, J | Coupled rotational ΔK, J | Coupled work residual, J |
|---:|---:|---:|---:|---:|
| 50 | 21.379757781 | 0 | 290.140072511 | −2.81e−13 |
| 100 | 5.349214542 | 0 | 144.519747316 | 8.01e−13 |
| 200 | 1.337838503 | 0 | 72.122293676 | −9.98e−13 |
| 400 | .334526514 | 0 | 36.026750874 | 2.27e−12 |

At 100 Hz, combustion work is 155.528946193 J and signed drag work −11.009198877 J. The static clutch transmits 155.757014 Nm below its 350 Nm capacity with no slip work. This is an actual simultaneous torque/inertia correction, rather than zeroing the original heat result.

Research tests: **68 passed / 8 failed (76 total)**. Passing cases cover static torque, starter work, drag in both directions, passive slip of either sign, finite slip-to-lock, neutral, unequal-wheel generalized momentum, signed ratios, one-sided road reaction with exact off-diagonal response, open/locked braking, simultaneous clutch slip/braking, rest holding, brake-driven crank stopping, complete contact/body-port accounting and smooth nonlinear convergence. The eight failures are four tire-passivity cases and four within-tick clutch-event work cases above.

Existing targeted tests remain **113 passed / 4 failed**. Combined: **181 passed / 12 failed**. No existing test or production function was modified. The original four failures remain because the research solver is not connected to production.

For smooth nonlinear convergence, start crank/input 800 rad/s and both wheels 200 rad/s at ratio 4. Prescribe engine torque 150 Nm, road speed 5 m/s, grip 1/.5 and run exactly .4 s at each rate. No slip reversal occurs. Compare `(e,l,r)` to 3200 Hz using the Euclidean speed error:

| Hz | Final crank, rad/s | Speed-vector error, rad/s | Integrated signed dissipation, J | Maximum per-tick work residual, J |
|---:|---:|---:|---:|---:|
| 50 | 713.184112162 | 1.56785e−3 | 63990.495140 | 3.01e−11 |
| 100 | 713.183327048 | 3.92823e−4 | 63993.120733 | 2.96e−11 |
| 200 | 713.183130035 | 9.79946e−5 | 63993.778337 | 5.74e−11 |
| 400 | 713.183080732 | 2.42151e−5 | 63993.942814 | 4.71e−11 |

Reference crank 713.183064550 rad/s; reference ΔK −24182.430308 J, signed dissipation 63993.996789 J and net external work after the body port 39811.566481 J. The observed smooth error is approximately second order; this is not a theorem for active-set transitions. In the reversal trace, final crank errors relative to 3200 Hz are .8753/.6038/.3063/.00954 rad/s for 50/100/200/400 Hz. Those irregular errors and the rejected work terms do not establish acceptable transition convergence.

## Runtime measurements

Node 24.19.0, Linux x86_64 cloud host; 100 Hz timestep. Each profile uses 1000 warmup calls and 4000 measured independent calls from the same initial snapshot. Both methods receive identical inertias, contact functions, torques, force histories and timestep. The split reference calls production `integrateWheelContact` and clutch/brake functions in repair order; it excludes engine UI/modes and chassis. The two methods have different quadrature, adaptive work and physical outcomes; **these are equivalent input workloads, not equal-accuracy comparisons or vehicle frame-rate measurements**. No performance tuning followed the rejection.

| Snapshot | Split mean / p95 / worst, ms | Coupled mean / p95 / worst, ms | Longitudinal callback calls, split / coupled | Coupled Newton iterations |
|---|---|---|---:|---:|
| Locked idle | .004576 / .004697 / 2.524948 | .001648 / .001382 / .236332 | 18 / 4 | 0 |
| Acceleration | .303089 / .407346 / 16.050587 | .006737 / .004377 / 4.035626 | 1806 / 16 | 2 |
| Gentle launch | .003216 / .003526 / .935362 | .011827 / .017586 / .255079 | 12 / 16 | 2 |
| High-slip wheelspin | .049645 / .072027 / 7.747609 | .006366 / .003104 / 8.462213 | 258 / 10 | 1 |
| Asymmetric traction | .079189 / .125436 / 5.822225 | .005195 / .004387 / 4.038790 | 516 / 16 | 2 |
| Strong braking | .272321 / .341418 / 2.970140 | .004248 / .004006 / .207569 | 1806 / 16 | 2 |
| Slip-to-lock | .288916 / .412485 / 3.228164 | .003614 / .003505 / .147650 | 1806 / 16 | 2 |

Steady snapshot active-set checks are 2/8/8/5/8/8/8 per tick respectively after warmup. The harder evolving reversal trace reaches 7 Newton iterations and 62 callback evaluations at 50 Hz. Worst durations include scheduling/GC noise and are retained. Low mean cost does not prove real-time suitability of every admitted state.

Hard bounds: 24 Newton iterations, two finite-difference evaluations per iteration, at most ten line-search attempts, and at most 27 active-set candidates per residual evaluation. Thus at most 290 friction solves, 7830 small active-set checks and 580 target-force evaluations per call. There are no recursive contact substeps. Each active set solves at most a 3×3 system. Singular/stalled/exhausted contact solves throw rather than silently accept a bad residual. Work arrays are factory-owned and reused; returned objects and the unchanged production contact callback still allocate. Global root uniqueness/convergence for the nonmonotone tire curve is unproven.

## Alternatives and future integration boundary

| Approach | Correctness and convergence | Implementation/cost |
|---|---|---|
| Fully implicit coupled speeds/force states with nonsmooth friction Newton | Can couple contacts and inertia, but endpoint friction still misses event work; force memory still lacks a passivity/storage guarantee. | Larger nonlinear Jacobian and active-state handling; requires bounded globalization. Not selected. |
| Selected analytic inertia/active sets + two mean-force unknowns | Exact static work and shared inertia; observed smooth second order. Rejected on clutch-event work and contact-port passivity. | Small fixed matrices, measured cheap snapshots, explicit iteration bounds. |
| Physically event-resolved active sets, with contact energy model addressed explicitly | Can integrate slip until a lock/reversal event, then the holding phase; solves the analytical starter example. Does not by itself make carried tire force passive. | Future research needs bounded event count/chatter rejection and validated contact quadrature. Not implemented here. |

For a future accepted method, `engine.js` should own combustion/ignition/stall/gear/pedal policy and provide torques/capacities without pre-advancing the crank. `tires.js` should own kinematics, loads, unchanged force targets and force histories, provide two contact descriptions, and consume the returned impulses consistently for body forces and telemetry. `wheel.js` should retain scalar front-wheel integration and brake-capacity calculation; a single rear rotational call should own crank/input/rear speeds and all rear friction impulses. Final engine mode evaluation belongs after that call. Body-port/chassis work consistency remains to be validated separately.

The next research decision is how to account recoverable tire deformation energy while preserving intended steady force curves. Adding arbitrary force-sign clamps, damping or heat reclassification would change the problem and is not proposed. The chosen clutch discretization separately needs physically resolved event work. **No production integration is justified by this candidate. No real driving, drifting, tire-mark, browser or full-vehicle stability behavior was tested or verified.**

## Reproduction

```sh
node research/drivetrain/baseline.mjs
node research/drivetrain/measure.mjs
node research/drivetrain/measure.mjs --benchmark
node node_modules/vitest/vitest.mjs run tests/coupled-solver.test.js \
  tests/drivetrain-operation.test.js tests/drivetrain-integrity.test.js \
  tests/drivetrain-rotation.test.js tests/drivetrain-gears.test.js \
  tests/engine-inertia.test.js tests/wheels.test.js tests/numerical-chassis.test.js
```

The test command intentionally exits nonzero with the twelve listed acceptance failures. This checkout needed local Linux Rollup/esbuild optional binaries to execute Vitest; package manifests were unchanged. New files are this report, `tests/coupled-solver.test.js`, and six files under `research/drivetrain/`: kernel, production-contact adapter, fixtures, split reference, measurement script and exact-baseline script.
