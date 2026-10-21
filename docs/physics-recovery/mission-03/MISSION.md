# VERLETDRIFT — PHYSICS RECOVERY MISSION 03
## Steering Dynamics, Mechanical Friction, Self-Aligning Torque, and Input Coupling

### 0. Mission context

We have completed two foundational recovery missions:

**Mission 01 — Numerical Chassis Dynamics**

Corrected force-free rotational energy loss, timestep-history inconsistency, and the associated rigid planar integration defects.

**Mission 02 — Tire Model Reconstruction**

Corrected tire-force curve parameterization, combined-slip behavior, low-speed contact, and chassis/wheel contact coupling.

Mission 02 also eliminated the previously reproduced default low-speed steering runaway in controlled experiments. However, it confirmed that an independent steering-column friction defect remains.

At 100 Hz, a stationary steering experiment with Coulomb friction of 2 N·m, viscous damping of 0.1 N·m·s/rad, and initial road-wheel angle of 0.3 rad produced **324 steering-angle sign reversals over 10 seconds**.

The objective of Mission 03 is to reconstruct and validate the steering system as a coherent mechanical subsystem.

**Base branch:** `recovery/mission-02-tire-dynamics`

**New working branch:** `recovery/mission-03-steering-dynamics`

Create the new branch from the completed Mission 02 revision.

Do not branch from the original audit or Mission 01 independently.

Do not merge into any existing branch.

Read the reports and numerical evidence from all three previous stages: the original physics audit, Mission 01, and Mission 02.

---

# 1. Fundamental objective

Establish steering behavior that emerges from physically interpretable torque, inertia, friction, driver input, tire aligning moments, and mechanical constraints.

The steering mechanism must behave coherently during:

- Stationary steering.
- Low-speed maneuvering.
- Forward and reverse travel.
- High-speed cornering.
- Sustained sliding.
- Countersteering.
- Steering release.
- Steering reversal.
- Transitions between driver-controlled and free steering.
- Mechanical steering-lock contact.
- Transitions to and from vehicle sleep.

Do not prioritize steering that merely *looks* smooth or feels easy to control.

The objective is mechanically plausible dynamics, energy-consistent numerical behavior, and predictable responses to physical inputs.

---

# 2. Operating rules

1. Preserve the numerical chassis invariants established in Mission 01.
2. Preserve Mission 02's tire-force and combined-contact models.
3. Do not alter peak tire friction, sliding grip, peak slip values, or tire relaxation merely to stabilize steering.
4. Do not introduce hidden stability assistance, arbitrary angular-velocity attenuation, or automatic countersteering.
5. Do not change the existing yaw-damping model during this mission.
6. Do not alter suspension, drivetrain, braking, or unrelated graphics.
7. Establish failing regression tests before implementing corrections.
8. Distinguish numerical accuracy, physical plausibility, and calibrated real-world accuracy.
9. Preserve configuration compatibility wherever possible.
10. Include executable tests, quantitative comparisons, and explicit performance measurements.

If a required correction crosses subsystem boundaries, identify its physical and architectural justification before modifying the interface.

---

# 3. Reconstruct the complete steering architecture

Before implementation, trace the entire steering system.

Investigate all exposed and hidden steering parameters, including:

- Self Center Rate
- Column Inertia
- Viscous Damp
- Coulomb Friction
- Pneumatic Trail
- Max Steer
- Driver steering input mapping
- Steering input smoothing or interpolation
- Steering-column angular velocity
- Steering torque integration
- Steering mechanical stops
- Tire-generated self-aligning torque
- Any fallback restoring forces
- Driver position-control overrides
- Free-steering behavior
- Mouse, keyboard, or other input transitions
- Low-speed and sleep-related steering state

Determine the exact order of calculations and whether steering state is altered outside the primary physics update.

Produce a dependency diagram showing:

Driver Input → Steering Actuation → Steering Dynamics → Road-Wheel Angle → Tire Contact → Aligning Torque → Steering Dynamics

Document feedback delays, coordinate conventions, units, and every torque applied to the steering degree of freedom.

---

# 4. Determine the correct mechanical representation

Establish precisely what the current steering coordinate represents.

Is it:

- A steering-wheel angle?
- A steering-column angle?
- A road-wheel angle?
- An effective rack/steering coordinate?
- A hybrid variable representing several mechanically coupled components?

The simulator currently has one common road-wheel steering angle for both front wheels.

Determine whether its inertia, torque, damping, pneumatic-trail moment, driver input, and steering limits are all expressed consistently in this coordinate.

A steering-wheel torque cannot be applied directly to an effective road-wheel inertia without accounting for the appropriate mechanical transformation.

If a steering ratio is implicit, document it.

If additional geometric or mechanical fidelity is needed, justify the minimum required model.

