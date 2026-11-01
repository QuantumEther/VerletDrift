# Mission 15 — numerical precision versus work

**Decision:** retain an **opt-in balanced numerical profile**; keep the original
strict default and all reference fixtures unchanged. On the measured 1 ms
workload it delivers **1.324× aggregate throughput** (24.5% less CPU), with
53.4% fewer inner iterations and 13.5% fewer endpoint iterations. Do not adopt
1e-9 contact tolerance as the general preset: it causes additional constitutive
failures at 4 ms. No lower physical subsystem update rate is adopted.

Base `2caf5f45f989b04f6de282b880837b1a29069622`, existing branch
`scientific-rebuild/12-braking-and-tire-contact`. Production, Experiments 1–10,
scientific reference, tire parameters/laws, physical drivetrain/steering/
suspension equations, browser controls and all historical results are unchanged.

## Selected settings and actual measurements

```js
import {NUMERICAL_EXPERIMENTS} from './src/numerical-settings.js';
vehicle.numerics = NUMERICAL_EXPERIMENTS.balanced;
// Pass this wrapper to stepTerrainVehicle(vehicle, ports, .001).
// Delete vehicle.numerics to return to the strict reference.
```

This is a headless research API, **not a new browser default or UI selector**.
Non-strict settings explicitly reject the inherited flat dispatch, rather than
silently ignoring options or changing protected Experiment 10. The tested
operating terrain is road/seed42/amplitude0.001m/roughness0.1, A and B at B's
0.5m/s floor. Primary qualification is at **1 ms**.

| Criterion | Strict default | Balanced opt-in |
|---|---:|---:|
| Contact pre-polish projected residual | 1e-12 | 1e-10 |
| Terrain contact position | 1e-11 m | **1e-11 m, unchanged** |
| Generalized velocity | absolute 1e-10 in each coordinate's units | scaled absolute+relative 1e-9 |
| Local discrete contact-work identity | 1e-9 J | unchanged |
| Contact/full mechanical energy | 1e-7 J | unchanged |
| Tire constitutive impulse residual | 2e-8 N s | unchanged |
| Friction, finite-state checks, mode/event rules, iteration caps | original | unchanged |

Contact iterate residuals use the original mixed generalized impulse coordinates;
they are **not a uniform force error in N**. Scalar polish and every physical
check still run. A separate 30-case probe across 1/2/4ms finds maximum pre- and
post-polish accepted-mode residual **9.9764e-11**, below the selected tolerance.

Scaled velocity requires **every** component to satisfy
`abs(v1-v0) < atol*scale[i] + rtol*max(abs(v1),abs(v0))`. The explicit scales are
`[1,1,1,1,.01,100,100,1,1,1,1,1,1,1,1,1,1,1]`: wheel rad/s, selector m/s,
engine/input rad/s, translational m/s, yaw/column rad/s, then heave m/s,
pitch/roll rad/s and hub m/s. These are numerical normalization scales, not
changes to physical parameters or a coordinate-invariant norm. The selector
floor stays small. First endpoint trials still cannot pass without a prior
velocity. Absolute reference diagnostics remain available unchanged.

Final repeated comparison, CPU milliseconds per actual simulated second:

| Tire | CPU strict → balanced | Median tick ms | p95 tick ms | p99 tick ms |
|---|---:|---:|---:|---:|
| A | 1354.45 → 1061.19 | 1.156 → .901 | 1.868 → 1.455 | 2.366 → 1.888 |
| B | 1653.54 → 1209.86 | 1.342 → .987 | 2.026 → 1.575 | 2.475 → 2.134 |
| Equal-work aggregate | 1503.99 → 1135.52 | 1.295 → .964 | 1.937 → 1.531 | 2.475 → 1.955 |

Quantiles are medians of per-run quantiles, not pooled ticks. Actual mean
inner iterations/tick: **435.82→203.23**; endpoint iterations: **5.6895→4.9210**.
Paired median CPU ratio 0.749, bootstrap95 interval [0.712,0.791], seed15,
5,000 resamples. Samples share cases/host; this is not a universal guarantee.
**Worst observed tick regressed: 10.22→17.65ms**, despite improved median/p95/p99.
Its cause was not established. No hard real-time guarantee is claimed, and the
aggressive workload still exceeds one CPU second per simulated second at 1000Hz.

Node24.19.0, Linux, Intel Xeon Platinum8573C, five exposed logical CPUs / four-CPU
quota, shared host. Four scenarios × A/B × five repeats (first warmup), 0.5s/run;
final controls alternate strict/balanced then balanced/strict. Initial states and
inputs are deterministic; initialization/serialization are excluded. Step timers
measure stepping only; whole-run CPU includes common trace/event extraction.
B remains research; this is not a renewed <=1.10× B-retention certificate.

