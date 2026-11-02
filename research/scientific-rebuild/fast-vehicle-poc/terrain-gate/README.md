# Variable terrain — necessary-contact gate

**Verdict: BLOCKED under the current contact representation. No variable-terrain
vehicle was implemented.** This is the minimal-reproduction stopping case allowed
by the mission, not a successful terrain rollout or a new solver proposal.

Branch **PERFORMANCE**, base `71cfb6c1295e9e4bea923ff3ff27e87633aa1f8f`. Only this diagnostic directory is new.
The optimized flat POC, procedural-terrain sources, production and historical
fixtures/results are unchanged. The containing commit and provenance hashes
identify the delivered experiment. No new branch, physical tuning or dependencies.

## Confirmed physical blocker: static road contact is missing

The current constitutive law is `F_t=-800*slipVelocity`, radially limited to
`mu*N`. At zero body/contact velocity and zero wheel spin, its tangential force
is **exactly zero**, regardless of brake torque capacity. On a nonhorizontal
plane, static equilibrium instead needs an uphill tangential force. Projecting
all normal forces onto the slope tangent gives zero, while gravity contributes
`-m*g*sin(alpha)`. Suspension forces are internal and cannot remove this deficit.
This argument is independent of axle-load distribution, solver choice or timestep.

The fixture uses the existing terrain sampling interface, conservative normal
potential and unchanged tire/brake/rotor functions on a modest **5°** plane:

| Quantity | Measured / independently calculated |
|---|---:|
| Total represented mass | 104 kg |
| Required uphill tire force | 88.919775 N |
| Available combined friction | 914.721911 N |
| Current zero-slip tire force | 0 N |
| Downhill tangential acceleration from rest | 0.854998 m/s² |
| Required brake torque per wheel, if static traction existed | 7.113582 Nm |
| Existing front / rear service capacity | 99.760120 / 70.014993 Nm |

Normal loads come from the existing vertical-gap potential with its slope-dependent
normal-gap stiffness interpretation. Normal-direction gravity balance is used to
isolate the missing tangential balance; this is not claimed to initialize a full
suspension equilibrium. All four wheel speeds and engine speed remain exactly zero;
the existing brake/clutch kernels can also hold the **hypothetical** required
traction reactions. That latter check is a feasibility oracle, not an extra force
applied to the simulator. The failure is **not** insufficient grip or weak brakes.

To reproduce the consequence dynamically, `creepRun` integrates the one-DOF
locked-wheel reduction along the plane, using the unchanged tire law and actual
bounded rotor flow. Normal motion is constrained and loads allocated equally;
this is a necessary-condition diagnostic, **not a four-wheel chassis simulator**.
There are no assigned wheel speeds, resets or hidden holding forces: actual
rotor outputs are retained, and the diagnostic stops if a wheel leaves its locked
domain. Since friction is unsaturated here, the independent closed form is

```
m*dv/dt = m*g*sin(alpha) - 4*k*v
v_infinity = m*g*sin(alpha)/(4*k)
v(t) = v_infinity*(1-exp(-4*k*t/m))
```

| Step | Speed after 1 s (m/s) | Downhill travel (m) | Energy/work error (J) |
|---|---:|---:|---:|
| 1 ms | 0.027787429682 | 0.026884338217 | 7.6527e-10 |
| 0.5 ms | 0.027787429682 | 0.026884338217 | 4.7343e-11 |
| 0.25 ms | 0.027787429682 | 0.026884338217 | 2.9483e-12 |

Wheel speeds stay exactly zero. Tire work is dissipative and the mechanical work
ledger converges, yet the vehicle reduction creeps at about **0.02779 m/s**.
Refining the timestep reproduces the same motion: this is a constitutive limitation,
not an integration error. Energy closure and exact wheel locking do not establish
static tire/road holding. The reduction does not validate full suspension, terrain
load transfer, uphill propulsion or drifting behavior.

A nonzero force at zero slip requires a different contact representation: a
set-valued static tangential reaction or elastic tire-deformation state with its
stored energy and unloading rules. The present single-valued finite-velocity law
has neither. Increasing its coefficient merely reduces creep and stiffens the
solve; a slope-canceling force or velocity snap would be an artificial stabilizer.
A larger optimizer solving these same equations cannot create the missing force.
These alternatives **do not inherently require FISTA**, but their coupled
formulation, physical transitions and cost have not been established here. I
stopped before starting a new tire/constraint model and solver campaign.

## Geometry/work warning for a naive adapter

A second witness tests an explicit proposed sampling point
`p_xy=C_xy+R(yaw)*[x+H*pitch,y+H*roll]`, `p_z=hubZ`. Its derivative contains
additional yaw–pitch/roll terms absent from the current flat virtual-slip rows.
Using this point for the terrain potential but the flat rows for normal reaction
work creates approximately **0.046734 W** imbalance in a mild fixture
(pitch .02 rad, roll -.01 rad, yaw rate .2 rad/s). The independently differentiated
potential agrees with this proposed point's actual derivative to about 2.7e-10 W.
A closed yaw/pitch loop also integrates the flat virtual row to about .5 mm of
nonzero point travel while configuration returns to its starting value.

