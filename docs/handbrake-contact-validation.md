# Handbrake contact mechanics

## Why locking the rear wheels barely changed handling

Before this change, longitudinal braking and lateral cornering were calculated
from separate tire curves and scaled into a shared friction circle. A locked
rear wheel received a longitudinal sliding-friction floor, but retained its
rolling-tire lateral target. Small sideways velocities could therefore still
produce substantial rear cornering force. Locking the rotors worked while
rear breakaway remained weak. The previous pressure-release fix addressed a
different issue and did not correct this contact law.

## Revised model

Low longitudinal slip retains the existing rolling-tire model. Beyond the
configured longitudinal slip threshold, a continuous smoothstep blends toward
a sliding contact. At full longitudinal lock/slip, the target force is:

```
patchSlip = (wheelRadius * omega - longitudinalRoadSpeed, -lateralRoadSpeed)
slidingTarget = slidingGripRatio * tireGripLimit * patchSlip / |patchSlip|
```

This is the road force on the tire/car: it opposes the tread's motion relative
to the road. At rear lock, most friction initially opposes forward travel, and
the rear loses the rolling tire's strong lateral response to small slip angles.
The front tires can then rotate the car into oversteer during a turn. Sliding
tires retain friction; locking is not equivalent to removing the rear tires.
The same rule applies to wheelspin, service-brake lock, and reverse travel.

The Sliding Grip control now sets the limiting magnitude of this sliding
vector. It no longer supplies only a longitudinal force floor.

Both longitudinal and lateral relaxation states advance on the wheel solver's
same adaptive substeps. Both body-force components use accumulated contact
impulses divided by the chassis timestep. Their convex relaxation stays inside
the current friction circle, and the longitudinal contact impulse still matches
the rotor's reaction torque. This removes the earlier mismatch between an
averaged longitudinal force and an endpoint lateral force.

## Validation

Validation on 14 October 2026: all 142 unit tests and the five targeted browser
tests passed. Browser validation used system Chromium with a temporary launch
configuration. Dependencies and generated test output were kept in a separate
temporary validation directory because this repository tracks `node_modules`.

- `tests/tire-unloading.test.js`: settled locked friction points opposite road
  slip in forward/reverse and both lateral directions; sliding magnitude follows
  its setting; release restores rotor rotation; unloading/recontact remain bounded.
- `tests/wheel-solver.test.js`: a combined-force direction change respects the friction
  circle and preserves contact/brake/rotor impulse balance.
- `tests/handbrake-handling.test.js`: a neutral 18 m/s car receives held 0.22 rad
  road-wheel steering, then handbrake pressure after 0.25 simulated seconds.
  Rear lock increases sideslip by more than 10 degrees versus coasting at
  50, 100, and 200 Hz. A straight symmetric run slows without developing yaw.
- `tests/e2e/handbrake-drift.spec.js` and `tests/e2e/wheel-braking.spec.js` cover
  the running browser's steering/handbrake response, launch, service braking,
  reverse, shifting, and low-traction wheelspin.

A separate source-module comparison held the handbrake from the start of an
18 m/s, 0.22 rad turn at 100 Hz, using suspension and the existing chassis/yaw
damping, with drag omitted equally from both runs. After one second, absolute
sideslip changed from approximately 3.1 degrees before the fix to 37.0 degrees
after it. The corresponding coasting values were approximately 2.3 and 1.9
degrees. These are reproducible model diagnostics, not measured vehicle data.

## What to expect when driving

At roughly 50–70 km/h, start turning and briefly hold F. With enough rear brake
capacity to lock, the tail should step out visibly. Release F and countersteer
to recover. A long pull scrubs speed and can spin the car; a straight pull
primarily brakes it. Pressing the clutch avoids simultaneous engine coupling
when testing the handbrake in gear.

## Remaining limits

The blend is a simplified combined-slip approximation driven by longitudinal
slip, rather than a calibrated tire brush model. At near-zero longitudinal
speed, the existing slip regularization affects the transition. Tire curve
normalization, explicit yaw damping, Verlet constraint losses, brake bias and
shared service/handbrake strength still need their own audit follow-up.
The added validation establishes qualitative behavior and force/impulse bounds;
it does not establish a calibrated stopping distance or real-car drift angle.
