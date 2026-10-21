# VERLETDRIFT — PHYSICS RECOVERY MISSION 02
## Tire Force Model Reconstruction, Physical Calibration, and Numerical Validation

### 0. Mission context

Mission 01 successfully corrected the foundational planar rigid-body integration and timestep-history problems, with accompanying numerical regression tests.

The next objective is to establish a physically coherent and numerically reliable tire model.

**Base branch:** `recovery/mission-01-numerical-dynamics`

**New working branch:** `recovery/mission-02-tire-dynamics`

Create the new branch from the latest completed Mission 01 implementation. Do not branch from the older original physics-audit revision.

Read and understand these documents before implementing anything:

- `docs/physics-audit/2026-10-21/REPORT.md` on the audited source branch.
- `docs/physics-recovery/mission-01/REPORT.md`
- All relevant existing tire, wheel, suspension, and numerical regression tests.

The investigation identified serious inconsistencies in tire-force parameterization, saturation behavior, and potentially the dynamic interactions between tire forces, steering feedback, and vehicle handling.

**Your objective is to correct the underlying physical model — not merely make the car easier or more entertaining to drift.**

---

# 1. Mandatory implementation principles

1. Preserve Mission 01's corrected rigid-body motion, timestep behavior, momentum accounting, and numerical regression tests.

2. Do not change yaw damping, steering column mechanics, suspension architecture, drivetrain, visual systems, or unrelated controls merely to compensate for tire behavior.

3. Do not arbitrarily reduce grip to encourage drifting.

4. Do not implement a new tire model solely because it sounds more sophisticated. Examine the existing model first, identify its actual defects, and select the least unnecessarily complex physically defensible approach.

5. Establish failing baseline tests before implementing corrections.

6. Require dimensional consistency, explicit definitions of physical quantities, and numerical convergence.

7. Preserve existing configuration compatibility where possible. If parameter semantics must change, introduce explicit migration rather than silently reinterpreting saved settings.

8. Do not merge into Mission 01, the original audit branch, or main.

---

# 2. Reconstruct the existing tire model

Begin by tracing the complete tire-force pipeline from vehicle motion and wheel rotation to the forces applied to the chassis.

Document:

- Contact-patch velocity calculation.
- Wheel longitudinal and lateral velocity.
- Slip-angle calculation.
- Slip-ratio calculation.
- Tire normal-load dependence.
- Longitudinal and lateral force targets.
- Combined-slip constraints.
- Force saturation.
- Sliding-friction behavior.
- Tire force relaxation.
- Wheel angular-velocity integration.
- Braking and driving torque interaction.
- Pneumatic-trail and self-aligning-torque output.
- Low-speed and zero-speed behavior.

Identify every related configurable and hidden coefficient.

Differentiate code-confirmed mathematical defects from calibration assumptions and empirical modeling choices.

---

# 3. Correct tire-force curve parameterization

The original audit reported that the default Peak Slip Angle slider was 8°, yet lateral force reached the friction cap around 0.15°.

It also identified a raw analytic peak around 0.869°.

This discrepancy is a primary target.

### Required investigation

Determine precisely why these values diverge.

Investigate the current Pacejka-inspired parameterization, including:

- Shape coefficient B.
- Shape coefficient C.
- Slip normalization.
- Force normalization.
- Friction limiting.
- Curve stiffness.
- Peak location.
- Peak force magnitude.
- Behavior after the peak.

Determine whether B, C, Peak Slip Angle, and Tire Friction are independently meaningful under the present implementation.

### Required correction

Establish a mathematically coherent parameterization in which the quantities presented to the user correspond to documented physical behavior.

In particular:

**Peak Slip Angle must identify the intended peak of the relevant unsaturated lateral force curve, not merely an arbitrary input-normalization scale.**

Likewise, Peak Slip Ratio must have an explicit, consistent meaning for longitudinal force.

Ensure that invalid combinations cannot silently produce zero force, inverted curves, unintended extrema, or discontinuous behavior.

If necessary, replace the existing curve parameterization with a documented empirical alternative.

Do not presume that Pacejka's Magic Formula is mandatory.

