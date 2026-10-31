# Laboratory 10 — cumulative four-corner vehicle

Normal entry: `index.html`; stable navigator route: `lab/load-transfer/`. The page now uses the mature laboratory application with the combined eighteen-velocity vehicle, not the former two-second torque/steering fixture. Prior experiments are unchanged. Shared engine, gearbox, differential, clutch, steering, brake, audio, instrument, observer and track modules are imported from Experiment 9. Local adapters provide four-corner observations and rendering. Headless reduced reference modules remain for independent numerical tests and are not run alongside the normal vehicle.

## Coupling

`combined-planar.js` retains the eleven mature velocities and the non-diagonal drivetrain inverse-inertia block, then appends seven vertical velocities. Four wheel normal forces from the independent suspension state set the tire friction limits. Pitch/roll terms enter the longitudinal and lateral contact Jacobians, slip and reaction work. One accepted contact solve handles tires, steering, brakes, clutch and drivetrain. No second reduced tire solve or artificial acceleration-derived transfer force runs.

`combined-vehicle.js` replaces the axle vertical RK stage with the four-corner heave/pitch/roll and independent wheel-height stage. Legacy axle heights are display-only averages. Contact kinetic/potential energy and the seven-velocity numerical-loss term are included in the mature contact ledger. The separate vertical RK damper-work residual is measured explicitly. Gear-event clone, bisection, rollback and accepted-observer emission are retained.

Reference parameters: 80 kg sprung mass, 6 kg per wheel, pitch/roll inertia 45/20 kg m², spring rate 2000 N/m per corner, damping 80 N s/m, tire vertical stiffness 20000 N/m, radius 0.32 m, and fixed reference contact lever height 0.5 m. These are illustrative, not a measured car calibration.

## Interactive capabilities

The inherited application restores starter/ignition/throttle, engine/clutch/selector/gearbox/differential and service/cable brake controls; physical steering; continuous flat-ground driving; optional prescribed-torque laboratory mode; 3D vehicle and mechanical inspection cameras/cutaways; gauges, diagnostics and audio; accepted-stage world tracks, wheel paths, slip vectors and rubber deposition; recording, clear, visibility and reset semantics. Four actual wheel heights drive hubs and suspension struts, and sprung roll/pitch drive the body. Four-corner heights, loads, spring compression and vertical work diagnostics appear in scientific inspection. No two-second run cap remains in this entry point.

## Tests and evidence

```
node --test research/scientific-rebuild/four-corner-load-transfer/tests/*.test.mjs
QUICK=1 CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/four-corner-load-transfer/tests/browser.mjs
```

Nineteen numerical tests pass, including static balance, independent contact loss, suspension oscillations, virtual work, zero-height reduction against the unchanged mature drivetrain/steering solve, engine-to-wheel propulsion, combined braking/steering, reverse finiteness, observer isolation, failed-stage rollback and gear-event accepted substage emission. A 0.3 s braking turn had contact residual below 6.8e-13 J and corner loads [310.081,334.237,175.883,200.039] N. At 0.2 s, vertical work residuals at 2/1/0.5 ms were 8.26038e-4 / 2.08020e-4 / 5.21896e-5 J; pitch was -0.0312290 / -0.0313300 / -0.0313803 rad.

The Chromium test exercises engine starting/revving, first-gear launch, steering/braking/handbrake, twelve mechanical views, physical-to-rendered steering and corner heights, history visibility/clear, laboratory mode, and renderer recreation. It uses controlled RAF; QUICK checks two camera-transition frames, not GPU throughput. Reports are written to `/tmp/e10-mature-browser.json` so historical evidence is not overwritten.

## Approximation boundaries and remaining gates

This is not full finite-rotation suspension dynamics or vehicle-specific fidelity. The vertical contact port remains a small-angle model at fixed reference height, with no full chassis/column gyroscopic coupling or suspension kinematic geometry. Tire friction remains fixed μ: load sensitivity, carcass relaxation and pneumatic trail are not added. Normal contact is unilateral elastic. Spring/damper and tire stiffness do not represent measured vehicle data. Visual steering links are the inherited planar mechanism rather than a new articulated 3D suspension design.

Bump terrain and forced rear-unload fixtures are not adapted: the combined solver rejects them explicitly. The B key reports this limitation rather than modifying the terrain; unsupported unload is disabled in the road menu. Full terrain/contact-switch convergence, steady analytical braking/cornering references, long-session limits of the small-angle model and broader vehicle calibration remain validation gates. The measured splitting residual is not hidden or declared zero. Full scientific completion of all load-transfer-plan gates is not claimed.

Publishing requires this directory plus its unchanged Experiment 9 dependencies and regenerated lab files. Pages source access previously returned Forbidden; repository settings and public deployment are separate from the committed/browser-tested implementation.

Suspension characterization, reproducible traces, rendering corrections and the detected long-session clutch fault are documented in `docs/scientific-rebuild/suspension-response-calibration.md`. Run `node research/scientific-rebuild/four-corner-load-transfer/tests/measure-suspension.mjs` to reproduce the recorded scenarios. A failed mixed session is explicitly marked incomplete; do not describe it as passing prolonged-driving validation.

The historical mixed-session clutch failure is corrected by endpoint-consistent backward-Euler clutch mode selection. See `docs/scientific-rebuild/clutch-contact-transition.md` for exact replay, heat/work interpretation, 12 s refinement and 24 s mixed/selector/engagement results. Historical suspension traces remain unchanged as baseline evidence.
