# Proposed mechanical interface contract

Conceptual design only; no API is implemented. Evidence and source limitations: [architecture foundation](architecture-foundation.md). Equations here are elementary rigid-body/power derivations and proposed contracts, not a transcription of inaccessible published tire equations.

## Units, coordinates and ownership

Core coordinates: x forward, y left, z up; yaw/steer positive left; body velocities u,v in m/s, yaw rate r in rad/s; wheel omega positive for forward rolling. Pose X,Y in m, psi in radians. Mass kg; inertias kg m²; force N, torque Nm, impulse N s or Nm s, work J. Angles and signed speeds never use absolute RPM as mechanical state. RPM is a presentation conversion only.

At body arm (a_i,b_i), wheel-center velocity is (u-r b_i, v+r a_i). Rotate by minus steering delta_i into tire coordinates (Vx_i,Vy_i). Tire force in wheel coordinates is (Fx_i,Fy_i); rotate by delta_i before body summation. Define tread slip velocity (Vx_i-R_i omega_i,Vy_i). Force is on the vehicle from the road. Torque reaction on rotor is -R_i Fx_i. This single sign convention covers braking, wheelspin, reverse and back-driving; do not divide by unsigned forward speed and silently reverse signs.

Each dynamic variable has one core owner. Application commands are immutable and timestamped to a tick index. A solver stage reads one state; it does not mutate another contact while evaluating a tire. Presentation never supplies a mechanical state back to the core. UI changes to mass, inertia or gear ratios are explicit reset/intervention requests, not silent writes.

|Kind|Examples|Owner / constraints|
|---|---|---|
|Parameters|m, Iz, COM-relative wheel coordinates, R, Iw, gear ratios, friction/stiffness, calibration/version|Validated immutable configuration, independent of sprite dimensions.|
|Prescribed inputs|Steer angle in reference, throttle demand, clutch pedal, service/handbrake demand, gear/start request|Driver/command queue; requests do not overwrite shaft speeds.|
|Dynamic state|Pose/twist, four wheel omega, engine omega, necessary input/carrier states, later transient tire states|Mechanical core. Keep each physical inertia once.|
|Discrete state|Stopped/starting/running/stalled engine; neutral/engaging/engaged gear; optional clutch active set|Core transitions with guards and work ledger. A clutch label can be derived from slip/active constraints; it need not add a continuous state.|
|Computed values|Contact velocities, slips, forces, loads, combustion torque, residuals|Recomputed from the same stage state; caches invalidated on state/configuration change.|
|Constraint reactions|Clutch/gear/differential impulses and brake holding reactions|Common solve, reported separately from external torques.|
|Presentation|World wheel transforms, RPM, audio load, contact slip power, camera targets, smoke flags|Read-only snapshot/adapters; interpolation cannot alter current state.|

Conceptual exchange, not implementation:

```text
step(state, config, commandsAtTick, h)
  -> nextState, diagnostics, mechanicalEvents
snapshot(nextState, diagnostics)
  -> immutable {pose, wheelPoses, steerAngles, wheelOmega,
                engineStatus, signedRPM, gearStatus, slipPower, loads}
```

Separate external torque inputs used by the reference from production drivetrain connections. They share work-conjugate omega/torque units, not simultaneous authority. No caller may prescribe both omega and torque for the same unconstrained degree of freedom.

## Chassis, tire and load exchange

Proposed planar balance:

```text
m(du/dt - r v) = sum Fx_body + Fx_external
m(dv/dt + r u) = sum Fy_body + Fy_external
Iz dr/dt = sum(a_i Fy_body - b_i Fx_body) + M_external
Iw_i domega_i/dt = Tdrive_i - Tbrake_i - R_i Fx_i
```

Xdot=u cos(psi)-v sin(psi), Ydot=u sin(psi)+v cos(psi), psidot=r. Nonzero axle arms need no geometric-center assumption. Static reference loads: Fzf=m g b/(a+b), Fzr=m g a/(a+b), a,b positive distances from COM to front/rear axle; no simultaneous suspension fallback. Front/rear aggregate tire stiffness and rotor inertia must reflect two tires; duplicating per-tire load or inertia is an error.

For a memoryless passive tire, contact power into chassis plus rotors is

`Pc_i = Fx_i (Vx_i-R_i omega_i) + Fy_i Vy_i <= 0`.

For transient tires require `Pc_i + dU_tire_i/dt <= 0` with a defined storage model; positive instantaneous work alone is not proof of creation. An output EMA has no automatic physical storage interpretation. Include steering-axis work or prescribed steering actuator work if modeled contact/aligning moments require it. State first-model omissions explicitly.

Wheel/brake impulses applied to rotors must have the same equal/opposite tire impulse on the chassis. Sampled endpoint powers do not by themselves close a discrete energy balance. The solver must expose integrated impulse/work or a convergent quadrature residual. Friction envelope and signs must hold over the declared domain, including unloaded tires. Near-zero-speed regularization/static contact is a separate documented mode; no universal numerical epsilon is declared physical.

## Rear drivetrain and manual operation