If the model uses a friction cap that produces a plateau, distinguish the analytic curve peak from the onset of saturation. Do not falsely label them as the same phenomenon.

---

# 4. Tire stiffness and force saturation

Examine the physical implications of the current tire stiffness.

The original audit estimated an exceptionally steep lateral force response at small slip angles.

Investigate:

1. Small-slip lateral stiffness.
2. Small-slip longitudinal stiffness.
3. Load-dependent stiffness.
4. Peak force versus available friction.
5. Behavior beyond peak slip.
6. Continuity and differentiability where important.
7. Sensitivity to timestep and wheel velocity.
8. Numerical consequences of very steep force gradients.

Determine whether the model can generate plausible progressive force buildup, saturation, and sliding.

Avoid a tire model that behaves like an excessively rigid lateral constraint until a tiny slip threshold is crossed.

Likewise, do not artificially soften the force response without preserving the intended physical relationships.

Provide force-versus-slip graphs for multiple parameter configurations and vertical loads.

---

# 5. Combined longitudinal and lateral slip

Investigate the coupling between driving, braking, and cornering.

A physically coherent tire must account for limited combined force capability at the contact patch.

Verify that simultaneous longitudinal and lateral demands interact consistently with the selected tire model.

Investigate scenarios involving:

- Acceleration while cornering.
- Braking while cornering.
- Locked-wheel sliding.
- Excessive driven-wheel spin.
- Handbrake-induced rear slip.
- Countersteering during sustained oversteer.
- Combined high slip angle and slip ratio.

Avoid simply adding independent maximum longitudinal and lateral forces without appropriate combined-force limiting.

If a friction-circle, ellipse, brush, or empirical combined-slip approach is selected, document its justification and limitations.

The result should maintain coherent friction utilization and physically defensible force directions.

---

# 6. Sliding Grip and post-peak behavior

Investigate the existing Sliding Grip parameter, currently expressed as a percentage.

Determine exactly how it influences the tire model.

Answer:

- Does it represent a kinetic-to-peak friction ratio?
- Does it affect lateral sliding, longitudinal sliding, or both?
- Does its influence depend on slip ratio, slip angle, or contact-patch velocity?
- Does it produce smooth or discontinuous transitions?
- Is the resulting behavior physically defensible?

Do not remove this parameter solely because it is dimensionless or empirical.

Instead, establish whether it represents a useful physical calibration coefficient.

If it remains, document precisely what its percentage means.

Ensure that post-peak tire behavior is defined coherently, including pure lateral sliding and combined sliding.

---

# 7. Tire Load Sensitivity and suspension interaction

Preserve the independently calculated wheel normal loads produced by the existing suspension architecture.

Investigate how those loads affect tire friction, stiffness, and force saturation.

Verify:

- Correct use of instantaneous normal load.
- Plausible nonlinear load sensitivity.
- Monotonic or appropriately bounded force capacity.
- Correct behavior when a wheel unloads.
- Correct response when normal load approaches zero.
- No artificial grip generation for unloaded wheels.
- No inappropriate duplication of weight-transfer corrections.

Test asymmetric wheel loads under braking, acceleration, and cornering.

Avoid modifying suspension mechanics unless a tire-interface defect makes it unavoidable. Document any such dependency separately.

---

# 8. Tire relaxation and transient physical behavior

Investigate the existing relaxation-length mechanism and the other smoothing mechanisms involved in tire dynamics.

Determine:

- Which delays approximate tire deformation or transient force buildup.
- Which delays exist for numerical stabilization.
- Whether several independent filters are modeling the same physical lag.
- Whether relaxation remains meaningful at low speed.
- Whether response times change sensibly with vehicle speed.
- Whether transient forces obey plausible bounds and continuity.
- Whether the transient implementation can inject energy or destabilize feedback.

Select or retain a coherent transient tire-force model with clearly defined physical and numerical assumptions.

Do not simply remove all filtering to obtain instantaneous tire response.

Do not add arbitrary damping or smoothing to conceal numerical instability.

Where a complete stored-energy interpretation is unavailable, identify the limitation and test dissipative behavior experimentally.

---

# 9. Low-speed, zero-speed, and pivoting behavior

