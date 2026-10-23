# Drivetrain repair — blocked prototype, not accepted

Branch: `recovery/drivetrain-repair`, starting from diagnostic commit `a2452e2` on top of `recovery/realtime` (`b23935b`). Original branches are unchanged. **Do not merge or deploy this prototype.** Implementation stopped because integrated clutch work accounting is not mechanically trustworthy. No parameter adjustment or extra substepping was used to conceal the failure.

## What is implemented

The prototype has signed crank dynamics, finite-capacity friction impulses, an analytic shared rear-shaft mobility, finite starter torque, one combustion mode, pending gear requests, a lumped gearbox-input shaft and bounded synchronizer impulses. Engine OFF retains mechanical rotation. The button requests start/stop rather than assigning RPM. Existing instruments display starting/stalled modes and pending gears without a layout change. Automatic rev matching is removed. These are prototype capabilities, not completed acceptance claims.

Call flow: keyboard → requested gear / clutch input; button → engine command; mechanical tick → pedal and gear transition → engine torque/drag/starter impulse → suspension → existing scalar tire/contact solves with shared input-shaft mobility → joint clutch/rear-brake impulses → mode/RPM readouts → chassis integration → existing renderer/instruments. Torque curves, contact-force equations, steering, chassis, suspension, geometry, artwork and Mission 02/03 branches were not changed.

The clutch and synchronizer use `J=clamp(s/(1/Ia+1/Ib),−C·dt,+C·dt)`. The inverse rear inertia matrix is derived analytically from `Iw·Identity+Jshaft·g²/4·ones(2,2)`. Isolated clutch impulses conserve generalized momentum and dissipate `J·s−J²(1/Ia+1/Ib)/2`. In brake cases, at most 27 sticking/sliding combinations are checked, each a linear system of order ≤3. This is a bounded dry-friction solve, not a nonlinear tire solver. It avoids the earlier invalid split in which the clutch reaccelerated wheels after a completed brake solve. Joint friction loss is stored together; it is not falsely partitioned into individual brake/clutch heat.

New physical assumptions, not vehicle calibration: gearbox input inertia 0.02 kg·m², synchronizer capacity 20 N·m, starter 40 N·m, firing threshold 400 RPM; dog disengagement resistance uses fork force 50 N, pitch radius 0.03 m and friction coefficient 0.1. Clutch capacity starts at the old 350 N·m maximum but is independent of combustion output. The existing slipping-mode idle governor limit (25% peak torque) is used continuously across slip/lock; the old lock-only `idleCreepForce` cap is not used. That legacy UI parameter therefore has no effect in this prototype, a remaining presentation/configuration issue. There is no anti-stall, automatic shifting or rev matching.

## Acceptance blocker