Use engine inertia Ie, input inertia Ji if modeled, wheel inertias and optional carrier inertia. An ideal open differential imposes omega_c=(omega_L+omega_R)/2 and equal side torque Tc/2. With signed overall reduction G, omega_in=G omega_c and Tc=G Tin: ideal input/output powers agree. Negative G models reverse. Final drive and gear ratios must not be applied twice. A limited-slip differential would require an explicit torque/heat law and separate authorization.

Clutch slip s=omega_e-omega_in. Positive friction torque lambda opposes positive s: engine gets -lambda, input +lambda. Heat rate lambda*s is nonnegative. Open clutch: lambda=0. Slipping clutch: friction capacity determined by pedal/normal force, direction opposes slip. Locked clutch: s=0 and reaction within static capacity. Required reaction above capacity causes slip, not extra torque. Mode labels are derived from this solution where possible. At zero slip do not apply arbitrary sign(s) braking.

For two directly connected inertias with no external impulse, locking gives omega*=(Ie omega_e+Ji omega_in)/(Ie+Ji), dissipating Ie Ji/(2(Ie+Ji)) times the squared initial slip. This is a test case, not the geared multiwheel formula. For the assembled network, use generalized momentum and inertia with constraints; rotating housing/ground reactions mean unweighted scalar shaft angular momentum across a ratio is not conserved.

A suitable ideal impulse structure is

```text
M (qdot+ - qdot-) = h Qexternal + J^T Lambda + tireImpulse
J qdot+ = 0                         (active ideal constraints)
```

Finite clutch, brake and synchronizer impulses are capacity constrained and dissipative. Include external work during finite steps. Simultaneous static constraints do no relative-slip work; locking from a mismatch can dissipate kinetic energy. Do not infer heat by comparing independently kicked states and count it twice. Include sign-correct engine/brake torques before solving the coupled step.

Engine dynamics retain signed crank momentum: Ie domega_e/dt=Tcombustion+Tstarter-Tloss-lambda. Engine modes stopped/starting/running/stalled are necessary for starter/fuel/ignition behavior. Starting adds external battery work; stall does not zero crank momentum by fiat. Fuel cut, loss and combustion laws require calibration; a mode or displayed RPM cannot repair a stalled mechanical constraint. Engine-off coasting with open clutch differs from engine-off back-driving with closed clutch.

Neutral disconnects the ratio constraint. Selected gear is a request; engaged gear is the actual coupling. A synchronizer exchanges finite impulse until a speed/load criterion permits engagement. Without sufficient synchronization the shift stays unengaged or fails with an event, rather than silently setting omega. Releasing a loaded dog coupling and reverse engagement need explicit mode guards. No arbitrary vehicle-speed exemption, automatic rev match or automatic clutch. Gear engagement progress need not be a continuous coordinate unless the chosen synchronizer/dog model resolves travel; an active mode and accumulated synchronization state may suffice.

Clutch kicks store engine rotational energy before transferring it through clutch friction and the ratio to individual rotors. Tire reaction feeds back into that same network. A torque source cannot substitute for these states in the final simulator.

## What must be coupled

The common rear mobility has cross terms whenever a constraint connects rear wheels. Solving left contact, altering right omega, then solving right contact is not order independent. Crank locking after tire evaluation also invalidates tire slip. Therefore rear contacts, shaft constraints and clutch/brake impulses require one consistent stage/step solution. Chassis feedback can be partitioned only with demonstrated work residual and convergence; a rotational-only solve with frozen body kinematics is not automatically globally sufficient.

Proposed implementation research: fixed-size direct linear solves for each admissible clutch/brake active set; bounded contact iteration only if needed, with a declared residual/cost ceiling. If nonlinear convergence fails, record the failing state and reject the step/model candidate; do not silently accept truncated force, drop time or switch physics to stay within budget. RK4 remains appropriate only for the isolated smooth reference until mode-coupling evidence says otherwise.

## Application boundary and validation

Adapters convert core left-positive coordinates to current screen-y-down world orientation using an explicitly tested transform and heading offset. Map physical COM-relative wheel locations to pose; keep DeLorean artwork dimensions separate. Snapshot timestamps drive interpolation; display filtering never feeds back. Publish load/slip/power for smoke, skids, audio and HUD without inventing grip state that alters mechanics. Gameplay contacts become declared external impulses before final state publication, not post-derived history writes.

Record state/configuration hashes, tick-indexed commands, mode events, work/impulses, solver counts/residuals and interventions. Use separate visual RNG so smoke cannot consume mechanical randomness. A fixed step or iteration budget is a performance constraint, not proof of accuracy.

Required future contract tests: straight/mirror/order invariance; free-body and free-rotor momentum; slip/brake/reverse sign sweeps; ideal ratio power; clutch open/slip/lock and two-inertia analytic lock; gear/synchronizer heat; start/stall/back-drive; combined contact work; full energy residual under refinement; deterministic replay and rendering independence. Restarts and mode switches must be tested at differing shaft speeds. Numerical tolerance scales with units, machine precision and measured discretization error; do not pick loose percentage tolerances to pass trajectories.
