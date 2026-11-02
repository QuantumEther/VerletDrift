# Engine lifecycle and manual-driving controls

PERFORMANCE, base `794d2eb`. Select **Manual engine lifecycle** in the existing
laboratory. Both mean-engine reference modes remain available. This engine variant
reuses the six-rotor mass/constraint kernel unchanged; tire, terrain, suspension,
physics tolerances, historical sources and fixtures are retained.

## Driving

Serve the repository root with `python3 -m http.server 8000`, then open
http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/.
Select Manual engine lifecycle, open the clutch, enable ignition and **hold R**
until the state is running. The starter automatically overruns/disengages after
firing. Choose a gear, wait for engagement, then apply W and clutch engagement.
A stalled engine has no combustion torque: open the clutch and crank with R, or
physically back-drive it through sufficient forward crank speed with ignition on.

| Controls | Action |
|---|---|
| Digit1–6 and Numpad1–6 | Request forward gears 1–6 |
| Digit7 and Numpad7 | Request synchronized reverse |
| N | Request neutral |
| R held / starter button held | Starter request in lifecycle mode; no reset |
| Backspace / Reset button | Explicit whole-vehicle reset |
| W/S/A/D/Space | Existing throttle/service brake/steering/rear brake |

Original production `js/input.js` was inspected: its number row is sequential but
its numpad uses an H-pattern (7/1/8/2/9/3, with 4/5/6 neutral). The user's explicit
sequential numpad requirement overrides that incompatible convention here. N is
therefore the dedicated neutral key; production bindings remain unchanged. The
old PERFORMANCE R-reset conflict is resolved by moving reset to Backspace.
Physical `event.code` identifies number keys, including NumLock-off numpad events.
Editable number/text fields and browser modifier shortcuts retain their behavior.
Gear keys only change the request consumed by the existing synchronizer controller;
they never assign RPM, shaft speeds or dog engagement. Starter key release, blur
and hidden-page input clearing remove the request. R held while running gives zero
starter torque. Reference mean-engine modes do not implement the new starter action.

## Model and work

The existing crank inertia **0.3 kg m²** is the only crank inertia. Starter gearing
and motor inertia are reduced to a bounded torque-speed source with ideal
engagement and overrunning drive, not a resolved starter pinion/impact model.
States are stopped, starting, running and stalled. Ignition-off removes combustion.
Forward crank speed >=30 rad/s enables firing after an accepted step, including
mechanical push-start. Running below18 rad/s for60 ms, or reverse/zero rotation,
causes stall. Stalling changes combustion eligibility, never angular velocity.
Stopped/stalled engines may still be physically rotating; their state is not an
RPM assignment. No combustion exists in those states until valid starting occurs.

Mean combustion torque is bounded to32 Nm with throttle/air-charge dependence and
a450 rad/s torque rolloff. A proportional idle-air controller requests opening
`clamp(.012*(90-omega),0,1)`; driver throttle can open further. The controller only
supplies fuel torque while running. The90 rad/s setpoint has physical torque-balance
droop: unloaded equilibrium is about87 rad/s (830 rpm), not imposed exactly.
Losses include1.1 Nm smooth Coulomb friction, .012 Nm/(rad/s) viscous and
.00005 Nm/(rad/s)² quadratic friction, plus throttle-dependent pumping losses.
A declared480–500 rad/s progressive fuel-cut band reduces combustion to zero above
500 rad/s. It adds no braking torque or speed clamp. Mechanical back-driving may
still overspeed the crank; the diagnostic reports it. Damage is not simulated.

Engine net torque is an additional component of the SAME bounded force-consistency
stage, evaluated from actual accepted rotor travel/h. Clutch, cone, brakes, tires
and engine therefore exchange work at one time level. The outer24-trial cap and
1e-11 generalized-force tolerance remain (torques use the existing1 m reference
length). The work residual bound includes engine angular travel times torque
residual. No additional root solver, artificial damping or fallback substeps.
The midpoint predictor is only an initial guess; its losses are not booked.

`engine.combustionWork`, `starterWork` and `lossWork` use each accepted torque
component times exact crank travel. Their signed sum matches the existing net
engine-work slot y[25]. `totalWork` already contains that slot; do not subtract
lossWork twice. Friction/pumping work is nonnegative because its torque is evaluated
at the same mean crank velocity. Combustion is gated off for nonpositive rotation.
Engine mode, timer, diagnostics and work counters are private candidate state and
publish only after the full vehicle checks pass. Rejection preserves them all.

