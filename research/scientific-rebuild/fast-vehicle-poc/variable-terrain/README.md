# Continuous-terrain bristle-contact experiment

**PERFORMANCE; base `c493e4bb0ba41e25360700d4796363503e214971`.**
One isolated, headless terrain-capable prototype; no production integration,
GUI, new branch, parameter fitting or historical changes. The containing Git
commit identifies delivery; `results/validation.json` records executable source
SHA-256 hashes, units, configurations and all final mechanical states.

**Decision:** ready for broader *bounded research driving tests*, not production
or a claim of realistic pneumatic-tire handling. Changing-normal work and history
transport pass the tested gates. Rolling contact-patch renewal is still absent.

## Mechanical construction

`vehicle.js` retains the 104 kg shared horizontal mass, four independent rotors
and vertical masses, sprung heave/pitch/roll, springs/dampers, fixed gear/ideal
open differential, engine law and unchanged exact clutch/brake kernel.
`linear.js` isolates the predecessor's linear midpoint suspension operator.
`geometry.js` supplies world contact geometry and norm-preserving strain transport.
`cases.js`, `terrain.test.mjs`, `validate.mjs` and `benchmark.mjs` provide the
bounded experiments. All imports are research modules. The existing procedural
sampler is reused unchanged for hills, rough ground and C1 road shoulders;
each wheel independently samples height, analytic gradient, normal and friction.

Coordinates: world x/y horizontal, z upward; yaw about z. Pitch and roll retain
the predecessor's reduced small-angle coordinates and signs. Carrier position:

```
p_i = [X,Y,hubZ_i] + [R(psi)*[x_i,y_i], 0]
Phi_i = kt/2 * max(radius + height(p_ix,p_iy) - hubZ_i, 0)^2
```

This **vertical-gap** potential deliberately follows the existing terrain
reference, not an exact sphere/closest-surface construction. Effective normal
stiffness/radius depend on slope; flat normal potential is recovered exactly.
Its force is pressure*[-height_x,-height_y,1]. Endpoint penetration secants handle
unload/recontact. A fixed three-point Gauss gradient integral along the carrier
chord, with a height-work secant correction only above roundoff, supplies the
changing-normal discrete gradient. It uses five samples per corner per trial,
never hidden time subdivision. Actual normal work defects are recorded and must
fit the unchanged whole-step energy guard, not added to an artificial work sink.

The discrete carrier yaw Jacobian uses sinc((psi1-psi0)/2), exactly matching
finite endpoint travel. Material slip velocity additionally includes angular
motion at the nominal contact offset -H*n. Columns are:

```
yaw: carrierYaw - H*(worldZ cross n)
pitch: H*(bodyLeft cross n)
roll: H*(n cross bodyForward)
```

All extra columns are tangent to n: normal support does no work through them.
The *same* velocity Jacobian transposed applies world force to chassis
translation/yaw/pitch/roll and hub vertical motion. Rotor reaction is -radius*Fx
in the tire's longitudinal tangent direction, counted once. This separates
geometric normal deformation from nonholonomic material slip; treating the old
flat H*pitch/roll slip offsets as a world geometric point derivative would be
incorrect. It is still a reduced contact-velocity architecture, not a full
6-DOF wheel/carrier assembly or an exact large-angle inertial model.

Bristles are world tangent vectors. Shortest-arc Rodrigues rotation transports
history old-normal -> shared-stage normal -> endpoint normal. This is an isometry:
no projection, normalization, reset or added energy term. The inherited isotropic
K=20,000 N/m, c=800 Ns/m series Coulomb/bristle law is called unchanged in a local
orthonormal tangent basis. Shared combined friction uses mu*|normal force|.
Airborne histories keep their last contact normal and freely relax through the
existing dashpot with exactly zero ground force; recontact transports residual
strain. Antipodal/invalid frame transport rejects the step.

One shared force stage solves 13 generalized contact loads by the existing
bounded Picard/safeguarded-Aitken approach: **24 trials maximum, 1e-11 N force
closure**, moments scaled by an explicit 1 m reference length. No nested terrain
endpoint optimizer or FISTA. Actual body and rotor travel use these same loads.
No convergence/energy/friction tolerance is relaxed. The engine's inherited
predicted-midpoint torque sample, exact rotor event flow and suspension midpoint
method remain. All state/history/loss/diagnostics publish only after every guard.

