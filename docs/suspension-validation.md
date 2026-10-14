# Flat-road suspension and handling validation

The default driving model now has a sprung chassis with heave, pitch, and roll,
plus four corner springs/dampers and front/rear anti-roll bars. Its road loads
feed the existing planar tire and wheel-rotation solver. The top-down shape and
road stay unchanged. Springs and dampers alter handling through tire loads.

## Try it yourself

Use the `fix/wheel-inertia-braking` branch and launch the game as usual. The
**Suspension** section is above **Car Physics** in the settings panel.

1. Leave the defaults enabled. Accelerate, brake, and take a steady turn. The
   readout shows pitch, roll, and FL/FR/RL/RR normal loads in Newtons.
2. Turn **Dynamic suspension** off to compare instantaneous load transfer.
   Keep tire load sensitivity unchanged to isolate the suspension difference.
3. Set **Tire load sensitivity** to zero as well to compare the previous linear
   tire model. The old inside/outside load-transfer sign has been corrected in
   both modes; the comparison does not restore that bug.
4. Enable suspension again. Increase front bar stiffness and reduce rear bar
   stiffness; repeat the same turn. Then reverse those changes. Loading an axle
   more unevenly generally reduces its total available grip. A stiffer front bar
   tends toward understeer, a stiffer rear bar tends toward oversteer, with the
   result also depending on speed, slip, and control inputs.
5. Initiate a drift with the handbrake, release it, and switch direction. Change
   damping one axle at a time to compare how the load distribution settles.

Use similar entry speeds and change one setting at a time. The default effects
are modest; the handbrake creates rotation through rear tire sliding forces,
without applying an artificial yaw torque. Export/import presets include
suspension settings and the comparison checkbox. Rate changes preserve the
assumed static ride height through automatic preload; changing modes resets
suspension motion so stale oscillations are not restored.

## Model and assumptions

All quantities use SI units. Heave is positive downward, pitch is positive
rear-down, roll is positive right-down. A positive rightward acceleration
therefore increases **left**, outside-wheel loads.

At each corner the elastic support is static sprung weight plus spring rate
multiplied by corner displacement, damping multiplied by corner velocity, and
an anti-roll-bar force. Corner displacement is heave + longitudinal lever ×
pitch + lateral lever × roll. Bars exert equal and opposite forces across an
axle. Progressive bump/rebound terms start at the configured travel limits;
these are compliant stops, not hard displacement clamps.

Roll-center geometry contributes immediate sprung load transfer. Unsprung
mass contributes its static load and algebraic acceleration-induced transfer
at wheel-center height. The supplied CoG height describes the **whole vehicle**;
the sprung CoG height is derived by removing the unsprung mass moment. Body
force/moment equations account for these contributions once. The old algebraic
weight-transfer function is used only when suspension is disabled.

For a settled turn with all corners loaded, the difference between left/right
road loads is m × lateral acceleration × CoG height / half-track. The settled
rear/front difference is m × longitudinal acceleration × CoG height /
half-wheelbase. Springs and damping do not erase those equilibrium moments.
Front/rear spring, bar, and roll-center settings change how lateral transfer is
shared between the axles. During heave the tick-average road loads obey:

    sum(normal loads) = total mass × g - sprung mass × average downward acceleration

They are not forcibly normalized to vehicle weight. Road load is nonnegative;
unloaded tires lose their contact forces while wheel rotation persists.

The suspension uses semi-implicit integration with internal steps no longer
than 1 ms, driven by acceleration from the preceding chassis tick. Tick-average
loads feed the tire solve. This partitioned coupling retains a one-chassis-tick
lag; timestep refinement checks bound its effect for representative maneuvers.

The tire peak and combined-force limit both use:

    peak grip = friction coefficient × load × (load / reference load)^(-sensitivity)

The reference is the static quarter-vehicle load. Sensitivity defaults to 0.12,
is bounded to 0–0.3, and effective friction is bounded to 0.5–1.5 times nominal.
At longitudinal slip above the peak, the curve retains at least 85% of the
combined-force limit by default, representing kinetic friction for locked or
spinning tires. The Sliding Grip control sets this floor from 50–100%. Zero
sensitivity reproduces linear load scaling; zero road load gives zero grip.

Default wheel rates are 35,000 N/m, dampers 2,500 N s/m, and bar stiffnesses
12,000/8,000 N m/rad front/rear. Estimated roll centers are 0.08/0.12 m and wheel
mass is 35 kg per corner. Pitch/roll inertias use a rectangular-body estimate
with 0.25 m vertical half-size. These are plausible development defaults, not
measurements or calibration against a specific vehicle.

This is a small-angle flat-road model. Unsprung vertical dynamics, tire vertical
compliance, camber/toe changes, anti-dive/anti-squat geometry, road bumps, and
full airborne/rollover motion are not modeled. Lift-off here means zero road
load in the reduced contact model; it does not establish realistic jump or
landing behavior. Existing tire smoothing, drivetrain simplifications, brake
bias, and yaw damping also influence handling. Physical consistency checks do
not establish agreement with a real car.

## Reproducible comparisons

Run `node scripts/compare-suspension.mjs` for JSON output from the real tire,
wheel, and planar chassis solvers. It applies repeatable acceleration, braking,
cornering, steering reversal, and handbrake maneuvers without rendering. The
acceleration case supplies fixed crank torque; it does not simulate driver
clutch input. Other cases coast in neutral. Baseline uses instant transfer and
linear tires; `tiresOnly` isolates load sensitivity; `suspension` enables both.

At 100 Hz, the 3-second cornering maneuver starts at 20 m/s and steers 0.16 rad
from 0.5 seconds. This run produced:

| Setup | Final heading (rad) | Peak body roll (deg) | Final speed (m/s) |
| --- | ---: | ---: | ---: |
| Instant transfer, linear tires | 1.1739 | 0 | 18.196 |
| Default suspension and sensitive tires | 1.1561 | 2.169 | 18.205 |
| Front bar 40,000; rear bar 0 | 1.1405 | 1.825 | 18.198 |
| Front bar 0; rear bar 40,000 | 1.1729 | 1.861 | 18.215 |

These demonstrate an actual change in turning response from front/rear load
sharing. They do not imply one setup is universally preferable. Steering
reversal comparisons at 50–400 Hz differed by less than 1% in final speed,
0.015 rad in final heading, and 0.025 rad/s in peak yaw rate.

## Automated checks

`npm test` runs the mechanics and coupled handling checks. Suspension checks
cover static equilibrium, acceleration/braking and left/right turn directions,
analytical steady transfer, damper transients, bar load sharing, vertical force
balance, dissipative settling, unloading/recontact, comparison toggles, and
internal timestep consistency. Coupled checks exercise acceleration, braking,
cornering, reversal, handbrake initiation, front/rear bar handling changes, and
chassis timestep refinement. Tire checks verify nominal grip, reduced combined
peak grip under uneven loading, zero contact grip, and linear comparison mode.

`npm run test:e2e` exercises browser driving regressions plus suspension
controls, mode switching, preset export/import, and the live load readout.

Final validation in the cloud workspace: **105 unit/handling tests passed** and
**20 Chromium browser tests passed**, including launch, braking in both travel
directions, shifting, reverse, diagnostic faults, and the new suspension UI.
There were no skipped tests in these runs. The browser run used system Chromium;
GPU rendering and vehicle behavior have not been calibrated across all browsers.