These are synthetic mean-engine parameters, not measured vehicle calibration.
There is no crank-resolved compression, combustion pulse phase, cold enrichment,
thermal viscosity, fuel reservoir, battery current/copper loss or finite battery
capacity. StarterWork is **mechanical crank-port work**, not electrical consumption;
at zero crank speed electrical stall heating is outside this reduced model. Hot
restart functionality is tested without claiming temperature-dependent calibration.
Mounting reaction/gyroscopic and rolling-contact-patch limitations of the existing
reduced vehicle remain. There is no automatic rev matching, clutch assistance,
engine-damage protection or tire/handling adjustment to conceal poor driving.

## Verification

14 lifecycle tests cover starting, restart, steady idle against an independent
analytic torque equilibrium, clutch-induced stall, persistent stall, mechanical
push-start, friction/engine braking, overspeed, work balance, refinement and
transactional rejection. The downshift integration test verifies physical
clutch back-driving after synchronization. The retained drivetrain and historical
suites, including the1,080-state exact replay, also pass.

Start-to-idle runs at1/.5/.25 ms fire at .731/.731/.73075 s and end at
86.73507653/86.73507639/86.73512501 rad/s after5 s. Maximum energy/work residual in
those runs is about9.3e-10 J. Fire events occur at accepted endpoints; the final
error is not monotonic across two grids sharing the same delayed event. The test
bounds event timing and speed error using the bounded torque/inertia response;
it does not claim universal second order through firing/stall switches. A separate
smooth engine-braking test gives132.5107052379/132.5107052473/132.5107052496 rad/s
at matched time and demonstrates timestep refinement without a lifecycle event.

Real Chromium verification includes cold cranking with R, neutral throttle, all14
number-row/numpad requests while paused with exactly unchanged physical
state, N neutral, first-gear driving, Numpad2 upshift, reverse synchronization and
Backspace cold reset. It uses SwiftShader, not the user's RTX GPU. The existing
reference laboratory smoke test is also run. See `results/browser.json`.

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/engine-lifecycle/test.mjs
node research/scientific-rebuild/fast-vehicle-poc/engine-lifecycle/validate.mjs
node research/scientific-rebuild/fast-vehicle-poc/engine-lifecycle/benchmark.mjs
node research/scientific-rebuild/fast-vehicle-poc/engine-lifecycle/browser-smoke.mjs
```

## Complete-step performance

Node 24.19, shared cloud Xeon Platinum 8573C; Chromium 154 browser smoke used
SwiftShader. These are CPU measurements, not RTX 5090 rendering results.
Each workload advances 1,000 fixed 1 ms steps, with a full warmup/validation run
and five alternating reference/lifecycle repetitions, discarding the first pair.
The table reports medians of retained runs; timings include complete vehicle steps.

| Case | Mean-engine reference ms / simulated s | Lifecycle ms / simulated s | Lifecycle median / p95 / p99 step ms |
|---|---:|---:|---|
| Cranking | 60.69 | 167.09 | .125 / .220 / .331 |
| Idle | 63.50 | 147.92 | .103 / .186 / .309 |
| Takeoff | 282.80 | 290.39 | .206 / .361 / .495 |
| Braking | 268.87 | 234.83 | .202 / .338 / .495 |

Equal-case average CPU cost is 168.96 versus 210.06 ms/s (+24.3%). Engine torque
and resulting trajectories differ intentionally, so this is workload cost rather
than an equivalent-dynamics speedup estimate. Worst observed retained lifecycle
step was 2.90 ms; no convergence failures occurred. Raw distributions, force-loop
counts and workload configurations are in `results/benchmark.json`. Idle/cranking
cost is appreciably higher because engine torque now participates in the same
force-consistency solve. No tolerance was relaxed to reduce it.

Verification total: 14 new lifecycle tests plus 195 retained tests passed;
1,080-state bit-exact replay and both lifecycle/reference browser smoke checks
passed separately. Historical benchmark/browser artifacts are not overwritten.
The next priority is measured local driving evaluation of the declared synthetic
engine torque curve, before any calibration or further mechanical expansion.