Do not automatically introduce a complex rack-and-pinion or multi-link steering model unless it solves a demonstrated limitation.

---

# 5. Correct Coulomb friction and static sticking

**This is a primary acceptance target.**

The original audit identified explicit Coulomb-friction application that can overshoot zero angular velocity, reverse its sign, and cause repeated numerical chatter.

This is not acceptable behavior for a passive mechanical friction element.

### Required investigation

Identify precisely:

- How friction direction is selected.
- How friction magnitude is applied.
- How near-zero angular velocity is detected.
- Whether friction impulses can reverse steering motion.
- How external steering torque interacts with friction.
- Whether static and kinetic friction are distinguished.
- Whether the current implementation can remain at rest under subthreshold torque.
- Whether its behavior depends on timestep.

### Required correction

Implement a numerically consistent sticking/sliding friction mechanism.

A suitable solution might use bounded friction impulses, complementarity conditions, a projected velocity update, or another mathematically defensible method.

The mechanism must satisfy:

1. Friction cannot spontaneously inject kinetic energy.
2. A friction impulse must not overshoot stopping and create opposite motion.
3. Steering may remain stationary under a torque smaller than the available static-friction capacity.
4. Motion begins when applied torque exceeds the relevant threshold.
5. Sliding friction opposes relative motion.
6. Transitions through zero angular velocity are numerically stable.
7. Results converge as timestep decreases.

If static and kinetic friction use different coefficients, document their physical roles and expose them only if justified.

Avoid arbitrary dead zones that merely hide the oscillation visually.

### Mandatory reproduction

Reproduce the original 100 Hz stationary test:

- Initial road-wheel angle: 0.3 rad.
- Coulomb friction: 2 N·m.
- Viscous damping: 0.1 N·m·s/rad.
- Duration: 10 simulated seconds.
- No driver input.
- No externally induced steering excitation.

Compare the original 324 sign reversals with the corrected result.

Do not judge success from sign-change count alone. Measure angle amplitude, angular velocity, torque, friction work, and convergence.

---

# 6. Self-centering and restoring torque

Investigate the existing Self Center Rate parameter.

The original audit identified a low-speed restoring mechanism with an effective spring-like formulation dependent on steering angle, column inertia, and vehicle speed.

Determine whether this mechanism:

- Represents mechanical centering.
- Approximates caster-related behavior.
- Compensates for missing steering geometry.
- Provides gameplay assistance.
- Overlaps with tire-generated aligning moments.

A physically based restoring torque should be interpretable through a mechanical source or a clearly declared approximation.

Evaluate whether the fallback centering mechanism should remain, be reformulated as a stiffness coefficient, or be replaced by an identifiable mechanical relationship.

Do not assume pneumatic trail and mechanical centering are duplicates: their physical origins may differ.

The correct solution must preserve plausible stationary steering behavior without introducing an unexplained automatic centering controller.

If the restoring coefficient changes with vehicle speed, analyze the associated energy implications and justify that dependency.

---

# 7. Column inertia and viscous damping

Audit the effective steering inertia and damping model.

Determine whether:

- Column inertia has physically meaningful units and scale.
- Inertia is expressed in the same generalized coordinate as torque.
- Damping opposes angular velocity.
- Damping force is passive.
- Integration is stable for all supported parameter combinations.
- Numerical stability depends excessively on the physics timestep.
- Mechanical damping is inadvertently duplicated by input smoothing or tire transients.

Evaluate the steering subsystem's natural frequency and damping response under simplified conditions where the required linearization is valid.

Test underdamped, critically damped, and overdamped responses where meaningful.

Do not assume every configuration must be critically damped. Physically permitted oscillation is not inherently a defect.

The requirement is that passive components do not create energy or unphysical runaway behavior.

---

# 8. Steering input and mechanical actuation

**A major objective is to make driver control and free steering part of one coherent mechanical model.**

Currently, user-controlled steering may prescribe position directly, while released steering follows a separate dynamic torque model.

Investigate whether this produces:

- Instantaneous position changes.
- Unrealistic steering angular velocities.
- Discontinuous energy changes.
- Incorrect torque histories.
- Abrupt input-to-free transitions.
- Unexpected steering acceleration.
- Dependence on mouse event frequency or rendering frame rate.
- Oscillations introduced by inherited velocity estimates.

Determine what exactly happens when the driver suddenly releases the steering control.

### Required approach

Evaluate physically defensible actuation models, such as:

- A prescribed steering position with explicit actuator-work accounting.
- A torque-driven steering input.
- A bounded-impedance driver controller.
- A hybrid scheme with consistent state transfer.

Select the simplest model that supports reliable control and physically interpretable release dynamics.

If position control remains, explicitly define how its imposed motion changes steering velocity and stored energy.

