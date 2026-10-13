# Persistent wheel inertia and braking

The original wheel update discarded its previous angular speed each tick by
starting from chassis rolling speed. It also subtracted an already signed brake
torque and applied a separate braking force directly to the chassis. At a forward
rolling speed of 10 m/s, the regression fixture's front wheel increased from
28.571 to 38.138 rad/s when the brake was pressed.

## Mechanical contract

Wheel rotation now follows the retained rotor state:

```
I * (omegaNew - omegaOld) = driveTorque * dt + brakeImpulse - R * contactImpulse
```

The same longitudinal contact impulse accelerates the chassis and reacts against
wheel inertia. Brakes apply rotor torque, and tire slip/contact transmits the
stopping force to the body. Brake capacity does not depend on road friction or
body speed, so a spinning wheel can be stopped on frictionless ground or while
the chassis is stationary. Static brake friction can hold a wheel at zero when
drive/contact torque is below brake capacity; braking alone cannot reverse it.

The existing input distribution remains: S brakes the front wheels, each using
40% of the nominal `brakeForce` rim-force setting; F progressively brakes the rear
wheels, each using 50% times `handbrakeValue`. Rim force times radius defines the
brake torque capacity. This change does not add a rear service-brake circuit.

## Numerical treatment

Simply retaining omega with an explicit tire-reaction update exposed oscillation
and poor timestep agreement. `js/physics/wheel.js` therefore solves rotor speed
and relaxed longitudinal contact force together implicitly. The tire's current
combined-force cap provides a root bracket. The slip curve is continuous through
zero: the old longitudinal slip dead band was removed because a discontinuous
force cannot be resolved reliably by the contact solver.

Step doubling compares a full step with two half steps and subdivides where
necessary. Local tolerances are `1e-4 rad/s + 0.1% of rotor speed` and
`0.1 N + 0.1% of contact force scale`. These are numerical accuracy settings, not
new friction, damping or speed limits. Refinement fails explicitly after depth
12 rather than silently accepting an unresolved finite integration error.
The scalar solve uses 40 bisection iterations; zero-contact torque integration
is analytic. Body contact velocity and engine drive torque are held over the
outer chassis tick. The returned averaged contact/brake impulses, rather than
only the final force, preserve that tick's rotor/contact balance. The force
history stores the final force for the next tick.

The existing lateral smoothing, distance-based tire relaxation, Pacejka curve,
combined-force target cap, steering, engine equations, load-transfer equations,
and chassis integrator are retained. Resolving longitudinal force at the new
rotor state can alter combined-force saturation and therefore handling. No
additional numerical damping coefficient or speed clamp was introduced.

## Verification

Six new regressions failed on the original implementation before the fix.
The final suite passes 70 unit tests (50 existing + 20 new) and 18 Chromium browser
cases (16 existing + 2 new). The new mechanics tests cover:

- Angular-momentum retention with zero torque/contact.
- Constant-torque flywheel speed and kinetic energy across timesteps.
- Forward/reverse braking, stationary/airborne rotor braking, and exact holding
  at zero without reversal.
- Handbrake holding drive torque and release.
- Absence of a direct chassis brake force on frictionless ground.
- Rotor/contact impulse balance and excess-spin energy dissipation.
- An analytical stiff linear-contact response independent of Pacejka calibration.
- Chassis acceleration under constant torque at 20, 10, 5 and 2.5 ms timesteps,
  checked against the effective rolling-inertia reference and refinement trend.

The browser cases use held throttle and actual numpad gear input for launch,
then neutral and held S for stopping. A separate backward-rolling fixture checks
stopping and removal of body-plus-wheel kinetic energy. Both capture unhandled
JavaScript errors. These tests demonstrate the changed mechanics and integration
path; they do not validate the entire vehicle model or hardware WebGPU rendering.

In an additional actual-module constant-torque launch characterization, final
speed after three seconds was:

| Outer timestep | Final speed (m/s) |
| --- | ---: |
| 20 ms | 2.321337 |
| 10 ms | 2.321084 |
| 5 ms | 2.320953 |
| 2.5 ms | 2.320897 |
| 1.25 ms | 2.320872 |

This external characterization uses fixed RPM/engagement and no drag, rather
than claiming the existing target-RPM engine is a constant-torque source.

## Remaining limitations

- The original 500 rad/s wheel safety guard is retained. Its intervention changes
  momentum/energy and is excluded from the conservation fixtures. Default
  full-throttle first-gear burnout can reach this guard because engine RPM is
  still a prescribed/clamped value with positive drive torque, not a dynamically
  coupled inertial engine with torque fuel cut. The guard is not evidence of
  physical wheel equilibrium.
- Launches using the existing engine RPM blending remain timestep-sensitive.
  An additional 20%-throttle launch characterization gave approximately 4.539 m/s
  at 10 ms, 5.160 m/s at 5 ms, and 5.395 m/s at 2.5 ms after three seconds. The
  constant-torque component converges, but this change does not establish full
  powertrain convergence or repair the RPM/clutch model. Those engine transitions
  need their own contract and validation task.
- Existing load-transfer sign/clipping errors, unloaded-tire force history, tire
  peak calibration, runtime timestep/history edits, reverse RPM blending/creep,
  and missing engine/clutch energy accounting remain separate audit findings.
- The implicit/adaptive contact solver costs more than the original overwrite.
  A warmed external mechanical-subset benchmark on this machine measured about
  8 microseconds per rest step and 51 microseconds per driven step, versus the
  historical audit's roughly 4 and 5 microseconds. This is a sequential, synthetic
  workload with eight constraint iterations, no rendering/gameplay and large
  collision-free bounds; browser FPS and multi-vehicle scalability cannot be
  inferred from it. All ten timed runs remained finite.

## Running the tests

With platform-appropriate dependencies installed, use `npm test` and
`npm run test:e2e`. In the prepared cloud checkout, Linux tooling/configurations
live outside the tracked Windows dependency tree:

```bash
cd /workspace/VerletDrift
node /workspace/verlet-tools/node_modules/vitest/vitest.mjs run --root /workspace/VerletDrift --config /workspace/verlet-tools/vitest.config.js --maxWorkers 2 --minWorkers 1
node node_modules/playwright/cli.js test --config /workspace/verlet-tools/playwright.config.js
```

That browser configuration uses system Chromium and disables optional video
recording because the FFmpeg download hosts are blocked; assertions, screenshots
and traces remain enabled. No dependency declaration or lockfile was changed.
