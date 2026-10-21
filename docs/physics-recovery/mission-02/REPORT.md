# Physics Recovery Mission 02 — tire/contact reconstruction

Mission 02 is implemented on `recovery/mission-02-tire-dynamics`, based on the completed Mission 01 revision `74440cd9204d2cd5a1aedd9f45bed5c152d514a2`. No merge into Mission 01, the audit branch, or main is part of this work. The test-first commit is `10d39d2`; the source implementation is `dbd2d1e`.

The work replaces a mathematically misnormalized tire curve with an explicit peak-based combined-slip law and fixes the wheel/chassis contact coupling needed to make that law numerically dissipative at low speed. It retains Mission 01's rigid pose/history implementation. Peak friction was not reduced; no yaw damping, steering-column gain, suspension, engine, drivetrain, or graphics tuning was used to obtain the results.

Read [BEFORE_AFTER.md](BEFORE_AFTER.md) for numerical comparisons, [PARAMETERS.md](PARAMETERS.md) for definitive meanings/ranges, and [VALIDATION.md](VALIDATION.md) for tests, convergence, work ledgers, unexecuted validations, and limits. The [mission brief](MISSION.md) is preserved. Baselines were the [original audit](https://github.com/QuantumEther/VerletDrift/blob/ac86f81497f101c3da58c034ea6c9b56d87d1654/docs/physics-audit/2026-10-21/REPORT.md) and [Mission 01 report](../mission-01/REPORT.md).

**Validation classification:** mathematical consistency and controlled numerical convergence are demonstrated in the stated domain. Qualitative physical plausibility is argued from friction, brush-like force buildup and contact mechanics. There are no measured real-world tire data here, so this is **not calibrated physical accuracy** for a particular vehicle/tire.

## 1. Existing pipeline and confirmed defects

The pre-change equations and evidence were committed before implementation in [BASELINE_EQUATIONS.md](BASELINE_EQUATIONS.md), [before.json](before.json), and [baseline-tests.log](baseline-tests.log). The initial 25 regression tests had 14 failures on the completed Mission 01 source.

Each wheel had correct rigid local kinematics, `v_patch_center = v_CoM + yawRate cross arm`. Front axes were rotated by the common road-wheel angle. Local forward/right projection produced longitudinal and lateral speeds. Wheel surface speed was R*Omega. These kinematics and the chassis/wheel torque sign convention were retained.

The old lateral velocity passed through a 25 ms numerical EMA, then alpha was `atan2(filtered vLat,max(abs(vLong),0.5))`. Symmetric kappa used the maximum of surface speed, body-local longitudinal speed, and 0.5 m/s, then discarded values outside [-1,1]. Suspension-provided loads entered the existing bounded load-sensitive force capacity.

Both pure demands used:

`F(s) = D * sin(C*atan(B*s/s_config)) / sin(C*atan(B))`.

For B=10, C=1.9, `sin(C atan B)=0.33956095`. The actual raw peak is at `s/s_config=tan(pi/(2C))/B=0.10862896` and its magnitude is **2.945 D**. The first crossing of the later friction cap is at `s/s_config=0.01843903`. Thus the default 8° label produced raw peak 0.8690° and first saturation 0.1475°. Longitudinal scale 0.12 similarly gave raw peak 0.01304 and cap onset 0.002213. These are different phenomena; the analytic peak and cap onset must not be labeled interchangeably.

The old small-slip slope was about 18.65 times the selected corrected slope at the same peak input and load. The cap hid most of the analytic curve's growth. Supported C values above approximately 2.136 made its normalization nonpositive, causing the function to return zero. These are code-confirmed mathematical/parameterization defects, not judgments about a desired drift feel.

The independent demands were clipped to a friction circle, then blended toward kinetic patch friction using **longitudinal** slip only. Sliding Grip consequently did not define the pure-lateral sliding limit. Lateral demand was also faded by **center** speed below 2 m/s: with zero center speed and nonzero local pivot velocity, lateral resistance disappeared.

The old wheel solver had useful properties: persistent wheel inertia, bounded shared contact impulses, exact brake sticking/holding in the rotor coordinate, implicit contact reaction, zero-load history clearing, and a load-sensitive circle. These were preserved. Its contact solve nevertheless froze chassis velocity; the chassis responded afterward. The old nonlinear target and multiple lags could mask how stiff this split coupling was.

Finally, SAT multiplied relaxed front force by an exponential trail and then passed through another independent 80 ms filter. The force input, force relaxation, and output torque therefore had three delays without an explicit three-storage physical interpretation. Load removal could leave stale SAT. The steering column applies negative exported SAT; the basic forward restoring sign was not reversed by this mission.

## 2. Corrective choices and rationale

A peak-normalized E=0 Magic Formula can fix peak location, but its peak, post-peak limit, and shape coefficients are not freely identifiable together. Keeping both original B/C sliders plus independently prescribed peaks and Sliding Grip would require redundant controls, restricted/contradictory domains, or more shape freedom than the mission needs. A full measured Magic Formula dataset is unavailable.

A full elastic brush/bristle model could add contact deflection and stiction, but would require tire shear/footprint calibration, stored-energy accounting, and additional state. Merely naming it a brush model would not supply those data.

The selected model uses a brush-like cubic buildup, a C1 transition to a prescribed kinetic friction ratio, a common normalized combined-slip severity, and one explicitly dissipative friction-magnitude buildup state. This is a deliberately limited empirical model with a small identifiable parameter set. The contact solve includes chassis and rotor response together; numerical stability is not obtained by changing its physical gains.

## 3. Steady contact law and dimensions

For each current wheel frame:

`u = R*Omega`, `sLong = vLong-u`, `sLat=vLat`, with speeds in m/s.

`alpha = atan2(vLat,hypot(vLong,v0))`, `v0=0.5 m/s`.

`kappa = u/d - vLong/d`, `d=max(abs(u),abs(vLong),v0)`.

Alpha is radians and kappa dimensionless. The divided form is algebraically the symmetric slip ratio and avoids subtracting potentially opposite huge speeds before normalization. Kappa may reach ±2 for opposite wheel/vehicle travel. The angle is a regularized rolling/creep coordinate near rest, not a high-speed geometric angle extrapolated through a singularity.

Let D be the existing current load-sensitive capacity, alpha_p the configured angle in radians, and kappa_p the configured ratio. Define:

`x=kappa/kappa_p`, `y=alpha/alpha_p`, `q=hypot(x,y)`.

The force fraction is:

- `phi(q)=3q-3q²+q³` for 0≤q≤1.
- `phi(q)=1-(1-rho)*(3t²-2t³)`, t=q-1, for 1<q<2.
- `phi(q)=rho` for q≥2.

Rho is Sliding Grip as a fraction. Both joints are C1. The pure peak is exactly at alpha_p or kappa_p, with force D. If rho=1, the first peak begins a plateau. For rho<1 there is a single rising branch, a single descending transition and a kinetic plateau; there are no additional extrema or sign inversions. There is no earlier cap-induced plateau to mistake for the peak.

Small-slip stiffness is `C_alpha=3D/alpha_p` N/rad and `C_kappa=3D/kappa_p` N per unit kappa. At Fz=2943 N, mu=1, alpha_p=8°, kappa_p=0.12, these are about **63.23 kN/rad** and **73.575 kN per unit kappa**. The old values were about 1.18 MN/rad and 1.37 MN per unit kappa. This change follows the corrected peak definition while preserving peak capacity; it is not arbitrary reduction of Tire Friction.

In buildup, the force direction in wheel coordinates is `(x,-y)/q`. Over q=1…2 the same smoothstep blends that direction into `-(sLong,sLat)/hypot(sLong,sLat)`. The direction blend is normalized to retain the prescribed magnitude D*phi(q). Both constituent directions have the same component signs relative to actual slip, so no component becomes propulsive friction. At q≥2, the model is exactly isotropic kinetic sliding at rho*D. Zero slip gives exactly zero target.

The ellipse is in normalized slip demand; the force bound is a circle. This empirical combination is not the full combined-slip Magic Formula and does not reproduce all tire anisotropy, camber, temperature, pressure, speed or road effects. It does provide bounded coherent acceleration/braking/cornering competition, including locked wheels and excessive spin, without adding independent maximum forces.

## 4. Load sensitivity and support

The existing law is retained:

`D = mu*Fz*clip((Fz/Fref)^(-s),0.5,1.5)`, `Fref=m*g/4`.

The interior capacity grows as Fz^(1-s), with s=0.12 by default. Effective friction declines with load, while absolute capacity remains monotone. Extrapolation clamps bound the effective coefficient. D=0 exactly for zero support or zero friction. Small-slip stiffness scales with D, so the existing nonlinear load sensitivity affects both buildup and peak force.

The suspension's independently computed current corner loads are consumed directly, including asymmetric braking/acceleration/cornering support and lift-off. No second weight-transfer correction is applied. Carried force is clipped to the **new** support bound before the solve. At zero load, force and pneumatic moment clear immediately; recontact rebuilds through the force transient. Suspension equations and settings are unchanged.

## 5. Transient force model

One magnitude state per contact is represented through the existing force-vector history. Let M0 be the carried vector magnitude and T the current steady target magnitude. The instantaneous target direction follows current slip.

- For T≥M0, `dM/dt=(T-M)/tau`.
- For T<M0, release immediately to T.
- For zero target, release to zero.

`tau=L/max(hypot(vLong,vLat),v0)` uses **local** motion, including yaw-induced motion. For a frozen target, endpoint and mean magnitude are integrated analytically. The mean force, not the endpoint, supplies both chassis impulse and rotor reaction. Adaptive stepping resolves changes in the nonlinear endpoint target.

This asymmetric buildup law intentionally has no recoverable elastic energy. It cannot keep an active old force through a reversed/stopped slip and then call the resulting work unexplained elastic release. It approximates increasing deformation/contact-force establishment, while decreasing demand and direction follow the current frictional envelope. It does not model hysteretic tire deflection, force overshoot, contact-patch torsion, or a full transient brush. A discontinuous prescribed velocity reversal can change force direction discontinuously; that is an explicit fixture intervention, not a claim about a smoothly evolving physical velocity.

The 25 ms pre-slip numerical EMA and 80 ms independent SAT filter were removed from the **tire-generated** pipeline. Physical relaxation was retained and tested, rather than deleting all transient behavior. The column inertia, damping, Coulomb selection, fallback spring, input mapping and steering limits were not changed.

## 6. Coupled body/wheel impulses: the required numerical dependency

A target-only correction is insufficient. A reproducible [negative control](split-contact-control.json), using the final tire equations but intentionally applying a frozen-body fixture solve to a freely moving chassis, increases chassis-plus-wheel kinetic energy from 6.1959 J to 9.2725 J in a three-second 50 Hz slow turn. The correct coupled path ends at 0.003335 J under the same unchanged drag/yaw/sleep settings. Run [mission02-split-control.mjs](../../../scripts/mission02-split-control.mjs) to reproduce both paths. Its force could oppose the start-of-tick slip while overshooting the chassis into the opposite velocity later in the same tick. Adjusting grip, adding damping, or accepting that result would violate the mission.

The production [contact solver](../../../js/physics/tire-contact.js) therefore solves the three chassis endpoint velocities together with the four rotor responses. Rotor unknowns are eliminated through the existing bounded implicit brake/contact root solve. Each residual evaluation computes candidate endpoint local patch velocities, force transients, shared contact impulses, and rotor reaction `-R*J_long`.

The chassis residual enforces:

`v_next = v_old + a_external*h + sum(J_world)/m`,

`yaw_next = yaw_old + alpha_external*h + sum(r cross J_world)/I`.

A damped Newton solve with a finite-difference 3×3 Jacobian resolves these equations. Failure or inadequate full-versus-two-half-step agreement triggers subdivision, not acceptance. Conservative impulse updates propagate between accepted substeps; approximate Newton iterates do not accumulate a separate velocity history.

Contact frames, arms and normal loads are frozen within the outer mechanical tick. The resulting averaged forces/torque are passed into the unchanged Mission 01 kick-drift integrator, which reproduces the solved endpoint velocity and rotates the chassis exactly. Body center/heading histories and mechanical timestep handling are not reimplemented by the tire solver. Geometry therefore retains outer first-order splitting error, which is measured in vehicle refinement.

Main now supplies the existing drag and yaw acceleration as known external inputs to the contact forecast. Their equations, coefficients and final contributions are unchanged. The drag read moves before the tire call; these reads depend on the same cached body state. This is an explicit tire-interface dependency, not new yaw assistance. Standalone callers default to zero external acceleration. An explicit `prescribedBody` option represents an externally held body in force-curve fixtures; it is not a saved vehicle parameter or user stability control.

## 7. Work, energy, and numerical dissipation

For frozen frame geometry and constant effective inertias, let w contain chassis translation/yaw velocities and wheel angular velocities. The implicit contact endpoint obeys `M*(w_next-w_old)=h*generalizedForce`. Contact targets and their nonnegative magnitude averages oppose each endpoint slip. Without drive/external work, backward-Euler kinetic accounting gives:

`K_next-K_old = h*sum(F dot slip_next) + brake_endpoint_work - 0.5*(delta_w)^T*M*delta_w <= 0`,

up to root and coordinate roundoff. The last term is a **discrete endpoint-work defect**, conventionally described as algorithmic dissipation; it is not measured tire heat or, by itself, the error against a continuous physical trajectory. Even an exact constant-force velocity update has a difference between endpoint and midpoint work quadrature. Adaptive refinement and analytical controls, rather than this inequality alone, assess integration error. Physical sliding dissipation is the contact force/slip work; the two must not be conflated.

The wheel kernel records contact/brake impulses and drive, brake, rotor-contact, frozen-geometry patch, and endpoint-friction work for each accepted substep. Rotor energy residual uses its actual effective inertia. For neutral uncoupled rotors this is physical wheel inertia. When the original drivetrain lock reflects crank inertia, this is an effective-coordinate ledger, not a separate measurement of physical engine storage.

Body work is independently reconstructed from applied forces, contact arms and midpoint measured translation/yaw. The experimental runner records drag and yaw-damper work separately. Kinetic comparisons include **chassis translation, chassis yaw, and four wheel rotations** where specified. No total-vehicle conservation claim is based on chassis energy alone.

Remaining open accounting includes physical crank/clutch lock transitions, suspension/accelerating-frame energy transfer, column/fallback-spring energy, position-prescribed steering actuator work, contact aligning-moment reaction to the rack/chassis, sleep, and map/game impulses. The transient magnitude state has no elastic-energy storage interpretation. The detailed bounds and observed residuals are in [VALIDATION.md](VALIDATION.md).

## 8. Tire self-aligning torque

The pre-peak force polynomial supports a brush-inspired moment/force ratio. With q<1 and small-slip trail t0:

`t(q)/t0 = 3*(1-q)^3/(3-3q+q²)`.

This is the ratio obtained from a cubic buildup `3q-3q²+q³` and a moment proportional to `q*(1-q)^3`, normalized so t0=a/3. Here q is the empirical combined severity, not an assertion that a full measured Fiala model has been fitted. Trail vanishes as the adhering region disappears at q=1; the kinetic point-contact model has no pneumatic moment.

Signed longitudinal transport is `vLong/hypot(vLong,v0)`. Pneumatic trail follows rolling direction, whereas fixed mechanical caster trail would not. It smoothly vanishes without longitudinal transport. Tests cover forward/reverse sign, unloading, load dependence through force, and bounded trail. Stationary steering scrub/torsional friction is absent from this point-contact pneumatic model and must not be inferred from its zero output.

The front moment is integrated from the same force/trail contact substeps and exported as an averaged SAT. The column still applies its negative on the next outer tick. There is no separate 80 ms stale-torque state. The configured trail length and every column parameter remain unchanged in normal comparisons. The trail/slip change is a declared tire model assumption, not a suppression selected to make an oscillation disappear. Quantitative moment calibration requires real tire/rack data.

## 9. Compatibility and deliberate limits

Version 2 has six primary independently adjustable force/transient quantities plus the pneumatic-trail input. B/C are retired. Version 1 and unversioned presets undergo an explicit intent-preserving migration with a visible notice: labeled peak values become real peak positions and old force calibration is not preserved. Version 2 requires the supported tire-model identity; retired B/C do not silently become active shape parameters. Imports remain atomic. Built-in preset values are retained, without claiming new real-world calibration.

Finite low-speed contact is substantially corrected: pure yaw and off-center rotation have local resistance, reverse travel is regularized, rest is force-free without motion, and passive low-speed coupling does not generate kinetic energy in the isolated tests. **Exact static tire stiction is still not represented.** A continuous creep law has zero force at exact zero slip, so a finite static horizontal load can require a small creep velocity. Application sleep can hide this distinction. A defensible extension is a stick/slip complementarity or calibrated stored-bristle state inside the new shared contact solve, rather than another low-speed fade or hidden yaw torque.

Near application sleep, the inherited sequence snaps histories after deriving body state and can leave cached kinematics stale for the next call. The exact contact endpoint/momentum contract assumes a consistent incoming body cache and histories; the isolated conservation tests omit sleep. Measured near-rest body residuals include this known external sleep/cache limitation and must not be labeled tire heat. Fixing that application-wide state-reset contract remains a numerical follow-up; it has not been hidden by tire tuning.

The model remains planar, point-contact, isotropic in fully sliding friction, first order in outer moving geometry, and empirically calibrated only by chosen parameter values. It excludes camber, carcass/load-dependent footprint geometry, tire temperature/pressure, road roughness, vertical tire/unsprung dynamics, tire wear, and finite patch steering scrub. Existing wall collisions, sleep, explicit yaw damping and drivetrain defects remain visible limitations.

No steering column, suspension, engine/clutch/drivetrain, rigid integrator/history, boundary/constraint equation, sound, rendering, or graphics parameter was changed to compensate for tires. Grip classifier hysteresis remains a known **telemetry-only** defect; its labels/EMAs do not control force. Force curves, handling and stability must not be inferred from those labels alone.

## 10. Recommendation for Mission 03

Proceed with **Steering Dynamics and Self-Aligning Torque Recovery** on this fixed tire/contact baseline. First separate the measured default released-steering result from the high-Coulomb stationary-column reproduction; the latter does not require a tire force to chatter.

Priorities are:

1. Replace the column's rate-gated Coulomb selection with a genuine static/kinetic stick-slip solve, preserving viscous dissipation and testing stopping/holding without chatter at multiple timesteps.
2. Make road-wheel/handwheel/rack coordinates, mechanical trail/caster and reaction moments explicit. Decide how tire aligning moment, rack/chassis reaction and prescribed driver authority exchange angular momentum and work.
3. Add a column energy ledger including driver work, SAT work, viscous/Coulomb losses, steering stops, and the speed-dependent fallback spring. Its coefficient changes with speed and cannot be treated as a constant conservative spring over a maneuver.
4. Identify or measure pneumatic moment/force/trail behavior before claiming real tire calibration. Do not tune t0, yaw damping or tire friction simply to pass a steering-release test.
5. Re-run low-speed release, reversal, standstill steering, presets and torque-driven AI-input scenarios. Keep tire/body numerical invariants and passive contact regressions as gates. Optimize the coupled solver only with matched accuracy/convergence evidence; its extra computational cost is a known consideration for large AI training runs.

The present work establishes predictable equations and measured numerical behavior within a stated domain. It does not justify hiding the remaining assists, stiction omissions or mechanical energy-accounting gaps from an AI driver.