Do not silently fabricate a steering impulse when switching modes.

Preserve existing practical mouse and keyboard functionality unless a change is necessary and documented.

A human driver must still be able to steer precisely.

---

# 9. Pneumatic trail and self-aligning torque

Mission 02 changed the tire-generated aligning moment and removed redundant tire-side delays.

Do not revert those corrections.

Instead, validate how the steering column receives and responds to the current tire-generated self-aligning torque.

Investigate:

- Sign and magnitude.
- Road-wheel steering-coordinate consistency.
- Forward and reverse travel.
- Tire load dependence.
- Tire saturation.
- Combined slip.
- Pneumatic-trail decay.
- Steering response during rapid slip changes.
- Previous-step versus current-step torque timing.
- Low-speed behavior.
- Contact unloading and recontact.

Determine whether the remaining delayed feedback has an appropriate stability margin across the intended operating envelope.

Use controlled torque-step and steering-release tests.

If a tighter steering/contact coupling is necessary, propose and implement a mathematically defensible integration strategy within the approved steering/contact interface.

Do not simply suppress aligning torque to eliminate oscillations.

### Important modeling boundary

Distinguish pneumatic trail from mechanical trail, caster effects, kingpin geometry, rack friction, and steering scrub.

They are not interchangeable.

Exact stationary tire scrub torque is not represented by Mission 02's point-contact pneumatic model.

Do not pretend that pneumatic trail alone can reproduce full stationary steering resistance.

Identify what is absent and which approximations are appropriate for the present planar simulator.

---

# 10. Steering geometry and left/right front wheels

Evaluate whether the common steering-angle representation is adequate for the simulator's current fidelity.

Specifically investigate:

- Common front steering angle.
- Individual front-wheel contact velocities.
- Wheelbase and track effects.
- Ackermann steering geometry.
- Inside/outside steering angles.
- Steering ratio.
- Maximum steering angle.
- Mechanical steering limits.
- Possible differential aligning moments between front wheels.

Determine whether the absence of Ackermann geometry or separate front-wheel steering angles materially affects the present driving model.

Do not automatically introduce four independent steering assemblies or a full suspension-kinematics model.

If an improvement is worthwhile, state its physical justification and complexity.

Keep major geometry expansion outside the mission unless necessary to correct an identified inconsistency.

---

# 11. Steering limits and mechanical stops

Investigate the existing Max Steer clamp.

A steering stop is a mechanical unilateral constraint, not merely an arbitrary limit applied to a number.

Determine whether the implementation:

- Prevents motion beyond the limit.
- Correctly handles velocity directed into a stop.
- Allows smooth departure from the stop.
- Avoids numerical chatter.
- Accounts for energy dissipated or transferred at impact.
- Behaves consistently under high driver torque.
- Remains stable at different timesteps.

Implement a physically and numerically defensible steering-stop policy if the present implementation fails these tests.

Do not inject unexplained energy when the steering reaches or leaves a stop.

---

# 12. Steering energy and torque accounting

Create a steering-specific energy and work ledger.

At minimum, account for:

- Steering rotational kinetic energy.
- Mechanical restoring potential energy, where applicable.
- Driver-actuator work.
- Tire aligning-moment work.
- Viscous damping dissipation.
- Coulomb friction dissipation.
- Mechanical-stop impulses and energy changes.
- Numerical energy residual.

For a simplified effective steering coordinate:

K_steer = ½ I_steer ω_steer²

Extend this appropriately to the actual steering representation.

For passive isolated steering tests, verify nonincreasing mechanical energy when no external work enters the subsystem.

When the driver or tire contact performs work, correctly account for that input.

Do not label all steering energy loss as friction without separating modeled dissipation from integration error.

Where the complete tire/rack/chassis work exchange cannot be closed due to model limitations, state exactly what remains unaccounted for.

---

# 13. Vehicle sleep and near-stationary state consistency

The original audit and Mission 02 identified residual inconsistencies when near-rest sleep resets position histories while certain cached states remain active.

Investigate the steering-related consequences.

Determine whether the following are mutually consistent when the vehicle enters or leaves sleep:

- Vehicle velocity.
- Vehicle yaw rate.
- Steering angle.
- Steering rate.
- Tire contact state.
- Tire relaxation.
- Aligning torque.
- Steering restoring torque.
- Driver control state.

Do not permit stale state to generate an unexplained steering impulse when the car wakes.

Do not globally clear physical steering or tire memory merely because the speed drops below an arbitrary threshold.

Preserve meaningful mechanical state and define explicit reset rules for quantities that cannot remain valid.

If the correction belongs to shared application state rather than steering alone, make the smallest justified change and document it.

---

# 14. Controlled experiments

Establish reproducible tests before implementation.

