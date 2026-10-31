# Integrated steering contact model

Both scientific-rebuild mini-simulations now integrate steering in their actual automobile vehicle/contact solves. The interactive automobile and laboratory power modes both instantiate this steering mechanism. A/D supplies signed driver torque; releasing both removes that torque. The angle and angular velocity persist. No angle target, speed threshold or centering spring acts on this coordinate. The separate headless `createVehicle()` laboratory fixture without `automobile:true` retains its explicitly prescribed steering port for the archived contact experiments.

## Equations and reference assumptions

The existing column coordinate q drives the closed worm/sector, Pitman, drag-link and tie-rod linkage. Its two road-wheel angles are delta_i(q). Centered finite differences (one-sided at stops, increment 1e-5 rad) give J_i = d(delta_i)/dq. The effective column-referred inertia is constant. The shared `trailContactJacobian(t,J) = -t J` function from the existing foundation supplies both the isolated fixture and vehicle virtual-work map.

Each front steering axis is taken to lie t ahead of its straight-ahead contact location. In body coordinates the effective contact is (x_i + t*(1-cos(delta_i)), y_i - t*sin(delta_i)). The same point enters chassis yaw and wheel slip Jacobians. Its steering-induced lateral velocity is -t*J_i*qdot; longitudinal steering-induced velocity is zero. The established force-limited viscous contact law and shared traction disk determine Fx and Fy in the coupled solve, including wheel spin, longitudinal/lateral chassis motion and yaw. Tire torque on the column is sum(-t*J_i*Fy_i). Reversing changes the actual contact slip and forces; there is no forward/reverse switch in the steering law.

The added equation is I*qddot = T_driver + T_tire - D*qdot + T_friction + T_stop. Damping is implicit. A bounded Coulomb impulse handles sliding resistance and static hold. Two unilateral gap constraints enforce the existing +/-7 rad column limits without a post-integration velocity reset. Their affine velocities are +/-qdot + (+/-q-7)/h. A row scaling of 0.1 improves conditioning without changing physical torque. Driver work, steering kinetic energy, damping/friction/stop dissipation and independently calculated backward-Euler numerical loss enter the existing vehicle energy ledger. The original 1e-7 J energy and 2e-8 N s constitutive-impulse limits remain; the dynamic solver uses a tighter 1e-12 iteration residual and a higher iteration allowance.

Defaults: trail 0.08 m, effective column inertia 0.025 kg m², damping 0.25 N m s/rad, dry friction 0.15 N m, maximum driver torque 8 N m. These are configurable reference assumptions, not measured vehicle data. Trail is a fixed planar projection of steering-axis/contact geometry. Pneumatic trail, caster-induced camber/jacking, compliant tire carcass, stationary contact-patch torsion, and detailed worm back-drive efficiency are absent. Effective column inertia omits explicit column/chassis gyroscopic coupling. No vehicle-specific accuracy is claimed. The driver can do work and move the chassis slightly while steering at rest; zero energy input is not a valid expectation for that operation.

## State and rendering

`vehicle.js` only prepares driver torque and supplies steering to `planar.js`; it no longer integrates the angle separately. `planar.js` adds the column as its eleventh velocity and updates the linkage once per accepted stage. Road-wheel visual angles are refreshed from that accepted state. Existing 2D and 3D paths use each wheel's actual steering angle, and the graphical column uses q. The illustrations do not depict the added projected caster/trail offset as a detailed suspension mechanism. Contact forces use frozen stage geometry; displayed angles use the accepted end state, a first-order scheme checked by refinement.

## Vehicle-level evidence

`tests/steering-integration-baseline.test.js` now tests actual vehicles in both exhibits: stationary retention, torque input/release with inertial settling, forward/reverse initial response, zero grip, subthreshold static friction, both stops and release from stops, approximate left/right symmetry, timestep refinement, forced velocity reversal continuity and high-friction suppression of return. Exact mirror symmetry is not assumed for the inherited asymmetric steering-box linkage. Forced reversal is an imposed test initialization, not proof of a drivetrain-driven reverse maneuver.

At an initial column angle of 3 rad, over 0.2 s with no driver torque, h=1 ms:

| Initial speed | Final column angle | Maximum energy residual | Maximum torque residual |
| --- | --- | --- | --- |
| 0 m/s | 3 rad | 0 J | 0 N m |
| +4 m/s | 2.81929137999 rad | 7.96e-13 J | 6.89e-15 N m |
| -4 m/s | 3.12125717052 rad | 7.27e-13 J | 6.50e-15 N m |

Forward angles at 2, 1 and 0.5 ms are 2.81988422, 2.81929138 and 2.81899351 rad. Reverse angles are 3.12084405, 3.12125717 and 3.12146331 rad. These demonstrate converging initial responses of the reduced rolling model, not universal centering: friction can hold the steering, grip can vanish, and reverse initial alignment is destabilizing. Full measurements are in `results/steering-integration-measurements.json` in the braking prototype.

Chromium `tests/browser-living.mjs` ran in both exhibits with QUICK=1: all twelve presentation modes matched front wheel, column and linkage state; resource recreation and application checks passed with no page errors or clock faults. This uses controlled RAF and two camera-transition frames, not a rendering throughput benchmark. Evidence is saved separately as `results/steering-integration-browser.json` in each exhibit; predecessor results remain intact.

The prior stationary no-propulsion regression now checks no-input rest exactly and explicitly checks driver work/energy during active steering. Its turn, curvature and reversal assertions remain. Changed predecessor sources and that test are retained byte-for-byte under `research/scientific-rebuild/steering-predecessor/`; preservation tests compare that archive against d419189, all other predecessor files against their original versions, and the current shared governing modules against each other.

Run from the repository root:

```
node --test research/scientific-rebuild/braking-and-tire-contact-prototype/tests/*.test.js
node --test research/scientific-rebuild/tire-road-observatory-prototype/tests/*.test.js
QUICK=1 CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/braking-and-tire-contact-prototype/tests/browser-living.mjs
QUICK=1 CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/tire-road-observatory-prototype/tests/browser-living.mjs
```

The browser scripts write their legacy result filename; save new evidence separately and preserve historical result files when rerunning. Isolated foundation tests remain useful but are not used as a substitute for the vehicle tests.
