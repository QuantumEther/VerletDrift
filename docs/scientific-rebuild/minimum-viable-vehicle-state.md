# Minimum viable research vehicle — state and parameters

**Specification only.** No vehicle is implemented by Mission 22. The target is a headless, four-wheel RWD research vehicle with DeLorean-like mass/geometry, independent wheel motion, braking, steering and eventually controllable drift. Manual engine/clutch/gears and AI are later layers on the same ports. No production presets or graphics are changed.

## One mechanical representation

Use native rigid-body/constraint dynamics: one sprung chassis and four wheel/spindle bodies. Each corner has an ideal guide allowing suspension heave and axle spin, with front steering prescribed through a moving joint reference. This requires **four scalar constraints per wheel** (two lateral/longitudinal hub-position constraints and two non-spin orientation constraints), leaving 6 chassis + 4 heave + 4 spin = **14 mechanical degrees of freedom**. Springs/dampers connect each wheel center to its chassis mount. No extra dynamic carrier body or duplicate shaft rotor is needed initially. Aerodynamic drag/downforce are omitted in this first mechanical milestone; terminal speed or road-car acceleration must not be inferred from that simplification.

The desired corner kinematics are authoritative, independent of a particular joint API:

```text
r_i = (x_i,y_i,z_i0+s_i) in sprung-chassis coordinates
p_h,i = p_C + R_C r_i
R_w,i = R_C Rz(delta_i) Ry(theta_i)
```

Native generic/lock constraints with prescribed reference motion can express these relations; mapping and reaction-work checks are required in the next corner milestone. Prescribed marker motion must include its time derivatives. Do not approximate steering by changing orientation without the corresponding constraint velocity/actuator work. Suspension guides omit wishbone geometry, bump steer, caster, compliance and toe/camber curves; those are declared reductions, not compensating tire forces.

The physical minimal state can be written as:

`[p_C(3), q_C(4), V_C(3), omega_C(3), s_i(4), sdot_i(4), theta_i(4), Omega_rel,i(4), z_tire,i(8)]`.

That is 37 stored scalars with one quaternion norm constraint, or 36 independent first-order values. A native maximal-coordinate backend stores five body poses/velocities plus joint constraints instead. **Those body states are authoritative:** the reduced coordinates above are projections/diagnostics, never a second integrator. Wheel angles may be unwrapped for traces; axle symmetry does not authorize an independent angle reset.

|Retained state; unit|Law / integration owner|Initialization|Port, observable and test|
|---|---|---|---|
|Chassis p [m], q [unit quaternion]|Native body kinematics; normalize through backend|Specified pose, static ride attitude; norm=1|Net chassis forces/torques; pose/quaternion error; free-motion and gravity gates|
|Chassis V [m/s], omega [rad/s]|Newton–Euler equations with actual native mass/inertia and joint reactions; native stepper|Zero or frozen test velocity|Linear/angular momentum and energy; impulse and work-ledger gates|
|Four s [m], sdot [m/s]|Native wheel-body motion constrained to each guide, spring/damper/tire/gravity balance|Static equilibrium solve; no imposed dynamic axle-load formula|Corner spring force/work, contact Fn, travel; settle/drop/refinement gates|
|Four theta [rad], Omega_rel [rad/s]|Native wheel-body rotation and joint kinematics; no separate rotor integration|Angle zero; zero spin or consistent rolling test condition|Axle relative-speed/torque port, wheel momentum; air-spin/lock/traction gates|
|Eight tire bristle values z [m]|Selected TMeasy update, exactly once per master h|Zero unless a documented finite checkpoint|Read before/after update; source finite-state/history tests|

Front delta_i(t) and delta_dot_i(t) are externally prescribed C2 driver trajectories, not retained steering dynamics. Initial steering is zero. For command delta_bar, use R_turn=L/tan(delta_bar), delta_FL=atan(L/(R_turn-track_front/2)) and delta_FR=atan(L/(R_turn+track_front/2)); at exactly zero command both are zero. Evaluate rates/accelerations consistently from the prescribed function. Rear angles are zero. No added return spring, feedback force or yaw stabilizer. A future steering column can replace this prescribed coordinate while preserving its torque/speed port.

Wheel relative spin and tire input differ in 3D:

`omega_w,i = omega_C + delta_dot_i R_C ez + Omega_rel,i a_i`,

where `a_i=R_C Rz(delta_i) ey`. Native TMeasy receives `Omega_abs,i=a_i dot omega_w,i` from ChWheel::GetState. The drivetrain uses relative `Omega_rel,i`; do not substitute one for the other when body roll/pitch contributes axial motion.

## Geometry, mass and initialization

A single geometry object supplies a,b>0, wheelbase L=a+b, front/rear track, hub mount coordinates and chassis-CG reference. Coordinates are front x=a, rear x=-b, left y=+track/2, right negative. It is physical geometry, not renderer dimensions.

