# Wheel rotational-speed audit

Omega is wheel angular velocity in rad/s, not vehicle speed. Wheel RPM is
omega × 60 / (2π); tire-surface speed is omega × wheel radius. With the default
0.35 m radius, 500 rad/s means approximately 4,775 wheel RPM and 630 km/h tire
surface speed. A slipping tire can have a much higher surface speed than the
car's speed. Brake lock gives zero wheel speed while the car still slides.

## Reproduced faults

An isolated full-throttle torque test held the chassis stationary and unloaded
the rear tires, with the clutch locked. Before correction, first gear reached
500 rad/s within 20 seconds and sixth gear within 5 seconds. At first-gear
omega 500, the gearing demands about 68,500 engine RPM, yet the display stayed
at 9,000. The causes were:

1. Locked-engine synchronization capped RPM at redline rather than reporting
   actual shaft speed. The torque model could no longer see overspeed.
2. Redline did not cut combustion torque. At displayed 9,000 RPM the engine
   still supplied approximately 86.5 N m of crank torque, indefinitely.
3. The locked-clutch path omitted engine friction, removing the closed-throttle
   resisting torque present in the disengaged-clutch path.
4. Wheel speeds were forcibly capped at ±500 rad/s, hiding acceleration and
   discarding angular momentum. This was an arbitrary numerical ceiling.
5. S applied only front service-brake torque. A spinning unloaded rear wheel
   received no service-brake torque; only F operated its brake.
6. Idle creep added separate wheel torque in addition to the crank idle
   governor, bypassing the engine's torque balance.
7. Neutral with a released clutch still computed clutch torque against a
   stationary driven axle, incorrectly loading and stalling the engine.
8. A wheel back-driving the selected gear could receive engine-friction torque
   in the accelerating direction because crank RPM stored only a speed magnitude.

Suspension unloading and low-friction presets can reduce tire reaction torque,
exposing drivetrain faults. The reproduced runaway did not require suspension.

## Corrections

- Engine RPM follows the actual mean driven-wheel speed and gearing when the
  clutch is locked, including mechanical over-rev. RPM is not clamped to redline.
- At or above redline, combustion and rev-match torque are cut. The fuel cut
  resumes combustion below the limit; discrete ticks can cause a small overshoot.
- Locked-clutch transmission uses combustion/governor torque **minus engine
  friction**, giving passive resistance with closed throttle.
- If the selected gear forces reverse crank rotation, combustion is suppressed
  and engine friction opposes that rotation instead of adding energy.
- Idle effort comes through the crank/clutch only. In locked gear the existing
  `idleCreepForce` setting caps the idle governor's net equivalent axle force.
- The rotor solver retains the torque-balanced wheel speed. Existing overspeed
  diagnostics remain; a fixed speed ceiling is not used as a physical model.
- Neutral has zero modeled axle clutch torque, so the engine can idle or
  free-rev with the pedal released without driving the wheels.
- S operates front and rear service brakes with 80%/20% axle bias. F adds rear
  handbrake torque. Both work without road contact and without chassis motion.

In the same 30-second unloaded full-throttle test, corrected first-gear wheel
speed stays around 65.8 rad/s and sixth gear around 396.5 rad/s. Those speeds
correspond to the state-module 9,000 RPM engine limit through their respective ratios,
with only small timestep-scale overshoot. The browser sliders currently initialize
the engine limit to 7,000 RPM instead; first gear then corresponds to roughly
51.1 rad/s. Validation covers both limits. Closed throttle now reduces driven
wheel speed; rear service braking adds its own resisting torque.

There is no single correct maximum wheel omega across gears. With equal rear
speeds and a locked clutch:

    engine RPM = abs(mean rear omega × gear ratio × final drive) × 60 / (2π)

Individual wheel speeds can exceed that mean when left/right speeds differ.
Free wheels with no contact, drive, or brake torque should retain their spin;
removing throttle is not itself a brake. At idle, an engaged engine can still
supply small creep torque. At high slip the tire reaction is limited by traction,
so wheel speed does not have to follow car speed divided by radius.

## Validation and limits

`npm test` includes `tests/wheel-omega-audit.test.js`: all six forward gears and
reverse are held at unloaded full throttle for 20 simulated seconds at both
7,000 and 9,000 RPM limits, checking
actual shaft/RPM consistency and bounded rev-limiter behavior. Further checks
cover neutral idle/free-rev, mechanical over-rev, closed-throttle deceleration, idle torque routing,
passive drag when back-driving a gear, front/rear service brakes without contact,
and conservation of free-wheel spin
above the former speed cap. Existing contact impulse, brake passivity, and
suspension tests remain enabled.

`npm run test:e2e` also exercises sustained low-traction wheelspin, engine RPM
consistency, and rear service-brake stopping in the actual browser game, alongside
launch, shifting, reverse, and braking regressions.

The engine friction law is still a simple estimate rather than a calibrated
pumping-loss map. Rear engine inertia is shared equally between the independent
wheel solves; asymmetric differential dynamics are not fully modeled. The model
does not simulate engine damage from an over-rev. These corrections address the
reproduced torque runaway; they do not establish that every handling or preset
issue is solved.

Validation results: **128 unit/handling tests passed**. The full Chromium suite
passed **21 browser tests**; after the final back-drive friction-direction change,
all **4 affected driving browser tests** were rerun and passed. No tests were
skipped. This checks the modeled torque behavior, not real-car calibration.
