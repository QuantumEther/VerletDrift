# Mission 21 — native wrench and timestep

Actual source hashes, build and run records: [readiness](tmeasy-native-readiness.md), [results](tmeasy-native-boundary-results.md). This is original pinned Chrono execution; the observer introduces no force/contact/update override.

## Actual call and application order

The pinned `ChWheelTestRig.cpp`, VehicleWheelAssembly::Synchronize lines 284–294, clears the spindle accumulator, calls tire Synchronize, then wheel Synchronize. Its Advance lines 297–301 calls tire Advance. The rig loop at 660–674 follows with system DoStepDynamics. The native probe follows those operations using the real tire/wheel/system objects; it does not instantiate the enclosing rig.

The full vehicle source is consistent: ChWheeledVehicle::Synchronize(terrain) first synchronizes tires, then its axle path reaches ChAxle::Synchronize and wheel Synchronize; ChWheeledVehicle::Advance then advances tires before the multibody system. **Wheel application therefore consumes the previously calculated local force cache.** Tire Synchronize updates current contact/frame before that cached output is retrieved. Advance calculates the next local wrench and evolves bristles. This is more than the old-bristle time level inside the tire itself.

Mission 20 evaluated Synchronize+Advance and reported the newly calculated wrench; it did not run a native wheel consumer. Its four local observations are reproduced, but treating those outputs as the immediately integrated wheel wrench would misdescribe the normal framework order. On a fresh tire, first accumulated wrench is zero. The second callback receives the new wrench only if contact remains active. The zero-load release case demonstrates that this distinction can change propagation.

## Independent native reference transformation

The native contact frame has origin P and rotation R; hub center is C. Source ChForceElementTire::GetTireForce returns

```text
F_world = R F_local
M_hub = R M_local + (P-C) cross F_world
```

ChWheel::Synchronize passes that hub wrench to ChSpindle::AccumulateTireForce, which accumulates force at its supplied point and the supplied torque. Accumulator torque is stored in body-local coordinates; the probe converts it back through the actual native body orientation before reporting world values. No second `-radius*Fx` rotor reaction is added.

Python verification independently constructs a rotation matrix from the recorded quaternion, computes the cross product and compares native force/moment reports, then checks the next callback's actual accumulated wrench at its newly measured P and C. The CSV retains contact point, hub/application point, local and world force/moment, frame quaternion, body velocities, radii and pre/post body state. Finite comparisons use 1e-8 absolute plus 2e-11 relative tolerance; nonfinite values remain explicit.

For the upright flat cases `(P-C)=(0,0,-Rstat)`:

`M_hub=(Mx+Rstat*Fy, My-Rstat*Fx, Mz)`.

This verifies that the B discontinuity is intrinsic yaw moment, not a shifted lateral-force arm. At the next application, the source's x/y moment reactions are present without a duplicate rotor torque. Native Reff≈.4629573333333333 m differs from Rstat≈.449072 m; the source uses effective radius in slip but static lever geometry in wrench translation.

## Signed work observations

At a native wheel state, independently checked power is

`P = F_world dot V_C + M_hub dot omega_wheel`.

The full angular velocity includes rotor spin; it is not counted again as a separate wheel angular velocity. CSV **pending_power_W** evaluates the newly computed public hub wrench at the pre-step state. **applied_power_W** evaluates the wrench actually accumulated for the first integration step, and **next_applied_power_W** evaluates the next native application at its naturally advanced state. They must not be mixed into an invented work integral.

For all eleven fresh fixtures, first applied power is zero because the initial cache is zero. Representative next-applied powers: B_at ≈-176.946485 W; C_forward ≈-1812.113077 W; C_reverse ≈-1539.112586 W; D cases -50 W. A_zero has nonfinite pending power but finite zero first and next applied power in the observed release sequence. Its invalid bristle state is preserved.

A_below has small positive pending normal power ≈.00856282 W while separating. The source normal spring has `U(depth)=d1*depth²/2` for this linear, non-bottomed fixture and depth_dot=-Vz. Its normal work is `-U_dot-dz*Vz²`; spring release can supply positive instantaneous work. This is not evidence of energy creation. That new normal wrench was not actually used during the first system step because of caching.

No integrated storage/dissipation ledger, general recontact proof, or passivity theorem was established. The effective/static radius issue and tire storage interpretation from Mission 20 remain visible. **GLOBAL PASSIVITY: UNRESOLVED.** Matching wrench identities is not a proof of thermodynamic passivity.

## Who owns the timestep?

- ChTire.h lines 62–67 explicitly documents SetStepsize as the integration step for underlying dynamics, default .001 s, which derived classes may use.
- ChTMeasyTire::CombinedCoulombForces reads `m_stepsize`. Advance's argument does not replace it. Native matched/mismatched cases reproduce this exactly.
- ChWheelTestRig.cpp line 273 sets the tire step during assembly Initialize. Its Advance loop uses `h=min(m_step_size, step-t)` and passes h to the tire; it does not update the tire configuration on every shortened final substep. This is source inspection, not an executed fractional-remainder experiment.
- ChWheeledVehicle::Advance passes its step to tire Advance, and ChVehicle::Advance passes step to DoStepDynamics when it owns the system. The inspected paths do not guarantee SetStepsize matches each call. Broader model-specific setup may configure it; no universal initialization guarantee is claimed.

Our native D cases show actual system time .01 s with bristle evolution still using .001 s when the caller leaves that configuration unchanged. The normal rig/vehicle wrapper objects were not executed, so this part remains a source-supported interface analysis rather than full vehicle-loop verification. Correct callers must own that correspondence explicitly; no timestep/history fix is implemented here.