Total energy replaces flat radial potential with terrain Phi, adds bristle
K*|z|²/2 and retains gravity/kinetic/spring energies. External work is engine work
minus brake/clutch heat, suspension damping and bristle viscous/plastic losses.
`y[26]` remains *internal mechanical tire work*, excluded from total external work.
Use `energy(s,terrain)` and `totalWork(s)`. Stored strain can return positive
mechanical contact work without violating passivity. The test suite separately
sums physical energy, finite-differences the normal potential and checks virtual
work; energy agreement is not inferred only from the internal ledger.

Static initialization solves one 7x7 linear equilibrium with world-vertical total
support decomposed into normal and tangent forces, checks friction and stores
prestrain. It is not a per-step holding force. Default initialization has zero
shear and a fitted initial body height/pitch/roll; settling is an actual transient.
Only all-supported static initialization is supported; infeasible states reject.

## Verification actually executed

- **20/20** new tests; **56/56** historical fast/contact/constraint tests.
- **82/82** strict procedural-terrain tests, including A/B research checks.
- Strategy A: **1,080 accepted states bit-exact**, plus rejected-step isolation.
- **36/36** trajectory runs: twelve cases at 1, 0.5 and 0.25 ms. No failures.
- All new JavaScript files syntax checked; historical tracked sources unchanged.

Largest cumulative energy/work residual: **2.331e-11 J**; largest per-step normal
work defect **1.390e-13 J**. At most **9/24** force trials; force residual <=1e-11 N;
friction excess <=2e-11 N; locked clutch mismatch exactly zero. Exact wheel brake
holding, combined breakaway, low-grip sliding, release, recontact, determinism
and rollback are covered. No rejected state is reported as accepted.

At 5 degrees the prestrained service-braked state moves <5e-16 m over 1 s;
all five rotors remain exactly zero. With mu=.03 it slides downhill at
-0.338 m/s after .6 s. Uphill drive reaches +0.311 m/s; downhill coasting
+0.372 m/s. Rear-handbrake-only release settles after 5 s to -1.04e-6 m/s,
with 5.18 mm elastic body displacement, not exact rigid-body zero travel.
Uneven braking reduces forward speed 4 ->1.317 m/s in .6 s; the disturbed
steering/handbrake case changes yaw through tire moments. The lifted crest case
records 411 unloaded corner-step samples and returns to support. A separate
uneven static test has four distinct heights and unequal loads; local friction
is independently tested on opposite sides.

Against .25 ms, selected final horizontal position errors at 1/.5 ms:

| Case | 1 ms error (m) | .5 ms error (m) |
|---|---:|---:|
| hills | 7.05e-9 | 3.41e-9 |
| uneven braking | 1.47e-6 | 8.39e-7 |
| uneven drift | 2.11e-6 | 4.44e-7 |
| crest | 7.08e-7 | 1.03e-7 |
| recontact | 2.55e-6 | 1.62e-7 |

All 25 mechanical components and 12 strain components are compared in saved
results; maximum 1 ms wheel error is 1.89e-4 rad/s (braking). Smooth cases refine;
contact/yield/actuation events limit universal order claims. Low-grip slope final
position errors are tiny but **nonmonotonic**, 1.43e-7/1.57e-7 m. This is reported,
not used to claim second-order convergence at switching events.

## Performance

Node 24.19.0, Linux 6.18.57, Xeon Platinum 8573C, five exposed logical CPUs,
four CPU-equivalent quota, shared cloud machine. Headless CPU only: **no browser,
FPS, hardware-GPU or strict-reference speedup claim**. Seven paired one-second
flat cases with identical initial mechanical states/controls, full warmup,
five alternating runs, discard first; conventional median of four retained runs,
then equal-case mean. Per-step latencies measure step only; whole-process CPU
includes common counters/timers and runtime overhead. No other local tests or
profilers ran during timing. Different constitutive laws/geometry are intentional:
this is cost comparison, not identical physical-solution equivalence.

| Model on flat workload | CPU ms/sim s | Median step ms | p95 ms | p99 ms | Mean trials |
|---|---:|---:|---:|---:|---:|
| optimized flat velocity law | 45.20 | .0360 | .0757 | .1796 | 6.11 |
| fixed-plane bristles | 59.51 | .0498 | .1082 | .2417 | 6.04 |
| new terrain adapter | 186.95 | .1507 | .3108 | .5017 | 6.25 |

