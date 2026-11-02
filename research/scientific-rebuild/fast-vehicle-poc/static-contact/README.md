# Static tire contact and terrain readiness

**Implemented:** isolated, passive static-to-sliding contact in the existing fast
four-wheel architecture. **Readiness: NOT YET for full variable terrain or as a
definitive pneumatic tire model.** The missing static-traction gate is cleared;
changing-normal geometry/strain transport and rolling-contact realism remain.

Branch PERFORMANCE, working base `37e2c61`, comparison baseline
`71cfb6c1295e9e4bea923ff3ff27e87633aa1f8f`. All new files are confined to this directory. Production,
optimized flat POC, exact rotor kernel and historical fixtures/results are
unchanged. The containing commit and `results/provenance.json` identify delivery.
No new dependencies, branch, global optimizer, GUI or terrain sampler integration.

## Choice and physical model

| Candidate | Physical and computational considerations | Decision |
|---|---|---|
| Local static-friction constraints | Legitimate rigid-contact ideal; no elastic state. Multiple tire reactions couple body, wheel, brake and clutch constraints and would need a new verified coupled reaction method. Small specialized algorithms might be efficient; none was implemented or timed here. | Not selected for this bounded experiment; not declared intrinsically too expensive. |
| Lumped elastic/bristle element | Adds two stored shear components per tire; has an explicit combined-friction return map and energy identity. Finite force sensitivity retains the existing bounded force-consistency loop. | Selected and measured. |

`bristle.js` represents a Kelvin–Voigt shear element in series with an isotropic
Coulomb slider. This is a lumped mechanical network, **not** a port of TMeasy or a
calibrated pneumatic brush model. `vehicle.js` adapts the 71cfb6c step skeleton:
same four rotor/vertical corners, suspension, mass/inertias, contact arms, engine
law, exact clutch/brake flow, fixed clock, 24 force-trial cap and Aitken closure.
Only the tire constitutive state, energy ledger and constant-plane gravity are
extended. No tire coefficients were fitted to the successful examples.

New shear stiffness **K=20,000 N/m** is an explicit synthetic test property,
independent of the coincident radial stiffness value. Dashpot **c=800 Ns/m**
retains the old dissipative slip coefficient's value and units; its role is now
defined by the viscoelastic network. Neither is measured vehicle calibration.
Static force exists even with c=0 (independently tested): damping does not create
the holding force. Default mu=.9; mu=.03 is a deliberate insufficient-grip case.

For old shear z0, average rigid-port slip v, normal support N and h:

```
d = c + h*K/2
trial = K*z0 + d*v
p = projection of trial onto the disc |p| <= mu*N
vElastic = (p-K*z0)/d
z1 = z0 + h*vElastic
vPlastic = v-vElastic
F = -p
```

Inside the disc the implementation uses vElastic=v exactly. One shared disc
limits both longitudinal and lateral force; no independent component clamps.
Yield is a force condition, not a speed threshold. At zero slip, stored strain
can supply static traction. The force is continuous at breakaway; when trial force
returns within the disc, gross sliding stops and elastic grip reattaches.
At fixed normal support the force-map sensitivity is bounded by d (810 Ns/m at
1 ms), keeping the existing finite-compliance iteration; no stiff rigid-contact
penalty or inner root solve is introduced.

The independently checked discrete identity is

```
U = K*|z|^2/2
Dviscous = c*h*|vElastic|^2 >= 0
Dplastic = h*p dot vPlastic >= 0
Wcontact + (U1-U0) + Dviscous + Dplastic = 0
```

Plastic dissipation follows directly from radial projection. Stored energy can
return positive mechanical work; the old instantaneous Wcontact<=0 criterion
would be wrong for this model. It is replaced by the storage/dissipation identity,
not by a relaxed energy allowance. Force tolerance **1e-11 N**, friction allowance
**2e-11 N**, rotor checks, 24-trial cap and original epsilon-scaled whole-energy
checks remain. The added constitutive residual-work bound is derived as
h*forceResidual*sum(|slip components|), not a fitted safety threshold.