The engine advances independently at [engine.js:97](../js/physics/engine.js#L97), road contacts advance next, and [engine.js:119](../js/physics/engine.js#L119) projects the provisional speeds through the clutch. [engine.js:133](../js/physics/engine.js#L133) records that projection loss as clutch heat. This is valid for an isolated engagement but incorrectly treats the holding reaction of an already static clutch as new slipping friction. External engine work is also sampled before the coupled final speed is known. Thus the current work journal does not distinguish physical clutch heat from operator-splitting loss. The scalar contact solve uses provisional rotor speeds rather than the final crank-coupled response, so correcting only the displayed counter would not validate contact passivity or the full energy budget.

A focused regression begins with compatible crank/input/wheel speeds, no road contact, and an applied engine torque below clutch holding capacity. A holding static clutch must do zero slip work. The prototype reports this false heat in one tick:

| Physics Hz | Recorded heat, J | Expected physical clutch heat |
|---|---:|---:|
| 50 | 21.379758 | 0 |
| 100 | 5.349215 | 0 |
| 200 | 1.337839 | 0 |
| 400 | 0.334527 | 0 |

These four tests intentionally **fail normally**, with no expected-failure annotation. This is a work-accounting/integration failure; the counters alone do not prove that the same number of joules is missing from the final physical trajectory. In the isolated constant-impulse common mode, final velocity response is correct. A work-consistent coupled update, including contact reactions and lock/slip boundaries, is still required.

The smallest next adjustment is to let the rear-rotation integration boundary own engine torque, shared inertia, clutch/brake active states and the returned road impulses over the same interval. Tires should supply their existing contact-force callbacks and receive impulses for the chassis. A constant-matrix holding solve must account external work at coupled midpoint velocities; finite-capacity slip transitions must remain passive. Whether this can retain the existing scalar contact integration with bounded fixed work and acceptable 100 Hz error has **not** been demonstrated. No generalized framework or Mission 02/03 solver is proposed. The milestone stopping rule applies here; the prototype is not ready for further integration acceptance.

## Tests and necessary expectation corrections

The original strict baseline was reproduced unchanged: **11 pass, 15 fail**. The final targeted run has **113 pass, 4 fail**. All 26 corrected diagnostic scenarios are ordinary passing tests; all 6 engine, 14 wheel and 46 Mission 01 tests pass, with the engine expectation corrections listed below. The added pure rotational, starter and gearbox tests pass. The four failures are the static-clutch work cases above. This does not meet the request's final acceptance criterion.

Several original assertions embodied the faulty model and could not be preserved literally:

- Neutral may exchange clutch torque with the newly represented input shaft; the invariant is zero wheel drive, not zero crank/input torque.
- A stalled engine stops combustion; its speed and clutch reaction must not be reset to zero. The qualitative takeoff check now checks the combustion mode rather than forbidding mechanically transmitted torque after stall.
- A finite clutch may remain slipping at full pedal release. The stationary-axle conservation case checks bounded impulse and momentum, not impossible instantaneous lock. The already-locked fixtures now start with compatible signed shaft speeds.
- Adding input-shaft inertia requires including its energy and generalized momentum, and the off-diagonal reaction, in the oracle. The common-mode torque response uses the net external engine impulse, not the distinct transmitted clutch impulse.
- A starter cannot preserve the old two-click instantaneous idle reset. That characterization now requires one explicit starter request, positive starter work and a finite first-step speed (10.60 RPM).
- The abrupt-release test's uncalibrated 0.2 s stall deadline came from instantaneous RPM locking. It now observes up to 1 s without requiring a velocity reset. This is a changed qualitative observation window, not proof of calibrated stall timing.
- The old engine tests now execute the full engine/contact/clutch sequence, initialize compatible lock speeds, retain post-stall mechanical speed and require finite reverse synchronization without a rev blip. Manually replacing axle speed with 24 rad/s and expecting an RPM overwrite was an unaccounted external intervention.

The diagnostic branch and its original expectations remain available. No conservation tolerance was relaxed. The static-holding heat tolerance is 1e−9 J; isolated impulse energy and momentum checks retain near-roundoff tolerances.

| Original known defect | Before | Prototype after, 100 Hz |
|---|---|---|
| Running at zero RPM after locking | 0 RPM, running | First tick 693.86 RPM; finite transfer |
| Throttle exempts stall | 0 RPM and 91.36 N·m after 1 s | Stalled after brake/throttle run |
| Road speed exempts low-RPM stall | 100 RPM at 1 m/s stays running | Stalled, mechanical RPM retained |
| Throttle-only restart | Instant 865.64 RPM | Stays stalled at 0 RPM |
| Button creates starter energy | Instant +877.30 J | Zero instantaneous energy; finite starter work |
| Pedal frozen with engine OFF | Remains released | Reaches fully depressed |
| Clutchless mismatched upshift | Immediate engaged ratio | Request changes; engagement not guaranteed |
| Hidden downshift assistance | 0.2 s rev blip | No blip |
| Reverse key forces engagement | Immediate R at 10 m/s | Pending request; finite synchronization |
| Signed crank relationship lost | Uses absolute shaft RPM | Signed omega retained; slip allowed if incompatible |
| Engagement destroys momentum | −20.94395 N·m·s | Residual 3.6e−15 including input shaft |
| Passive engagement injects energy | +372.7018 J | −29.7537 J in faster-wheel fixture |
| Independent half-inertias | Right reaction residual −0.005214 N·m·s | Residual 7.2e−15 in asymmetric fixture |
| OFF disconnects crank | Forced 0 RPM | Back-driven at 190.54 RPM |
| Stalled crank pinned at zero | Shaft turns, crank stays 0 | Crank 133.69 RPM, still stalled, finite slip |

Isolated slipping clutch: momentum error 3.6e−15 N·m·s, energy loss 59.49021136 J agrees with friction work to about 1e−13 J. Synchronizer impulse/work and finite-capacity lock/unlock tests pass. These local results do not resolve the holding-work blocker.

## Timestep measurements

Production mechanical prefix, 4 s traces. Gentle release uses 2 s pedal travel; launch uses throttle and releases the clutch after 0.6 s. Brake trace also releases after 0.6 s. All profiles and measurements are reproducible in the benchmark script.

| Hz | Startup final RPM | Gentle stall time, s | Brake stall time, s | Launch final speed, m/s | Launch recorded clutch heat, kJ |
|---|---:|---:|---:|---:|---:|
| 50 | 799.655 | 1.300 | 0.9800 | 9.60455 | 23.927 |
| 100 | 799.629 | 1.220 | 0.9700 | 9.51821 | 17.810 |
| 200 | 799.616 | 1.210 | 0.9650 | 9.49171 | 14.776 |
| 400 | 799.609 | 1.205 | 0.9625 | 9.48211 | 13.157 |

Startup and brake stall events converge; event times are quantized by their tick and transition conditions. Launch speed changes 0.38% from 100 to 400 Hz, but recorded heat changes 35.4% relative to the 400 Hz result. That heat column is an invalid physical estimate until the blocker is resolved. It must not be presented as a successful energy-convergence result. The shift trace holds throttle through shifts and remains pending in neutral, so it is a workload test, not a validated normal-shift demonstration.

## Runtime measurements

Same Node runtime and script, separate baseline/prototype invocations, 100 Hz; each profile has 1,200 warmup ticks and 3,200 measured ticks. Measurements include the full production mechanical prefix, exclude browser/render/audio, and include differing physical outcomes. Throughput includes driver/reset overhead. Worst cases include scheduling/GC noise. Baseline sources were extracted read-only into `/tmp`; no base branch was modified.

| Profile | Mean ms, base → prototype | p95 ms, base → prototype | Worst ms, base → prototype | Steps/wall-second, base → prototype |
|---|---:|---:|---:|---:|
| Clutch/braking | 0.0512 → 0.7031 | 0.2135 → 1.2593 | 0.9461 → 9.5768 | 19,188 → 1,420 |
| Launch | 0.8836 → 0.8170 | 1.6983 → 1.5467 | 5.4621 → 18.1382 | 1,130 → 1,222 |
| Gear requests | 0.8020 → 0.9097 | 1.7240 → 1.7610 | 5.4430 → 3.8528 | 1,245 → 1,098 |
| Low-grip wheelspin | 0.2600 → 0.2394 | 0.5029 → 0.4992 | 16.7110 → 2.7846 | 3,832 → 4,162 |

Clutch/braking is a substantial regression despite remaining below 1 ms mean: the old model stalls immediately into an exact-rest state, while the prototype retains finite rotor/contact transients and small residual motion. No profile proves browser real-time acceptance; the launch worst case exceeds the 10 ms tick budget. No claim is made that performance is acceptable for deployment. Further performance work stops with the mechanical blocker rather than introducing approximations to hide it.

## Reproduction and remaining work

```sh
DRIVETRAIN_STRICT=1 npm test -- tests/drivetrain-integrity.test.js tests/engine-inertia.test.js tests/drivetrain-rotation.test.js tests/drivetrain-operation.test.js tests/drivetrain-gears.test.js tests/wheels.test.js tests/numerical-chassis.test.js
node scripts/benchmark-drivetrain.mjs --convergence
node scripts/benchmark-drivetrain.mjs
node scripts/benchmark-drivetrain.mjs --root /path/to/recovery-realtime-checkout
```

For prototype inspection only: A holds the clutch down; 1–6 request forward gears, 7 requests reverse, numpad 4/5/6 requests neutral. D is throttle; S is brake. Hold A, select 1, raise RPM, release A progressively; release D and hold A before a normal shift. Keep the brakes held and release A without throttle to inspect a stall. D alone must not restart. Press the existing Engine button with A held to request the starter; observe STARTING then RUNNING. OFF with A held permits coasting; OFF with the clutch engaged permits back-driving. Requested gears appear beside the engaged gear while pending. These instructions describe intended prototype controls, **not completed browser validation**.

Browser driving/smoke tests and final integration acceptance were not performed: the user explicitly requires stopping when the current mechanical milestone violates invariants. Remaining issues include work-consistent coupling to stiff contacts, contact telemetry evaluated before the final clutch impulse, legacy low-speed chassis sleep, uncalibrated starter/synchronizer/idle characteristics, and separate heat attribution in joint friction cases.

Changed production files: `js/physics/drivetrain-rotation.js`, `js/physics/engine.js`, `js/physics/tires.js`, `js/physics/wheel.js`, `js/state.js`, `js/main.js`, `js/ui/controls.js`, `js/ui/instruments.js`, `js/ui/workspace.js`. Tests: the diagnostic and engine suites plus new `drivetrain-rotation`, `drivetrain-operation`, `drivetrain-gears` suites. Also added the benchmark script and this report. **The mission is incomplete and the repair branch must remain unmerged.**