**Scope of this witness:** it rules out blindly pairing that sampled-point
potential with the flat virtual rows. It is not proof that terrain is impossible,
that this particular point map must be adopted, or that every non-holonomic
contact velocity is invalid. Tangential material/rolling velocities can be
non-holonomic. A complete terrain extension needs a separately derived,
work-conjugate normal/contact Jacobian and consistent tangent/rotor mapping.
Local geometry corrections alone do not remove the static-contact blocker.

## What was validated, and what was stopped

| Requirement | Status |
|---|---|
| Existing hills/rough/road height gradients | PASS against independent finite differences |
| Conservative terrain-normal force | PASS against independent potential gradients |
| Tangent/normal axes | PASS orthogonality checks using source frame interface |
| Independent four-corner sampling | PASS, including distinct heights and loaded/unloaded contacts |
| Normal-potential unloading/recontact math | PASS in a prescribed contact-point test |
| Stationary braked slope under current tire law | **FAIL — analytically/numerically reproduced** |
| Existing exact clutch/brake kernel | PASS; preserved, not redesigned |
| Full terrain suspension/force/work coupling | **NOT IMPLEMENTED** |
| Full-vehicle uphill/downhill, bumps, crests, braking/drifting and refinement | **NOT RUN — dependent work stopped** |
| New-terrain transactional rollback and convergence/stall rates | **NOT MEASURED** |

Six new tests verify the counterexamples and sampler/contact math. Their green
result means the documented limitations were reproduced; it does **not** turn
stationary-equilibrium failure into a terrain acceptance PASS. All **34 existing
POC test groups** also passed (40 unique tests in two batches), including prior
energy, locking, holding, rollback and refinement checks. The source **1,080-state
bit-exact replay passed**. No browser test or production modification occurred.

## Performance diagnostics — no full-terrain speedup claim

Node 24.19.0, Xeon Platinum 8573C, five exposed logical CPUs, shared cloud host.
Headless CPU only. Two full warmup passes per mode/case; four paired timed passes,
first discarded. Table values are medians of three run statistics. All flat
physics steps completed with unchanged force-consistency counts between modes.

| Case / diagnostic mode | CPU ms/sim s | p95 / p99 step ms | Worst observed ms |
|---|---:|---:|---:|
| acceleration / flat | 35.75 | 0.0585 / 0.1476 | 0.298 |
| acceleration / flat+observations | 46.26 | 0.0693 / 0.1715 | 1.437 |
| drift-recovery / flat | 46.53 | 0.0709 / 0.1654 | 0.360 |
| drift-recovery / flat+observations | 51.23 | 0.0858 / 0.1864 | 0.514 |

**flat+observations is NOT terrain dynamics**: four world-point terrain/normal
observations are computed after an unchanged flat step, without applying forces.
This isolates some sampling/math cost. It is neither a lower/upper bound nor an
estimate of complete terrain-coupling overhead. New-terrain CPU, iterations,
p95/p99 and worst stalls remain unknown because that model was not built. Host,
JIT and GC variation remain; no real-time deadline or GPU/FPS claim is made.

To identify the original cost multiplication, three bounded 100-step executions
of the existing strict road adapter were instrumented (first discarded). Each
accepted all 100 requested steps. Each accumulated **500 endpoint iterations,
25,769 contact iterations and 7,280 terrain samples**: about **5 outer iterations,
257.69 inner iterations and 72.8 samples per physics tick**. The two measured
prefixes used approximately 181.4 and 109.8 ms CPU over .1 simulated second.
The repeated unified solve accounted for about two-thirds of marked stage wall
time. CPU and wall-stage percentages are different measures. Short-run timings
were variable; no original worst-case freeze was reproduced in this mild prefix.

Source inspection confirms up to **80** endpoint trials, each invoking the
unified contact/clutch/brake solve; its steering-enabled FISTA calls permit up to
**20,000** iterations per mode. Those are caps, not observed counts. Repeated
sampling, trial cloning and matrix/contact work multiply inside that nesting.
This supports avoiding an endpoint loop wrapped around a large optimizer; it
**does not prove** that any simpler physically complete terrain method is fast.
No such loop or new optimizer was introduced here. Raw per-run latency, counters,
failures (none in these prefixes) and stage marks are in `results/probe.json`.

## Reproduce and decide

From repository root, no dependencies added:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/terrain-gate/gates.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/terrain-gate/measure.mjs
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs research/scientific-rebuild/fast-vehicle-poc/constraints.test.mjs research/scientific-rebuild/fast-vehicle-poc/consistency.test.mjs research/scientific-rebuild/fast-vehicle-poc/efficiency/efficiency.test.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
```

All new JavaScript modules passed `node --check`. Results, units, exact fixture
inputs and source hashes are retained; only this directory's result files are
regenerated. Relevant source: `../consistent-model.js` (velocity-slip law),
`../constraints.js` (exact rotor mechanics), and
`../../procedural-terrain/src/{terrain,normal-contact,contact-frame,vehicle}.js`.
The procedural terrain sampler is reusable; physical contact representation is
the blocking issue, not availability of a height field.

**Decision:** stop at the reproducible contact-model limitation, as authorized.
Do not claim a working terrain vehicle or integrate this experiment. The next
necessary decision is a physically and energetically defined static tire/contact
formulation, followed by a work-conjugate terrain interface. Its implementation
size, performance, convergence and broader operating validity remain unmeasured.
Do not infer that it requires a large global optimizer—or that efficient full
terrain coupling has already been demonstrated.