## Contact history and work-conjugate mapping

Shear vectors are stored in the fixed plane's orthonormal tangent chart and
rotated into the current wheel frame without changing stored energy. Tests check
coordinate-rotation objectivity and 3D force/velocity power. All corners use the
same stage state and exact rotor travel/h; each force applies its corresponding
body impulse/moment and -R*Fx wheel reaction. The unchanged rotor kernel supplies
exact clutch locking, brake holding and reaction heat.

**Unloading does not reset strain or discard energy.** At N=0, p=0 exactly. The
same network freely relaxes with z1/z0=(c-hK/2)/(c+hK/2), dissipating stored energy
through its existing dashpot while applying zero ground traction. The selected
parameters give a 40 ms continuous relaxation time; h<=4 ms remains within a
nonoscillatory relaxation regime. Recontact can retain residual internal strain,
whose energy is still tracked and whose traction is limited by new support.
No velocity snapping, contact-memory zeroing, artificial holding force, damping
tuning or extra separation-energy sink is used. Contact-loss policy is a lumped
viscoelastic approximation, not resolved tread/carcass vibration dynamics.

The vehicle API keeps `y[26]` as **mechanical contact work**, which can be positive
when stored energy returns. `energy(s)` includes tire strain energy; use
**`totalWork(s)`** for the total ledger: engine work minus tire losses, brake heat,
clutch heat and suspension damping. Do not sum the old five work fields and call
that the total-energy ledger. `tireLoss.viscous` includes unloaded relaxation;
`traction.airborneDissipation` is only a diagnostic subset, not an extra loss.

All body, shear and loss histories publish only after every check. Unconverged,
invalid-input and nonfinite-energy trials leave state/time/diagnostics unchanged.

## Fixed-plane geometry and results

The isolated incline uses an **orthonormal constant-plane chart**, not an
unvalidated variable-height adapter: x uphill, y cross-slope, z plane-normal.
World gravity projects to gx=-g*sin(angle) and gn=g*cos(angle). Every represented
mass is included once: shared tangential mass104 kg, sprung normal mass80 kg plus
four6 kg corners. Normal potential is the original flat normal-gap elastic law
in this rotated frame. This is explicitly different from the legacy terrain
adapter's vertical-gap stiffness convention. Full world-coordinate moving terrain
normals, hub geometry and objective inter-plane strain transport are not solved.

A static initializer solves linear suspension equilibrium, assigns compatible
elastic prestrain and checks the friction/support bounds. It creates an initial
condition, not a stepping controller. At 5 degrees it supports **88.9198 N** uphill
with approximately **0.04942 J** stored shear energy. The body stays within
roundoff of rest; wheel/engine speeds remain exactly zero with service brakes.
A request for that equilibrium at mu=.03 is rejected as physically infeasible.
The independent unstrained-release case moves only **4.17 mm** after5 s and its
speed falls to **5.04e-6 m/s**, rather than the old law's persistent .02779 m/s
creep. Gravity loads the springs through actual motion; no preload controller acts.

Other actually executed results:

- **Insufficient grip:** at mu=.03 on5 degrees, body speed reaches -.5636 m/s
  after1 s while all wheel rotors remain locked and tire contacts slide.
- **Rear handbrake only:** front wheels remain mechanically free; after5 s the
  body speed is1.22e-6 m/s, rear wheels are exactly locked and rear contacts each
  carry approximately44.46 N. Front traction approaches zero.
- **Uphill propulsion:** engine/clutch torque produces +.5264 m/s and +.2608 m
  uphill after1 s. No velocity is assigned to propel the vehicle.
- **Locked-wheel braking and drifting/recovery:** contacts transition between
  grip and gross sliding; combined-friction bounds and energy accounting pass.
- **Natural unloading/recontact:** an initial upward wheel velocity produces
  separation and return, with zero airborne traction and tracked internal decay.