At minimum:

| Experiment | Validation objective |
|---|---|
| Exact-rest steering | No unexplained spontaneous motion |
| Small stationary perturbation | Proper passive decay or static hold |
| High Coulomb / low damping | Eliminate numerical friction chatter |
| Subthreshold applied torque | Correct static sticking |
| Above-threshold torque | Correct breakaway and sliding |
| Torque reversal | Stable zero crossing |
| Steering spring release | Correct natural response |
| Viscous damping sweep | Passive dissipation and timestep convergence |
| Mechanical stop impact | Bounded, consistent angular motion |
| Low-speed steering release | No artificial torque-feedback runaway |
| Moving steering release | Physically coherent self-alignment |
| Forward/reverse comparison | Correct aligning torque and coordinate signs |
| High-speed countersteering | Stable coupled response |
| Sustained drift | No hidden automatic countersteering |
| Driver position-to-free transition | No fabricated velocity or energy impulse |
| Sleep/wake transition | No stale-state steering kick |
| Timestep sweep | Numerical convergence |
| Mission 01 invariants | No renewed chassis energy loss |
| Mission 02 tire tests | No regression in contact-force correctness |

Retain historical experiment settings so comparisons remain reproducible.

---

# 15. Computational performance

Mission 02 introduced a coupled nonlinear contact solver whose worst recorded scenario required approximately 1,016 accepted internal contact steps during one outer tick.

Performance must now be treated as a first-class engineering constraint.

Measure:

- Steering update cost.
- Additional contact-solver work caused by steering changes.
- Solver iterations and accepted subdivisions.
- Worst observed per-tick computational cost.
- Performance under rapid countersteering.
- Performance across multiple supported physics rates.
- Relative performance before and after Mission 03.

Separate correctness-related solver costs from unnecessary implementation overhead.

Do not loosen physical tolerances or introduce artificial damping merely to improve performance.

If Mission 03 increases computational cost materially, document the cause and alternatives.

Avoid prematurely optimizing unrelated tire internals, but identify any interaction that would make future large-scale AI training impractical.

The eventual objective includes running many simulated vehicles and training AI drivers; numerical correctness and computational throughput must both be measurable.

---

# 16. Parameter and UI recommendations

Review the meaning and exposure of the existing steering sliders.

Classify each as:

- Physically meaningful configuration.
- Empirical mechanical approximation.
- Numerical parameter.
- Input-control setting.
- Derived quantity.
- Read-only diagnostic.
- Redundant or obsolete mechanism.

Evaluate whether additional controls are useful, including:

- Steering ratio.
- Effective steering inertia.
- Static friction capacity.
- Kinetic friction capacity.
- Mechanical restoring stiffness.
- Steering damping.
- Driver input torque or actuator strength.
- Steering-stop characteristics.

Do not add all of these automatically.

Prefer a minimal, independently meaningful set of controls.

A parameter should not be exposed merely because it exists in an equation.

Preserve user-facing functionality and document any revised semantics or configuration migrations.

Graphics sliders remain outside scope.

---

# 17. Validation and acceptance criteria

Mission 03 succeeds when:

1. The previously reproduced Coulomb-friction chatter is eliminated through a mathematically justified correction.
2. Static sticking, sliding friction, and zero-crossing behavior are physically and numerically consistent.
3. Steering inertia, friction, damping, restoring torque, and aligning torque use compatible units and coordinates.
4. Steering energy changes are attributable to defined work, dissipation, or bounded numerical error.
5. Driver-controlled steering and free steering transition consistently.
6. Mechanical steering limits behave without numerical energy injection.
7. Stationary and low-speed steering remain stable under the appropriate test conditions.
8. Real physically permitted steering oscillations are not suppressed by hidden assistance.
9. Relevant steering/contact feedback tests converge as timestep decreases.
10. Mission 01's rigid-body numerical invariants remain intact.
11. Mission 02's tire/contact correctness tests remain intact.
12. Existing supported driving controls continue to work.
13. Computational cost and worst-case solver behavior are measured.
14. Remaining physical limitations are explicitly documented.

A clean visual animation or absence of steering jitter is not sufficient proof of correctness.

---

# 18. Required artifacts

Create:

`docs/physics-recovery/mission-03/`

Include:

**REPORT.md**

Complete technical diagnosis, implemented solution, equations, dependencies, and limitations.

**BEFORE_AFTER.md**

Quantitative comparisons of friction chatter, release dynamics, energy balance, and steering response.

**STEERING_MODEL.md**

Definitive description of steering coordinates, inertia, friction, damping, restoring torques, driver actuation, aligning torque, and mechanical stops.

**PARAMETERS.md**

Units, physical meaning, valid ranges, and dependencies of steering controls.

**VALIDATION.md**

Regression