The original audit found cases where the vehicle's center speed was zero while an individual wheel had substantial lateral velocity, yet lateral tire resistance was suppressed.

Investigate this carefully.

**A wheel's contact behavior should be based on the relevant local contact-patch motion, not exclusively on the speed of the vehicle center.**

Test:

- Stationary chassis with no wheel motion.
- Slow straight-line motion.
- Very low-speed cornering.
- Pure chassis yaw about the center.
- Rotation about an off-center point.
- Wheel lock.
- Transition from rolling to sliding.
- Transition from movement to rest.
- Reversal of travel direction.

Avoid division-by-zero artifacts and arbitrary force discontinuities.

However, recognize that a rolling slip-angle model becomes ill-conditioned at standstill. Low-speed contact requires a physically and numerically justified treatment, not simply extrapolating high-speed slip equations down to exactly zero.

If the existing solver cannot represent static friction or standstill contact consistently, document the limitation and propose an appropriate integrated correction within the mission's tire/contact scope.

---

# 10. Tire forces and steering self-aligning torque

The original audit identified an unstable low-speed steering feedback loop involving tire forces, relaxation, pneumatic trail, filtered self-aligning torque, and steering column dynamics.

Mission 02 must assess the tire-generated portion of this feedback.

Determine whether the reconstructed tire model produces:

- Correctly directed lateral tire forces.
- Sensible aligning torque magnitude.
- Appropriate slip dependence.
- Appropriate vertical-load dependence.
- Appropriate behavior near saturation.
- Stable or physically interpretable transient torque behavior.

Do not redesign steering column inertia, Coulomb friction, steering input mapping, or mechanical damping in this mission.

Do not suppress tire aligning torque merely to make the oscillation disappear.

Run the previous low-speed steering reproductions to identify downstream changes.

If the full steering loop remains unstable, document that result for Mission 03.

---

# 11. Energy, work, and physical consistency

Extend numerical validation to the tire/contact interface.

Track the relationship between:

- Chassis translational motion.
- Chassis yaw.
- Wheel rotational motion.
- Applied drive torque.
- Applied brake torque.
- Contact forces.
- Contact impulses.
- Contact-patch slip.
- Tire relaxation states.
- Frictional dissipation.

Verify that contact forces and wheel reaction torques are mutually consistent.

Distinguish actual physical dissipation from numerical energy loss.

In force-free cases with contact forces disabled, the Mission 01 energy and momentum invariants must continue to hold.

Where a fully closed transient tire energy balance is not possible, establish a defensible partial work ledger and clearly identify the unmodeled energy storage or dissipation.

Do not claim total energy conservation based on chassis kinetic energy alone.

---

# 12. Numerical experiments and automated tests

Create tests before changing implementation.

At minimum, include:

| Experiment | Required assessment |
|---|---|
| Lateral force curve | Peak angle, stiffness, cap, post-peak response |
| Longitudinal force curve | Peak slip ratio and force behavior |
| Combined slip | Bounded and directionally consistent forces |
| Vertical load sweep | Correct load sensitivity |
| Zero normal load | Absence of unsupported contact forces |
| Pure rolling | Near-zero slip force |
| Locked-wheel braking | Physically consistent longitudinal response |
| Driven-wheel spin | Proper wheel/contact coupling |
| Low-speed pivot | Local patch velocity correctly represented |
| Relaxation step response | Sensible transient dynamics |
| Extreme valid parameters | Finite and appropriately bounded behavior |
| Timestep refinement | Convergent numerical response |
| Steering release | Downstream SAT and steering behavior |
| Aggressive cornering | Handling impact without tuning compensation |
| Handbrake maneuver | Rear saturation and yaw response |
| Mission 01 regressions | No reintroduction of numerical energy loss |

Where useful, add property-based tests across valid parameter domains.

Generate force-versus-slip plots and before-and-after comparison figures.

Include sufficient raw data to reproduce the numerical claims.

Do not fabricate real-world tire data or describe arbitrary synthetic test curves as experimentally validated tire behavior.

---

# 13. Configuration and UI requirements

Preserve existing slider controls wherever their meaning remains defensible.