There is an **adverse handling difference**, deliberately not tuned away. The
matched braking first crossing of .01 m/s changes from baseline .78127 s/1.91289 m
to .74316 s/1.86946 m. Subsequent body recoil reaches -.243 m/s versus baseline
-.169 m/s; tires and suspension return stored energy while rotors remain locked.
The independent braking test checks damping/settling over3 s, not monotonic body
speed. These are uncalibrated reduced-model behaviors, not real-car predictions.

## Numerical validation

All **16 new tests** and **40 preserved POC/diagnostic tests** passed (56 unique
groups, executed in batches); **82 strict-reference tests** and the **1080-state
bit-exact replay** passed. The old terrain-gate limitation remains correctly
reproducible for the historical velocity-only law; only this isolated model clears
that static-contact gate. No historical fixture was edited.

All **70 timing runs and33 validation case/rate combinations completed**, at
1/.5/.25 ms. Exact locked-clutch speed residual remained zero. Maximum force
residual was 9.9973e-12 N and friction excess 8.7539e-12 N, within the
unchanged bounds. Maximum observed force trials: 8 of24. Independent tests
cover analytic elastic/plastic energy fixtures,1000 fixed-seed local load/change
cases, frame objectivity, body/yaw/rotor impulse balance, direct total-energy
calculation, holding/breakaway/recovery and transactional rollback.

Largest cumulative total energy/work residual: **1.91562e-11 J**. Energy
closure is now at accumulation roundoff, not evidence of real-world accuracy.
Matched physical-time refinement also checks body state, wheel speed and shear:

| Case | Max energy/work error at1 ms (J) | Position difference1/.5 ms versus .25 ms (m) |
|---|---:|---:|
| acceleration | 8.2068e-13 | 4.0559e-09 / 8.1109e-10 |
| steering | 2.7853e-12 | 5.8983e-08 / 1.1797e-08 |
| braking | 4.5475e-12 | 8.9768e-07 / 1.7471e-07 |
| drift-recovery | 5.9117e-12 | 1.0703e-06 / 3.54e-07 |
| recontact | 5.6843e-13 | 4.5362e-07 / 1.1223e-07 |
| clutch-transition | 7.0344e-12 | 1.7866e-08 / 7.2387e-09 |
| hold-release | 4.9627e-13 | 1.7691e-08 / 3.5346e-09 |
| slope-hold | 1.1369e-13 | 2.3943e-15 / 1.1486e-15 |
| slope-insufficient-grip | 7.3808e-13 | 5.3655e-07 / 1.0731e-07 |
| uphill | 2.3874e-12 | 8.1359e-09 / 1.627e-09 |
| unloading-recontact | 4.1789e-13 | 2.3205e-07 / 1.5031e-07 |

All25 represented mechanical-state errors and eight shear errors are saved with
units in `results/refinement.json`. Smooth cases refine as expected; normal-contact,
plastic-yield, brake/clutch and engine/input events limit a universal order claim.
Mode event timestamps in the report are accepted-step observations, not claimed
substep-accurate tire-transition times.

## Complete-step CPU comparison

Node24.19.0 / Xeon Platinum8573C, five exposed logical CPUs, four CPU-equivalents
quota, shared cloud host. Headless CPU only; no GPU/browser/FPS claim. Identical
initial mechanical states and controls on flat ground, seven one-second cases,
1 ms, full warmup per method then five alternating paired runs, discard first.
Medians of four remaining run statistics. Initialization, validation and output
are excluded; whole-process CPU includes common counters/timers. No profiler or
other local tests ran concurrently. The compared tire laws and state sizes differ
by design; this is an overhead measurement, not equivalent-solution speedup.