## Independent sweeps and why the compromise is not the loosest setting

`screen.json`: contact 1e-12/11/10/9/8/7; position 1e-11/10/9/8 m;
absolute velocity 1e-10/9/8/7; scaled velocity 1e-10/9/8. Vary one criterion at
a time, retaining all physical gates. It is a short selection screen, not a
throughput confidence interval. `paired.json` supplies the longer rotated
candidate comparison; `retained.json` is the clean final two-setting benchmark.

- Contact1e-10 roughly halves inner work. Contact1e-9 removes about70% but
  sometimes increases outer iterations and fails additional coarse-rate cases.
- Contact1e-8 fails 2/10 short screen cases; 1e-7 fails 10/10. These are **FAIL**,
  not faster completed trajectories. Last accepted states/history are preserved;
  failed-step iterations are separately replay-counted outside timing.
- Loosening position alone removes **zero iterations** and changes no measured
  state: velocity convergence binds first. Leave position at1e-11m.
- Absolute velocity1e-8 reduces outer work but supplies less useful uniform
  scaling. Combining contact1e-10 with scaled1e-9 is the retained compromise.
- A 1s control with contact1e-9 found identical states/errors and counts with
  position1e-10 versus1e-11; there is no reason to relax position.

## Physical consequences and finer references

Deterministic tests include full braking from5m/s, steering reversal, initial
11.31deg sideslip with rear overspeed and a real rear-brake torque interval,
unloaded-wheel recontact, clutch lock/stall, and15mm heave decay. These are the
existing synthetic reduced vehicle, **not calibrated real-car performance**.
Ten A/B cases run1s and heave runs2s. Strict references also run at0.5 and0.25ms.
Every reference and candidate in these long 1ms comparisons completes.

Measured balanced-minus-strict maxima on matched1ms samples:

| Quantity | Maximum difference |
|---|---:|
| World position | 1.157e-10 m |
| Body velocity component | 7.703e-10 m/s |
| Yaw rate | 4.895e-11 rad/s |
| Heading | 1.300e-11 rad |
| Wheel speed | 1.562e-9 rad/s |
| Tire force component | 7.955e-7 N |
| Normal load | 2.410e-7 N |
| Chassis height | 5.837e-11 m |

These are numerical differences between this model's solutions, **not physical
accuracy to picometres**. Engine/contact/clutch event logs are identical at1ms
resolution; stall occurs at0.278s. Stopping uses a0.01m/s speed threshold with
linear interpolation; candidate/strict distance differences below2e-12m only
show indistinguishable numerical interpolants, not sub-timestep event accuracy.

Braking distance: strict1ms **2.067528m**, strict0.5ms **2.068778m**, strict0.25ms
**2.069403m**. Successive differences approximately halve, while the balanced
profile is indistinguishable from strict1ms. Across the other cases, timestep
changes produce up to1.25mm trajectory and11.7N force differences—many orders
larger than tolerance changes. Force stages and hybrid event timing differ under
refinement. Do not interpret a force-jump difference as a calibration error.

Large-slip recovery ends near0.83949deg sideslip (from11.31deg); final yaw is
-0.050719rad/s. Countersteer final yaw is-0.092626rad/s. Balanced follows both
strict histories within the bounds above. Wheel loss/recontact times match;
unloaded wheels have zero friction. Heave peaks at0.67/1.34s are4.8813/1.5921mm
above the initial equilibrium estimate; balanced peak differences are about1e-11m.
Refinement changes those amplitudes by tens of micrometres. Peak summaries use
100Hz saved diagnostics, not a precisely identified damping eigenmode.

**Refinement limitation:** countersteer heading is not monotonically convergent
in these three grids: maximum successive differences10.4 then20.8microrad.
The cause is unresolved here. No convergence-order claim is made for that field;
tolerance differences remain many orders smaller. `summary.json` preserves all
unit-separated refinement errors rather than hiding this exception.

Maximum balanced energy residual7.8884e-8J, constitutive impulse residual8.6155e-10Ns,
friction excess8.53e-14N (floating roundoff). Original checks remain active.

## Update-frequency investigation

| Subsystem | Finding and decision |
|---|---|
| Engine | Throttle/starter/mode and end-stage work depend on the current rotor and accepted h. Keep every physical stage; identical entry preparation within endpoint trials is redundant. |
| Brake actuation | Pure quasi-static function of current pedal/cable inputs. Input-change caching is mathematically possible; no dynamic brake rate was lowered. |
| Steering geometry | Geometry/Jacobian at identical entry column state can be reused within a candidate; column dynamics and contact reactions still need the coupled stage. |
| Suspension | Spring/damping depend on endpoint displacement/velocity and contact load. Keep coupled endpoint evaluation. |
| Drivetrain | Clutch slip/lock, rotor reaction, selector constraints and events remain in every contact solve. No coarse polling. |
| Tire/terrain contacts | Loads, friction feasibility, opening/recontact and energy work must use coherent stage states. No held force or skipped contact solve. |

