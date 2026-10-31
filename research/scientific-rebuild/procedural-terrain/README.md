# Experiment 11 terrain physics — production endpoint path

The production vehicle adapter accepts tested non-flat steps and now drives the inherited mature mechanical laboratory at `index.html`. Experiment 11 is registered as No. 11 at `/lab/terrain/`. These are checked-in routes; public GitHub Pages publication is separate. Experiments 1–10 remain unchanged.

`candidateTerrainStep` uses a private clone and one eighteen-velocity drivetrain/contact solve per endpoint iteration. Vertical coordinates satisfy q1=q0+h*v1; there is no post-solve half-step position correction. Linear suspension uses its exact discrete potential gradient (average compression), gravity is constant, damping uses endpoint relative velocity, and terrain uses `discreteTerrainNormal`. Generalized force work, spring/gravity/terrain potential changes, damping and the existing contact-stage numerical loss close the full ledger. Neither the old flat tire-normal stage nor the suspension-only RK stage runs in parallel on this path. Flat conditions retain the unchanged Experiment 10 reference update.

The iteration is bounded at 80 attempts, with 1e-11 m contact-position, 1e-10 generalized-velocity, 1e-9 J local contact-work and 1e-7 J full-work thresholds. Failed iterations, energy checks and unsupported events leave the original state and observer history unchanged. Accepted samples are emitted once after commit. No energy correction impulse or tolerance increase is used.

## Verified results

`node --test research/scientific-rebuild/procedural-terrain/tests/*.test.mjs` passes 42 tests (use `--test-isolation=none` to report individual tests in this environment). They include the preserved historical failure, actual production inclined stepping, powered drivetrain/steering/braking, exact flat-state compatibility, unilateral opening/recontact, seeded small-amplitude terrain advancement and rejected-step rollback.

For the same historical 1 ms inclined initial state, residual changes from 0.02200968484 J to -4.62054e-14 J. The accepted spring/gravity/terrain changes are +4.31388e-8 / +1.01181e-10 / -2.62268477e-4 J. Generalized conservative/damper force work is +2.58800657e-4 J; physical damper work is +3.42458e-6 J. Backward-Euler numerical loss remains separately reported by the contact ledger.

On a plane z=0.001*x, 100 steps at 1 ms produce downhill velocity -0.00192478 m/s and a maximum full-step residual of 4.07e-12 J. Front/rear step-average normal loads are approximately 262.036/248.081 N per wheel. A 0.05 s refinement at 2/1/0.5 ms gives downhill velocities -0.00183680 / -0.00185790 / -0.00186865 m/s. A raised wheel releases and recontacts over 0.1 s with no tensile load. Full numerical output is in results/accepted-endpoint-regression.txt.

## Boundaries

The inherited vehicle/contact geometry is still small-angle with a fixed 0.5 m reference lever height. Terrain is vertical-gap elastic contact; reference stiffness is not a calibrated normal-gap tire coefficient on arbitrary slopes. Discrete forces represent step-average contact reactions, including opening/closing intervals. The generalized geometry mapping is linearized at each step; the actual endpoint potential is checked, and configurations that fail the work bound reject rather than silently accepting an inconsistent finite rotation.

Non-flat gearbox selector event crossings explicitly reject: rollback-safe event subdivision has not yet been integrated into the new endpoint path. Fixed selected gears, engine/clutch/steering/brake constraints are tested; flat terrain continues to use inherited gear-event handling. Supported terrain initialization and the interactive presentation are verified below. Aggressive hills, long non-flat driving, large rotations and public deployment remain unverified. Successful short incline tests do not establish those capabilities.

## Terrain respawn API

`respawnTerrain(vehicle, settings, history = null, terrainOverride = null)` provides a **whole-vehicle stationary respawn**, not preservation of a running or loaded drivetrain. It creates a fresh mature vehicle, places tires at reference compression relative to sampled terrain, fits chassis heave/pitch/roll to those corner heights and privately validates 100 production steps before committing the initial state. Curved-terrain force balance is a measured small transient, not an asserted exact static equilibrium. The result includes success/failure, initial and post-validation generalized force residuals, complete mechanical energy, peak energy residual and iteration count. Failure leaves the original vehicle and histories untouched; a supplied recorder must implement the normal nonthrowing `clear()` operation. A successful respawn clears incompatible history once and publishes time-zero state. To reset on the current procedural environment, pass its current settings; regeneration supplies new settings. Preserving drivetrain state while changing terrain is not supported by this API.

The historical seed-42 reset fails with the previous discrete-gradient evaluator on rough/road terrain. Subtraction of nearly equal energies and heights produced cancellation-driven force noise: a pressure calculation at z=0.30002999999999996 m with a 5.55e-17 m displacement returned 392 N instead of 399.4 N. The quadratic secant is now factored algebraically; tiny terrain displacements use analytic gradients on a cube-root-machine-epsilon scale. The solver's 80-iteration bound, velocity/position and work gates are unchanged, and discrete-work residuals are still independently checked. No mass, spring, damping, inertia or state clamps were changed.

