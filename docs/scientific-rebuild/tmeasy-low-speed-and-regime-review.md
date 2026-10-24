# Mission 20 — low-speed and regime review

Authoritative code/fixture: [source audit](tmeasy-source-and-license-audit.md). Executed checks: [validation](tmeasy-numerical-validation.md). “Explicit” below means the code defines an update, not that real-world accuracy has been established.

|Regime|Classification|Source-supported behavior and limits|
|---|---|---|
|Forward moving pure/combined slip|SUPPORTED BY EXPLICIT MODEL|Algebraic combined curve, load-dependent peak/sliding parameters and empirical trail. Sign/reflection checked in the declared fixture; real tire calibration not reproduced.|
|Near-zero wheel speed|APPROXIMATELY HANDLED|Positive .01 m/s slip denominator and Dahl force blend. Finite positive-load probes on both sides of zero; finite is not physical accuracy.|
|Standstill and holding|APPROXIMATELY HANDLED|Two bristles retain translational preload when slip velocity is zero. A zero-initialized bristle cannot anticipate an external static load; deformation/vehicle integration must establish holding force. Source comment calls this experimental and says holding without creep “hopefully”. No slope vehicle test run.|
|Starting and clutch takeoff|UNVERIFIED as a coupled system|Contact forces exist for a prescribed accelerating/rotating wheel, but no engine, clutch or vehicle is in this experiment. Tire finite values do not validate takeoff, stall or restart behavior.|
|Reverse rolling|APPROXIMATELY HANDLED|Signed Omega in vsx, abs(Omega) in denominator; signed Vx blend means all negative Vx remains Dahl, with no Mz. Mirrored forward/reverse forces differ substantially. No claim of reverse equivalence or calibrated reverse handling.|
|Forward/reverse crossing|APPROXIMATELY HANDLED|Denominator and tanh resistance remain finite/continuous at zero for positive load; probes sample both directions. Full uninterrupted wheel/body reversal and all history trajectories remain UNVERIFIED.|
|Locked wheel braking / wheelspin|APPROXIMATELY HANDLED|Omega=0 with nonzero Vx or vice versa produces regularized slip and defined force. No brake constraint, handbrake, clutch kick or rotor inertia integration is supplied by this tire. Actual transient maneuvers UNVERIFIED.|
|Static parking steering/yaw torque|UNSUPPORTED in this basic model|Explicitly no parking slip or dynamic parking torque; Mz disabled below signed forward 1 m/s, no contact-spin constitutive state. Holding a translational bristle is not parking torsion.|
|Belt dynamics and dynamic inflation|UNSUPPORTED|Header/cpp and official guide explicitly omit these commercial-model features.|
|Geometric contact loss|SUPPORTED BY EXPLICIT MODEL|No-contact Synchronize resets brx/bry and other contact states; Advance returns zero wrench. The stored energy removed at reset is not separately reported.|
|Damping-induced negative normal force|APPROXIMATELY HANDLED|Fn<0 deactivates contact and outputs zero wrench, but the already-entered contact branch does not reset bristles in that call. Retention was reproduced; recontact history is not identical to geometric separation.|
|Exactly zero normal force while geometrically penetrating|UNSUPPORTED numerical boundary|Code tests Fn<0 rather than <=0; contact remains active, fc=0 causes divisions by zero and NaN force/state. Reproduced without a fix.|

## Thresholds and history

Default `m_vnum=.01 m/s`; force blend begins at signed Vx=1 and ends at 3 m/s with the original sinusoidal ramp. The default `m_vcoulomb=1` member is unused in the evaluated path; it is not an additional hidden transition. Optional startup ramp spans .1–.25 s but is disabled by default, as in every experiment. No startup damping was enabled to improve results.

Forces blend continuously at the endpoints in the finite source domain. **Mz does not use that blend:** it switches on at Vx>=1. With the selected generic tire, Vy=.1 and pure rolling longitudinally, Mz changes from 0 at .999999 m/s to 13.3947998 Nm at 1 m/s. This is an observed source discontinuity, not a solver tolerance.

Bristle forces depend on two retained deformations, not only current slip. Separate valid preloads -1/0/+1 mm gave different forces at identical inputs. Source integration uses m_stepsize (default .001 s); `Advance(.001)` versus `Advance(.01)` gave identical bristle states when that member was held fixed. A future caller must explicitly keep configured tire stepsize equal to its actual external step; otherwise elapsed mechanical time and tire history disagree. No automatic hidden substep is present in this method.

For a constant scalar slip, the original trapezoidal bristle state converged at order two under timestep refinement. Output force still uses the beginning-of-step bristle, so treating it as a synchronized end-state force would introduce a time-level error. No full coupled integrator was tested.

The source/guide report basic-model validation with FED-alpha, converted Pac02 files and KRC steady cornering. Those claims do not establish the listed parking, reverse, handbrake, stalling or high-spin requirements. The absent parking torque and signed-speed asymmetry are critical limitations for VerletDrift, not reasons to modify its existing working drivetrain.