Terrain adapter flat cost is **3.14x** fixed-plane bristles (**+214%**),
**4.14x** optimized velocity law: about **5.35 simulated seconds per CPU second**.
It is not a performance improvement over flat ground. The added work is spatial
sampling, geometric/frame transforms, history transport and allocations, rather
than a large iteration explosion. Successful full steps evaluate 4*(trials+1)
bristle laws, trials+1 exact rotor flows and 28+20*trials terrain samples, including
energy checks. Maximum permitted counts are 100/25/508; rotor flows retain their
own event cap. The implementation leaves obvious allocation/sample-reuse
opportunities for future profiling; no second optimization campaign was launched.

Variable-terrain workloads (median of four retained runs; worst across them):

| Case | CPU ms/sim s | p95 step ms | p99 step ms | Worst ms | Max trials |
|---|---:|---:|---:|---:|---:|
| hills | 255.02 | 0.425 | 0.853 | 4.158 | 8 |
| uneven-braking | 212.25 | 0.367 | 0.578 | 2.314 | 8 |
| uneven-drift | 239.17 | 0.396 | 0.530 | 1.348 | 8 |
| crest | 195.99 | 0.343 | 0.530 | 4.396 | 8 |
| recontact | 179.56 | 0.327 | 0.479 | 0.941 | 9 |
| road-shoulder | 276.00 | 0.445 | 0.635 | 0.978 | 8 |

**Zero benchmark convergence failures.** Worst retained new step across flat and
variable runs: **4.602 ms**; finite tests do not establish a hard latency bound.
Average headless CPU remains below real-time cost, but GC/scheduler outliers can
exceed a 1 ms tick. No elapsed time was dropped; every test integrates its declared
fixed timestep. No comparable old variable-terrain full workload was timed, so
there is no claimed speedup ratio against that simulator. The original pathology
is structurally avoided here: one bounded force loop, no repeated nested endpoint
and large contact optimizations. Higher cost than flat ground remains material.

## Limits and reproduction

Mild slopes/continuous height fields only were exercised, at 1–5 m/s and <=5-degree
planar slopes. Runs are .6–1 s plus a 5 s hold/settle, not endurance or arbitrary
terrain certification. No overhangs, true contact-patch geometry, large chassis
rotations, collisions, full rigid-body inertial/gyroscopic coupling or terrain
normal damping extension is added. Source terrain friction changes by surface.
Bristle transport follows the carrier chord; path/step refinement remains needed.
Finite quadrature/roundoff, very large coordinates, abrupt surface geometry,
frame degeneracy or force nonconvergence can reject a step transactionally; the
24-trial limit is never bypassed. No epsilon conceals a physical singularity.

**Rolling contact-patch limitation remains:** sustained tiny slip can accumulate
strain to full Coulomb traction regardless of rolling residence time. This is a
lumped elastoplastic contact, not a calibrated pneumatic tire or production
handling model. Brake-release elastic recoil is retained. The terrain mapping
also differs deliberately from rotating the whole model into one fixed plane;
world vertical-gap support and finite-yaw contact geometry are explicit changes,
not claimed bit-exact equivalence with that physical approximation.

From repository root, no added dependencies:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/terrain.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/validate.mjs
# Run alone, after tests finish:
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/benchmark.mjs
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs research/scientific-rebuild/fast-vehicle-poc/constraints.test.mjs research/scientific-rebuild/fast-vehicle-poc/consistency.test.mjs research/scientific-rebuild/fast-vehicle-poc/efficiency/efficiency.test.mjs research/scientific-rebuild/fast-vehicle-poc/terrain-gate/gates.test.mjs research/scientific-rebuild/fast-vehicle-poc/static-contact/*.test.mjs
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
```

API: `create(terrain, options)`, `step(state, terrain, input, h, options)`,
`energy(state, terrain)`, `totalWork(state)`. Terrain must be a pure sampler;
state is serializable, sampler is an explicit external argument. Example samplers
and repeatable controls are in `cases.js`. Results generation writes only this
experiment's results. No browser simulation, control mapping or renderer was changed.