Validated settings are seed 42, amplitude 0.001 m, roughness 0.1 for flat/hills/rough/road, plus the existing 0.001-gradient plane override. Tests verify 100 private steps and another 100 accepted steps, nonnegative loads, deterministic replay, invalid-settings rollback and explicit drivetrain reset semantics. Peak work residuals during private validation are 4.53e-13 / 3.35e-13 / 5.26e-13 J for hills/rough/road, with 4/3/3 maximum endpoint iterations. Initial/post-validation vertical generalized residual magnitudes are 0.02724/0.02248, 0.002189/0.001807 and 0.003599/0.001272, respectively; the force vector components are [N,Nm,Nm,N,N,N,N], so the reported maximum is a diagnostic magnitude, not a dimensionless equilibrium norm. Full initial states, contact samples and validation results are retained in `results/terrain-initialization.json`. Larger amplitudes, other seeds and terrain changes retaining drivetrain momentum remain unvalidated and may reject safely. The interactive selector now exposes precisely this validated configuration for each preset; other seeds and amplitudes are read-only reference values, not advertised playable ranges.


## Interactive successor

Serve the repository root (for example `python3 -m http.server 8000`) and open
`/lab/terrain/` or `/research/scientific-rebuild/procedural-terrain/index.html`.
Keep sibling experiments available: the application imports their validated
mechanical, audio, drivetrain, steering, diagnostic and recording components.

The application retains the mature engine/starter, pressure plate, selector,
differential, hydraulic brakes, rear handbrake, dynamic steering, four-corner
suspension, instruments, mechanical inspection/cutaways, orbit cameras, audio
controls, laboratory torque mode, pause/reset and track controls. Presentation
modules are Experiment-11-specific adaptations; previous experiment sources
are untouched. `application-vehicle.js` calls the production terrain adapter,
retaining the application's stable state reference after atomic acceptance;
it does not perform a second physics/contact solve.

Terrain selection and regeneration invoke `respawnTerrain`, including its 100
private validation steps, before replacing the state or clearing histories.
Failure keeps the current vehicle, terrain and tracks. Regeneration is a fresh
stationary vehicle, not momentum-preserving terrain replacement. The four UI
presets use seed 42, amplitude 0.001 m and roughness 0.1. The controls display
these bounds honestly; relief is deliberately subtle, with no visual scaling.

For powered **non-flat** driving, use “Stationary respawn in 1st · clutch open,”
hold E until the engine runs, then apply partial clutch and W. This button sets
an explicit stationary initial dog configuration using the inherited engagement
function; subsequent torque flows through the actual engine, clutch, gearbox,
differential and tire solver. It does not force a moving gear transition. Normal
selector controls remain available with inherited flat-ground event handling;
non-flat selector crossings still pause with the existing explicit solver fault.
Legacy rolling/torque fixtures remain experimental initial conditions, not
validated high-speed terrain-driving presets. Road material friction supersedes
the flat experiment's asymmetric-grip scenario on non-flat surfaces.

The bounded 40 × 40 m mesh samples the same analytic terrain function at its
vertices and updates when the integer world origin or terrain changes. Material
colors follow asphalt/gravel/dirt/grass samples, including the graded road and
shoulders. Between vertices it is a display triangulation, not a replacement
terrain sampler. Wheel heights equal the four physical coordinates; projected
contact positions include steering trail and small-angle pitch/roll offsets.
World-anchored rubber geometry samples terrain height at each ribbon vertex;
the inherited slip/work deposition criteria and bounded history remain intact.
Per-wheel terrain diagnostics report elevation, normal, material, coefficient
of friction, actual normal load, slip, utilization and spring compression. The
full Suspension Diagnostics panel remains available.

### Browser verification

With Playwright installed and `CHROMIUM_PATH` configured:

```
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/procedural-terrain/tests/browser-terrain.mjs
CHROMIUM_PATH=/usr/bin/chromium QUICK=1 node research/scientific-rebuild/procedural-terrain/tests/browser-inherited.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/procedural-terrain/tests/browser-navigation.mjs
```

The terrain test checks all four presets and regeneration, mesh heights against
the sampler (<1e-7 m), independent rendered wheel heights (<1e-9 m), actual
engine-powered non-flat motion and steering/braking without a clock fault. The
inherited test checks starting, throttle, real first-gear propulsion on flat,
service/hand brakes, steering, 12 inspection views, state/geometry agreement,
renderer rebuild resource counts, skid marks, visibility/clear and torque mode.
Quick inspection focuses each camera immediately; it is not a camera animation
or GPU performance benchmark. Navigation tests cover desktop/mobile hubs,
chronology, Terrain filtering, iframe entry/refresh/return and all 11 launch
and source URLs. Evidence is in `results/interactive-verification.txt`.

These short browser sessions demonstrate the supported interactive integration;
they do not validate arbitrary terrain parameters or prolonged aggressive driving.
No mass, inertia, spring, damping, solver threshold or energy check was changed
for this interface. The known small-angle and non-flat selector limitations
remain exposed rather than bypassed.

## Performance and early driving stalls

See [measured performance report](results/performance/README.md) for the optimized contact algebra, isolated timings, 180-second driving trace, corrected large-coordinate work-gate failure, raw browser profiles and bounded 12 ms frame budget. Non-flat selector events remain explicitly unsupported. Real-time GPU performance is not established by this cloud software renderer.