Chassis mass/inertia exclude wheels. Maintain one component-mass registry. Native ChBody::SetInertiaXX immediately inverts inertia, so do not initialize it with a singular zero tensor. Allow finite constructor staging values while wheel/tire Initialize runs, then finalize each wheel body to the exact registry sum of wheel+tire mass/inertia before any accepted t0 state, force callback or integration. Assert positive final inertia, finite inverse and correct total mass. Staging values are not physical components. Do not carry the 1 kg/identity-inertia test spindle from Missions 21–22 into the vehicle or leave already-included mass counted twice.

For total mass M and total-COM coordinate `x_G=sum(m_i*x_i)/M` relative to sprung CG (sprung CG x=0), static front load is `M*g*(b+x_G)/L`; rear is `M*g*(a-x_G)/L`. For symmetric left/right corners divide by two. Spring support carries sprung weight; tire loads additionally carry unsprung weight. Do not confuse sprung CG with total vehicle CG. Dynamic load transfer emerges from native heave/roll/pitch, inertia and reactions; **no independent weight-transfer multiplier or force override**.

Find static tire depth from the chosen source elastic normal-force law and target corner load, with zero normal velocity. Verify positive stiffness and a valid root; use an analytical quadratic or bounded setup-only bracket solve (maximum 64 evaluations, 1e-10 m target). No online contact-equilibrium solver is added. Initialize spring compression for the required sprung load, derive mount offsets from ride height/rest lengths, and verify all travel/geometry bounds. If no consistent equilibrium exists, stop rather than adjust grip.

## Small parameter inventory

All values below are a **proposed engineering seed, not measured DeLorean calibration**. They are documentation, not a new executable preset.

|Category|Initial authority / proposed content|Independent tuning status|
|---|---|---|
|Essential sprung body|m_s=1131.2 kg; I_s=diag(366,1723,1968) kg m²; inertias are provisional positive body estimates|4 physical scalars; replace with measurements later, no simultaneous yaw-inertia multiplier|
|Essential geometry|a=1.350 m, b=1.063 m, tracks=1.590/1.588 m; sprung CG ride height .50 m|5 scalars; one geometry object, no visual overwrite|
|Essential suspension|k_front/rear=30000/35000 N/m; c=2000/2300 Ns/m; rest length=.30/.30 m|6 scalars; one spring and one damper per corner, axle-shared values|
|Wheel/tire fixture|For first vehicle, original pinned `src/chrono_models/vehicle/sedan/Sedan_Wheel.cpp` and `Sedan_TMeasyTire.cpp` on all four corners|Fixed named source fixture, not dozens of exposed coefficients. Not yet executed as a vehicle or validated for a DeLorean|
|Derived wheel body|Source wheel 13.2 kg + tire 11.5 kg =24.7 kg; inertia diag(.24,.42,.24)+(.156,.679,.156)=diag(.396,1.099,.396) kg m²|Finalized once from the component registry after native initialization staging; M=1230 kg with above chassis; no extra rotor inertia|
|Source tire coefficients|Sedan C++ setter: 245/40R18, LI97, design/use pressure 350000/220000 Pa, original GuessPassCar70Par, R0=.3266 m|Immutable source-generated coefficients and units logged. Do **not** combine with the similarly named JSON, whose inflation specification differs|
|Derived quantities|Static loads/depths, spring preload/mount offsets, effective radii, total COM/inertia and Ackermann angles|Computed, never independent grip/load/handling knobs|
|Numerical settings|Master h, solver cap/tolerances, output rate, approved input/travel domain|Separate versioned numerical configuration, not physical calibration|
|Diagnostics|CSV frequency, selected channels, event logging|No feedback into state or forces|
|Driver/gameplay|Steering/torque/brake requests; **zero gameplay force multipliers**|External commands, not physics parameters. No assistance except an explicitly logged test driver|

Thus the seed has **15 independently chosen body/geometry/suspension scalars**, plus one immutable source wheel/tire fixture. The future single-corner implementation first retains the already tested Generic fixture; transfer to the Sedan fixture is an explicit initialization/port gate before the four-wheel vehicle. The two source Sedan `.cpp` files were inspected at the pin, not numerically validated here. [Source tire](https://github.com/projectchrono/chrono/blob/9a5072b5324e012a66d9fb7eaac0c679b8465e73/src/chrono_models/vehicle/sedan/Sedan_TMeasyTire.cpp), [wheel](https://github.com/projectchrono/chrono/blob/9a5072b5324e012a66d9fb7eaac0c679b8465e73/src/chrono_models/vehicle/sedan/Sedan_Wheel.cpp).

Important parameters, derived loads, source fixture hashes, actual final body masses/inertias, requested/applied inputs and numerical settings must appear in every trace header. This proposal preserves a path to real measured geometry/calibration without claiming the seed is an authentic vehicle preset.