A candidate reused entry engine/brake/steering calculations once per candidate,
with bit-identical physical state in its focused test. Median CPU saving was
only1.5%, borderline interval [0.964,0.999] ratio. **Rejected as insufficient
potential**; active implementation removed. Its reproduction patch is retained.
This does not establish that engine or contact dynamics can safely run at10Hz;
no such multirate vehicle was implemented or claimed validated.

## Limits, failures and preservation

At2ms large-slip cases hit the energy guard at0.200/0.204s with **strict and
balanced**. At4ms both stop at0.052s. These are preserved baseline/domain
limitations; partial trajectories are not successful accuracy results. The
1e-9 contact candidate additionally fails constitutive checks immediately in
some4ms countersteer/recontact cases, so it is not the retained preset.
Non-flat gear-event crossings remain explicitly unsupported/rollback-safe;
flat experiments and their events remain on the unchanged reference dispatch.

82/82 Experiment11 tests, 24/24 Experiment10 tests pass. A default and explicit
1,080-state bit-exact replays pass. B reference/matrix1,680-state bit-exact replays
pass; existing selected-B equivalence to older pre-warm data remains unchanged.
The browser terrain/engine/driving/reset check passes under Chromium154 with
SwiftShader; it is a functional check, not GPU or opt-in performance evidence.
All protected files and previous results are unchanged. No automatic fallback,
force parameter change, damping correction or unconverged acceptance is added.

## Reproduction

From repository root:

```sh
node --test --test-isolation=none research/scientific-rebuild/procedural-terrain/tests/*.test.mjs
node --test --test-isolation=none research/scientific-rebuild/four-corner-load-transfer/tests/*.test.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs
node research/scientific-rebuild/procedural-terrain/tools/tire-baseline.mjs --explicit
VARIANT=reference node research/scientific-rebuild/procedural-terrain/tools/contact-replay.mjs
VARIANT=matrix node research/scientific-rebuild/procedural-terrain/tools/contact-replay.mjs
node research/scientific-rebuild/procedural-terrain/tools/contact-replay.mjs --equivalent
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/procedural-terrain/tests/browser-terrain.mjs
```

From `research/scientific-rebuild/procedural-terrain` (benchmarks serially):

```sh
DURATION=.12 PROFILE=1 node tools/precision-m15.mjs > screen-current.json
DURATION=.5 REPEATS=5 CONFIGS=strict,moderate CASES=hard-braking,countersteer,large-slip,recontact node tools/precision-m15.mjs > results/precision-m15/retained.json
DURATION=1 FINE=1 CONFIGS=strict,fast,moderate CASES=hard-braking,countersteer,large-slip,recontact,stall SAVE_TRACES=validation-traces.json.gz node tools/precision-m15.mjs > results/precision-m15/validation.json
DURATION=2 FINE=1 CONFIGS=strict,fast,moderate CASES=heave SAVE_TRACES=heave-traces.json.gz node tools/precision-m15.mjs > results/precision-m15/heave.json
DURATION=1 CONFIGS=fast,fast-position-strict CASES=hard-braking,countersteer,large-slip,recontact,stall node tools/precision-m15.mjs > results/precision-m15/position-control.json
H=.002 DURATION=.3 CONFIGS=strict,fast-position-strict,moderate CASES=hard-braking,countersteer,large-slip,recontact node tools/precision-m15.mjs > results/precision-m15/rate500.json
H=.004 DURATION=.3 CONFIGS=strict,fast-position-strict,moderate CASES=hard-braking,countersteer,large-slip,recontact node tools/precision-m15.mjs > results/precision-m15/rate250.json
node tools/residuals-m15.mjs > results/precision-m15/residuals.json
python3 tools/summarize-precision-m15.py
```

`screen.json` and `paired.json` also include rejected reuse/balanced prototypes.
Reproduce those in an isolated archive with `rejected-input-reuse.patch` applied;
do not apply it to the working simulator. The original paired command is
`DURATION=.5 REPEATS=5 CONFIGS=strict,contact-10,contact-9,velocity-8,fast,moderate,reuse CASES=hard-braking,countersteer,large-slip,recontact node tools/precision-m15.mjs`.
Current default screen omits rejected candidates. Raw protocol records snapshot
all original configurations. Fixed numerical results are reproducible; timings
vary with the host. Never recapture/overwrite historical expected fixtures.
Saved traces are decimated to100Hz for size; error comparisons use every matched
1ms sample, and contact events/minimum loads every accepted physical step.