If the underlying mathematics changes the meaning of a slider, document the semantic change.

Consider whether users would benefit from controlling:

- Small-slip cornering stiffness.
- Longitudinal slip stiffness.
- Peak slip angle.
- Peak slip ratio.
- Peak tire friction.
- Sliding friction ratio.
- Load sensitivity.
- Tire relaxation length.

Do not necessarily expose all these quantities independently.

Determine which constitute an identifiable, nonredundant parameter set.

Avoid combinations of controls that mathematically contradict one another.

Prefer physically interpretable user controls over arbitrary internal equation coefficients.

Keep numerical solver parameters separate from physical tire configuration.

Purely visual controls and unrelated graphics are outside the scope of Mission 02.

---

# 14. Implementation strategy

Work in this order:

1. Reconstruct and document the existing equations.
2. Establish failing tests for the identified defects.
3. Compare physically defensible corrective approaches.
4. Select a coherent model and justify the choice.
5. Implement the smallest complete correction.
6. Validate force curves and contact behavior.
7. Validate longitudinal/lateral coupling.
8. Validate numerical convergence.
9. Rerun Mission 01 regression tests.
10. Perform controlled before-and-after handling experiments.
11. Document unresolved limitations and Mission 03 dependencies.

Do not stop after merely relabeling sliders or changing default values.

Do not rewrite unrelated vehicle systems.

If preserving an existing public API requires wrappers or compatibility logic, keep their physical semantics explicit.

---

# 15. Required deliverables

Create:

`docs/physics-recovery/mission-02/`

Include:

**REPORT.md** — Full analysis, physical equations, implementation rationale, source references, limitations, and findings.

**BEFORE_AFTER.md** — Clear comparison between the original and corrected tire behavior.

**PARAMETERS.md** — Definitive meaning, units, valid ranges, and dependencies of each tire-related parameter.

**Experimental data** — Machine-readable results for slip curves, load sweeps, transient response, and handling scenarios.

**Figures** — Force curves, saturation behavior, combined slip, and representative dynamics.

**Automated tests** — Added regression coverage, including preservation of Mission 01's invariants.

**VALIDATION.md** — Test results, numerical convergence, unexecuted validations, and known limitations.

**MANIFEST.json** — Branch, source revision, test counts, relevant hashes, and reproducibility information.

Do not present experimental measurements as real-world calibration data unless they come from identified physical measurements.

Where quantitative real-world validation is unavailable, classify outcomes as mathematical consistency, qualitative plausibility, or calibrated physical accuracy.

---

# 16. Acceptance criteria

Mission 02 succeeds when:

1. Peak Slip Angle and Peak Slip Ratio have meaningful, verified definitions consistent with their actual tire curves.
2. Force stiffness and saturation are mathematically coherent.
3. Parameter domains exclude invalid or pathological combinations.
4. Combined longitudinal/lateral forces obey the selected contact-friction model.
5. Load sensitivity responds correctly to changing wheel loads.
6. Low-speed contact behavior is substantially more consistent and free of the identified center-speed dependency defect.
7. Tire-force relaxation has interpretable behavior and measurable numerical properties.
8. Contact forces and wheel reactions are consistent within defined tolerances.
9. Mission 01's free-motion numerical invariants remain intact.
10. All relevant tests pass, with before-and-after evidence.
11. No arbitrary yaw damping, stability assistance, or artificial grip adjustment has been introduced to mask problems.
12. Known remaining steering-loop instability is honestly reported rather than concealed.

A change is not automatically successful merely because the car feels easier to drive.

**The objective is predictable physics arising from documented equations, not predictable outcomes imposed on the driver.**

---

# 17. Final instruction

Remember the long-term objective: a driving simulator capable of supporting AI-controlled drivers that learn genuine vehicle-control behavior.

A learning agent must not depend on hidden physics corrections that artificially rescue it from errors.

Preserve valid physical approximations. Correct demonstrated contradictions. Keep the model interpretable and testable.

Do not merge your branch.

Conclude with an evidence-based recommendation for Mission 03: **Steering Dynamics and Self-Aligning Torque Recovery**.

**Physical correctness first. Calibration second. Handling evaluation third.**
