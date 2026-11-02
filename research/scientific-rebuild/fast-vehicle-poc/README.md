# Fast vehicle architecture proof of concept

Isolated **headless**, deterministic JavaScript mechanical experiment; not an
interactive successor or production replacement. Existing laboratories, physics,
fixtures and production code are untouched. No dependencies or rendering work.

From repository root (Node 24.19.0 used):

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/test.mjs
node research/scientific-rebuild/fast-vehicle-poc/validate.mjs
node research/scientific-rebuild/fast-vehicle-poc/compare.mjs
# Run separately, with other local tests/benchmarks stopped:
TIMING_ONLY=1 node research/scientific-rebuild/fast-vehicle-poc/compare.mjs
node research/scientific-rebuild/fast-vehicle-poc/summarize.mjs
```

`model.js` exposes create/step/evaluateVehicle/energy; `compare.mjs` benchmarks
against the unchanged strict Experiment 11 adapter, using read-only Mission 17
fixture construction. `validate.mjs` performs three-second mechanical checks.
`test.mjs` provides independent mechanical assertions. `results/` contains small
JSON records; `REPORT.md` explains findings. Regeneration overwrites only this
experiment's records, never historical data.

## Model and work-conjugate interfaces

World x/y translation, yaw, sprung heave/pitch/roll, four independent vertical
unsprung coordinates and four independent wheel spin velocities. Positive pitch
raises the nose; positive roll raises the left side. Seven vertical coordinates
and parameters come from the existing pure `createVertical/evaluate` research
module: sprung mass 80 kg, four 6 kg unsprung masses, suspension 2000 N/m and
80 Ns/m per corner, radial tire stiffness 20000 N/m, wheelbase 2 m, track 1.2 m.
Horizontal translating mass is 104 kg; yaw inertia 60 kg m², pitch/roll inertias
45/20 kg m². Radius .32 m; individual wheel inertia 1 kg m². These are synthetic
research parameters, not a calibrated real automobile.

At corner (x_i,y_i), carrier tangent velocity is
`[u-r*y_i+H*pitchRate, v+r*x_i+H*rollRate]`, H=.5 m.
Rotate into the prescribed wheel frame; longitudinal slip velocity is
`wheelFrameVx-R*wheelOmega`, lateral slip velocity is `wheelFrameVy`.
Apply `-800*slipVelocity` N, radially limited to `mu*N`, mu=.9. This is the
existing Strategy A's simple **velocity-based compliant friction**, evaluated
explicitly; it is not a brush tire, TMeasy, or a quantitatively validated slip-angle
law. Both components share one limit. Zero support gives zero tangent forces.

The same tangent force applies world translation, yaw `x*Fy-y*Fx`, pitch `H*Fx`,
roll `H*Fy`, and rotor reaction `-R*Fx`. This is the transpose of the contact
velocity map: contact power is exactly `Fx*slipX+Fy*slipY <= 0`. No extra axle-load
formula is used: acceleration and cornering redistribute loads through the
integrated suspension. Spring reactions are equal/opposite; gravity and normal
elastic potential are counted once. Normal force is nonnegative radial
compression; airborne and recontact states follow wheel height, not reset logic.

Rear drive uses one fixed ratio G=3.5 and ideal massless open differential:
`shaftOmega=G*(rearOmegaLeft+rearOmegaRight)/2`. Engine inertia .3 kg m² uses the
unchanged pure mean-torque law `engineTorques`; no throttle actuator, timer-based
stall machine, gearbox-input inertia or starter state machine is reproduced.
Clutch slip is engine minus shaft speed; `Tc=30*engagement*tanh(2*slip/30)` Nm.
Engine receives -Tc; each rear rotor receives G*Tc/2. Dissipation is `-Tc*slip`.
This is bounded **regularized friction**, not exact stick/slip lock or an added
stabilizer. Shaft-referred angular momentum and signed power are tested.

Service and rear handbrake capacities reuse the unchanged pure hydraulic/cable
`brakeActuation` law. Braking torque is capacity*tanh(wheelOmega/.5 rad/s), hence
opposes spin and vanishes at zero. The low-speed regularization is explicit: it
cannot provide exact static holding or locked-wheel constraints. No handbrake yaw
force is invented. Front wheel angles are prescribed equally, without Ackermann,
column inertia, self-aligning moment or actuator feedback.

One simultaneous derivative evaluates all corners, rotor and engine reactions
from the same state. Classical fixed-step RK4 integrates everything and five
work quadratures (net engine, tire friction, brakes, clutch, suspension damping).
Four stages, 16 tire evaluations, four mean-engine evaluations and one brake
actuation per step; zero nonlinear solver/endpoint iterations. No hidden substeps,
force caches, time dropping, warm starts or force fitting. State publication
happens only after a finite complete trial. A failed trial leaves state/time intact.
This is not the historical energy-gated implicit acceptance algorithm.

## Approximation boundary

This is a small-angle **reduced generalized-coordinate model**, not full 6-DOF
rigid-body mechanics. Shared horizontal translation of the wheel masses and
constant diagonal inertias omit gyroscopic, configuration-dependent mass and
rotor-housing angular momentum effects. Fixed contact height H and the matching
velocity/force map preserve the declared reduced energy identity; they do not
establish exact finite-angle rigid-body kinematics. No roll/pitch stabilizers.

Only a flat plane is implemented. No terrain gradients, collisions, finite-travel
stops, tire deformation memory, pneumatic aligning moments, engine stall/restart
state transitions, neutral, gear selection, exact clutch lock, differential
carrier inertia, steering mechanism or static brake hold. No browser/UI, cameras,
audio or marks. Existing implementations still provide these capabilities.
The guard permits h up to 4 ms, but validation here covers only .25–1 ms; it is
not a claim of robustness at 4 ms or over unlimited speeds/angles. The retained
synthetic parameters and tested operating envelope are intentionally small.

The energy is sprung/unsprung gravitational and spring/normal potential plus
all represented body/rotor kinetic energies. Work closure validates this reduced
model's bookkeeping, not real-world tire accuracy or source-equation equivalence.