| Case | Baseline CPU ms/sim s | Bristle CPU ms/sim s | Baseline / bristle trials per step | Bristle median / p95 / p99 ms |
|---|---:|---:|---:|---:|
| acceleration | 54.45 | 104.70 | 6.087 / 5.922 | 0.0482 / 0.1754 / 0.3237 |
| steering | 48.56 | 66.17 | 6.598 / 6.561 | 0.0548 / 0.1432 / 0.2317 |
| braking | 42.04 | 56.42 | 6.654 / 6.462 | 0.0481 / 0.1148 / 0.2083 |
| drift-recovery | 50.29 | 69.21 | 7.374 / 7.278 | 0.0559 / 0.1514 / 0.2662 |
| recontact | 40.98 | 58.72 | 7.009 / 7.090 | 0.0495 / 0.1143 / 0.1993 |
| clutch-transition | 37.40 | 52.25 | 5.130 / 5.113 | 0.0488 / 0.1168 / 0.2161 |
| hold-release | 31.79 | 44.02 | 3.940 / 3.862 | 0.0484 / 0.0938 / 0.2043 |

Equal-case CPU mean: **43.64 → 64.50 ms/sim s**,
**1.48× cost (+47.8%)**. The new model still completes roughly
15.5 simulated seconds per CPU-second in these headless cases.
Worst new observed step was 3.759 ms; worst baseline
was 4.462 ms. These are observations, not hard real-time
latency bounds. Raw baseline/new p95/p99, every run and failure fields are saved.
No allocation optimization or further solver campaign was undertaken. The adapter
still performs an old-law initial diagnostic evaluation before its bristle predictor;
that known overhead is included, not hidden. No new- versus strict-model speedup
is inferred from historical runs on a differently warmed runtime.

## Remaining physics risks and terrain verdict

A deliberately retained characterization exposes a limitation: at imposed slip
.001 m/s, N250 N and mu.9, force grows from2.79 N at.1 s to20.79 N at1 s and reaches
225 N by12 s. This is ordinary dry elasto-plastic contact behavior, but **there is
no rolling contact-patch renewal**. The same macroscopic slip input lacks a rolling
speed/patch residence time, so this is not a validated pneumatic steady slip-ratio
or slip-angle curve. The characterization is not a driven vehicle experiment.
Do not silently fit K/c or add damping to conceal this limitation or brake recoil.

**Verdict:** static/sliding mechanics are verified for the bounded reduced,
fixed-plane contact experiment. Do **not** treat it as the definitive real tire
model or integrate full variable terrain yet. Changing-normal contact geometry,
normal/tangent work mapping, objective history transport, rolling patch renewal
and calibration remain unresolved. Existing small-angle/shared-horizontal chassis,
fixed nominal lever arm, ideal differential/fixed gear and mean-engine limitations
remain. No measured vehicle handling validation, camber, pneumatic aligning moment,
full3D chassis or arbitrary-terrain interface is claimed. The selected formulation
is retained as an isolated research result; no second solver/model campaign begins.

## Reproduce

From repository root; no new dependencies:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/static-contact/*.test.mjs
# Run timings separately from tests/profiling:
node research/scientific-rebuild/fast-vehicle-poc/static-contact/benchmark.mjs
node research/scientific-rebuild/fast-vehicle-poc/static-contact/characterize.mjs
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs research/scientific-rebuild/fast-vehicle-poc/constraints.test.mjs research/scientific-rebuild/fast-vehicle-poc/consistency.test.mjs research/scientific-rebuild/fast-vehicle-poc/efficiency/efficiency.test.mjs research/scientific-rebuild/fast-vehicle-poc/terrain-gate/gates.test.mjs
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
```

Import `create,step,energy,totalWork` from `static-contact/vehicle.js` to run the
new model; the old optimized POC remains its original entry point. `create({angle:
5*Math.PI/180,equilibrium:true})` makes a static preloaded, engine-stopped state;
use service brakes (or release from zero preload with only a rear handbrake) in
stepping. All new JS modules passed `node --check`. Regeneration overwrites only
this experiment's result directory. Historical records are preserved; this
experiment is not connected to production or rendering.
