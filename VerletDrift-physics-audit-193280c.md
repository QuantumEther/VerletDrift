# VerletDrift driving physics and realism audit

Audited 14 October 2026. Repository: QuantumEther/VerletDrift. Branch: fix/wheel-inertia-braking. Commit: 193280c, “Add motion energy telemetry to HUD.”

This is a report-only audit. No repository files were changed, committed, or pushed. Existing source and tests were inspected; supplementary scripts, configurations, results, and this report were written outside the repository under /tmp. Source references below refer to the audited commit.

## Executive summary

The simulation has useful physical foundations: SI units, four individual tire contacts, wheel rotational inertia, reaction torque matched to longitudinal contact impulse, brakes acting on rotors, a crank inertia model, load-sensitive tire grip, and spring/damper chassis motion. Those are meaningful improvements over simply steering a moving sprite.

However, believable behavior is currently limited by implementation contradictions and uncalibrated numerical effects. Changing sliders cannot resolve all of them. The most important confirmed findings are:

1. **Presets do not change the actual vehicle mass, yaw damping, or rolling resistance as their definitions intend.** They write obsolete property names. The “heavy SUV” and “go-kart” both remain 1,200 kg when selected from the normal startup configuration.
2. **Changing simulation frequency or time scale while moving can change velocity without a physical impulse.** Position history is retained without rescaling it for the new timestep. An isolated 10 m/s coast became 20 m/s when dt changed from 0.01 to 0.005 seconds.
3. **The tire settings are not calibrated to their labels.** At B=10 and C=1.9, the mathematical raw lateral-force peak is around 0.869°, despite “peak slip angle” being 8°. The raw peak is about 2.945 times the nominal friction limit; the friction cap hides it behind a broad plateau.
4. **Legal values of the tire shape slider can disable lateral tire force.** At B=10, C values such as 2.15, 2.5, and 3 trigger an early return of zero force.
5. **Constraint correction itself removes yaw motion.** With tires, drag, and explicit yaw damping excluded, browser-default constraint settings reduced an initial 3 rad/s rotation to about 1.276 rad/s after five seconds. Explicit yaw damping then adds a separate loss on top.
6. **Clutch lock and engine inertia are not consistently coupled to both rear wheels.** The transition into locked operation discards speed mismatch without a modeled clutch impulse, and splitting reflected crank inertia into two independent rear-wheel inertias adds resistance to differential wheel motion that should not rotate the engine.
7. **The final tire force does not always respect the friction circle.** A 486-case transition sweep found an applied force 1.0353 times its limit at a 33.3 ms chassis timestep.
8. **Some “arcade” behavior is real vehicle-force behavior, not just presentation.** Popping a balloon changes chassis velocity by up to 1.5 m/s, without a balloon mass, contact impulse model, or energy balance.

Other verified problems include a twice-bound engine toggle, reversed default grip-state thresholds, and misleading grip colors. These can make the driver’s observations harder to interpret.

**Validation:** 129/129 unit tests and 22/22 browser tests passed. That demonstrates the existing checked behaviors, not physical realism. Of these, 50 unit tests and 16 browser tests concern diagnostics/logging rather than vehicle dynamics. Supplementary probes exposed cases the existing tests do not cover.

**Recommended starting task:** repair configuration and timestep handling, establish a reproducible maneuver harness using the actual simulation step, and then correct the tire curve and its parameter semantics. Recalibrate handling only after those foundations are dependable. More suspension detail, tire temperature, ABS, and differential features should follow later.

## System map and parameter flow

| Stage | Current behavior | Source |
|---|---|---|
| Startup configuration | State initializes defaults; HTML controls then overwrite many of them. | [state.js](/workspace/VerletDrift/js/state.js:427), [main.js](/workspace/VerletDrift/js/main.js:271), [ui.js](/workspace/VerletDrift/js/ui.js:166) |
| User input | Keyboard flags control throttle, brake, clutch, handbrake, and gears. Mouse drag directly sets a visual steering angle or analog throttle. | [input.js](/workspace/VerletDrift/js/input.js:79) |
| Preset application/import | Values are copied directly into the existing parameter object; controls are refreshed afterward. No schema or mechanical-state reset is applied. | [ui.js](/workspace/VerletDrift/js/ui.js:605), [ui.js](/workspace/VerletDrift/js/ui.js:667) |
| Scheduling | Wall-time accumulator fires configured physics ticks; simulated dt equals timeScale / simulationFps. Whole ticks are discarded when the frame cap is exceeded. | [main.js](/workspace/VerletDrift/js/main.js:627) |
| Handbrake/steering | Handbrake value ramps; steering is imposed while dragging or integrated from previous filtered tire aligning torque when released. | [main.js](/workspace/VerletDrift/js/main.js:762), [steering.js](/workspace/VerletDrift/js/physics/steering.js:49) |
| Engine/clutch | Crank torque, clutch engagement, governor, limiter, friction, and stall rules are updated. Locked mode passes net crank torque onward rather than integrating an independent crank. | [engine.js](/workspace/VerletDrift/js/physics/engine.js:88) |
| Suspension/loading | Suspension integrates heave, pitch, and roll using previous planar acceleration, returning tick-average normal loads. Disabled suspension substitutes algebraic weight transfer. | [suspension.js](/workspace/VerletDrift/js/physics/suspension.js:49), [weight.js](/workspace/VerletDrift/js/physics/weight.js:28) |
| Tire/wheel contact | Per-wheel velocities and slip produce targets; an adaptive implicit rotor solve integrates longitudinal contact and brake impulses. Lateral force is separately relaxed. | [tires.js](/workspace/VerletDrift/js/physics/tires.js:94), [wheel.js](/workspace/VerletDrift/js/physics/wheel.js:60) |
| Body forces | Tire forces plus drag drive translation; tire moments plus explicit yaw damping drive rotation. | [main.js](/workspace/VerletDrift/js/main.js:790) |
| Chassis integration | Four particle positions advance; distance constraints, displacement limits, boundary collisions, and another constraint pass modify the result. | [main.js](/workspace/VerletDrift/js/main.js:824), [integrator.js](/workspace/VerletDrift/js/physics/integrator.js:29) |
| Derived state/sleep | Body velocity, yaw rate, acceleration, and jerk are derived; near-rest particle history may be zeroed. | [kinematics.js](/workspace/VerletDrift/js/physics/kinematics.js:81), [engine.js](/workspace/VerletDrift/js/physics/engine.js:306) |
| Gameplay/presentation | Balloon impulses run after body derivation; effects and diagnostics update; rendering interpolates selected pose fields. Energy is calculated for the HUD during rendering. | [main.js](/workspace/VerletDrift/js/main.js:879), [balloon.js](/workspace/VerletDrift/js/balloon.js:206), [ui.js](/workspace/VerletDrift/js/ui.js:774) |

Parameter ownership is conventional rather than enforced: physicsState, renderState, uiState, and the other “slice” exports all reference the same object. This is not itself a physics error, but makes it possible for presentation/gameplay code to change mechanical state. See [state.js](/workspace/VerletDrift/js/state.js:844).

The appendix inventories all **162 sliders, 14 checkboxes, and 99 exported constants**. Hidden mechanical coefficients are described separately below.

## Findings by subsystem

### Configuration, presets, and controls

### F01 — Vehicle presets write inactive properties

**References:** [ui.js](/workspace/VerletDrift/js/ui.js:526), [ui.js](/workspace/VerletDrift/js/ui.js:609), [state.js](/workspace/VerletDrift/js/state.js:433), [main.js](/workspace/VerletDrift/js/main.js:810), [tires.js](/workspace/VerletDrift/js/physics/tires.js:505).

**Current behavior:** Every built-in preset writes mass, yawDampingCoeff, rollResistCoeff, brakeForceMult, and aeroDownforce. The active model reads carMassKg, yawDamping, and rollingResistanceCoeff; it has no applied downforce or brake-force multiplier path for these preset properties.

**Physical principle:** Changing vehicle type should change the parameters the equations actually use.

**Assessment:** Contradictory configuration; high confidence. Real-browser checks confirmed all five presets retained 1,200 kg, yawDamping=1, and rollingResistanceCoeff=0.012 from startup.

**Driver effect:** Vehicle names imply substantial changes that do not happen. Differences mostly come from the remaining valid tire, steering, braking, and gearing settings.

**Improvement:** Define one parameter schema; reject unknown keys; migrate presets with explicit units. Do not directly map old yawDampingCoeff numbers into yawDamping: the former suggests a torque coefficient, while the active value is a decay rate in 1/s.

### F02 — Presets are partial, path-dependent configurations

**References:** [ui.js](/workspace/VerletDrift/js/ui.js:529), [ui.js](/workspace/VerletDrift/js/ui.js:605), [constants.js](/workspace/VerletDrift/js/constants.js:44).

**Current behavior:** Object.assign merges a subset of settings into the current vehicle. Existing engine, spring, damper, wheel, and other user modifications remain. All presets share fixed 3.0 m wheelbase and 1.6 m track; the kart retains the car’s geometry and suspension model.

**Physical principle:** A reproducible vehicle configuration needs defined geometry, mass distribution, drivetrain, tires, and loading—not merely a name and a few overrides.

**Assessment:** Simplified and insufficiently specified; high confidence from source. Current presets cannot establish calibrated vehicle categories.

**Driver effect:** Selecting “Stock Road” need not restore a stock baseline. A preset may behave differently depending on which sliders were changed beforehand.

**Improvement:** Make complete vehicle baselines and separate surface presets. Apply mechanical changes at reset or explicitly define how current momentum and stored states are preserved.

### F03 — Imported values and slider relationships lack validation

**References:** [ui.js](/workspace/VerletDrift/js/ui.js:674), [ui.js](/workspace/VerletDrift/js/ui.js:631), [index.html](/workspace/VerletDrift/index.html:224), [index.html](/workspace/VerletDrift/index.html:241), [engine.js](/workspace/VerletDrift/js/physics/engine.js:64).

**Current behavior:** JSON values are assigned without type, range, or relationship checks. Slider refresh sets the browser element without copying browser clamping back to state. In the real browser, kart friction remains 2.1 internally while its slider reads 2; ice friction remains 0.28 while its slider reads 0.3. Clutch bite point and bite range can sum above one.

**Physical principle:** A displayed configuration should match the equations and permit mechanically coherent combinations.

**Assessment:** Contradictory parameter flow; high confidence. A legal bitePoint=0.85, biteRange=0.5, curve=2.5 leaves only about 4.93% engagement with the pedal fully released.

**Driver effect:** Moving a seemingly unchanged slider can change handling. Some settings prevent full clutch engagement; imports can create invalid divisions or nonsensical masses/timesteps.

**Improvement:** Validate finite numbers, units, bounds, idle/stall/redline ordering, clutch endpoints, and grip hysteresis. Report rejected/clamped values. Separate display position from transformed physical values.

### F04 — Browser defaults and mechanics-test defaults differ

**References:** [state.js](/workspace/VerletDrift/js/state.js:452), [ui.js](/workspace/VerletDrift/js/ui.js:175), [index.html](/workspace/VerletDrift/index.html:257), [index.html](/workspace/VerletDrift/index.html:747), [tests/wheels.test.js](/workspace/VerletDrift/tests/wheels.test.js:14).

**Current behavior:** HTML initialization overrides state defaults: redline 9,000→7,000 rpm, stall resistance 0.7→0.5, clutch curve 1.8→2.5, constraint iterations 12→6, constraint damping 0.85→0.8, and grip thresholds 0.90/0.80→0.70/0.85. Map dimensions and several effects also differ.

**Physical principle:** Tests intended to represent the normal car should exercise its actual startup configuration.

**Assessment:** Verification gap and contradictory sources of truth; high confidence from initialization probes and source.

**Driver effect:** A unit-tested maneuver can differ from the normally loaded simulation, especially in clutch behavior and numerical yaw loss.

**Improvement:** Store defaults once; have UI and tests consume them. Retain explicit test variants, but identify their configuration in output.

### F05 — The engine toggle is bound twice

**References:** [ui.js](/workspace/VerletDrift/js/ui.js:496), [ui.js](/workspace/VerletDrift/js/ui.js:513), [ui.js](/workspace/VerletDrift/js/ui.js:688).

**Current behavior:** Both initSliders and initPresets attach a click handler that reverses isRunning. A single click reverses it twice; restart handlers hard-code 800 rpm.

**Physical principle:** A control should apply one requested state transition.

**Assessment:** Confirmed control bug; high confidence. Browser check: true before click, true afterward.

**Driver effect:** The driver cannot normally switch the engine off. A click can also reset engine RPM, disguising it as a useful physical transition.

**Improvement:** Use one handler and the configured idle speed. Add a user-input test for the actual button.

### F06 — The frequency slider advertises a range it does not implement

**References:** [index.html](/workspace/VerletDrift/index.html:159), [ui.js](/workspace/VerletDrift/js/ui.js:204).

**Current behavior:** The slider allows 30–200 Hz, but the binder snaps to tens and clamps to 10–120. Browser check at slider 200: element reads 200, label and active parameter read 120.

**Physical principle:** Numerical controls should have consistent displayed and effective values.

**Assessment:** Confirmed UI/parameter contradiction; high confidence.

**Driver effect:** Trying to improve integration by selecting 200 Hz actually selects 120 Hz.

**Improvement:** Choose and validate a supported range, then show the applied value in the control itself. Establish convergence rather than assuming a higher number fixes realism.

### Tires and wheel contact

### F07 — “Peak slip” values do not locate the force peak

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:56), [tires.js](/workspace/VerletDrift/js/physics/tires.js:221), [index.html](/workspace/VerletDrift/index.html:719).

**Current behavior:** Slip is divided by the “peak” setting; force is normalized by sin(C·atan(B)). With B=10, C=1.9, the raw peak occurs at tan(π/(2C))/B times the setting. That gives 0.869° for an 8° angle setting and 0.0130 for a 0.12 ratio setting. Raw peak amplitude is 2.945 times the configured grip limit.

**Physical principle:** Peak force magnitude, peak slip, and small-slip stiffness must have defined, mutually consistent meanings.

**Assessment:** Incorrect parameter semantics masked by saturation; high confidence from analytic evaluation of the exact expression.

**Driver effect:** Grip saturates very early, followed by a broad capped plateau. B, C, friction, and “peak” sliders interact much more strongly than their labels imply; breakaway/return behavior can be difficult to tune coherently.

**Improvement:** Decide which parameters are independent. Normalize an explicit peak location and amplitude, or expose calibrated cornering stiffness and shape parameters without calling a scale factor “peak slip.” Plot raw and applied curves before handling calibration.

### F08 — Legal tire shape values can switch off lateral grip

**References:** [index.html](/workspace/VerletDrift/index.html:715), [tires.js](/workspace/VerletDrift/js/physics/tires.js:61), [tires.js](/workspace/VerletDrift/js/physics/tires.js:250).

**Current behavior:** If sin(C·atan(B)) is below 0.0001, pacejkaForce returns zero. At B=10, C=2.15, 2.5, or 3 produces a negative normalizer and disables the raw force law. Longitudinal force can still reappear above the separate sliding-floor threshold.

**Physical principle:** A valid parameter set should preserve a passive, continuous tire response.

**Assessment:** Confirmed range/formula incompatibility; high confidence.

**Driver effect:** A permitted slider position can eliminate steering response and create an abrupt longitudinal force transition at the sliding threshold.

**Improvement:** Correct the normalization and validate its domain. Add curve tests across the supported parameter space, including continuity and passivity checks.

### F09 — Applied force can exceed the friction circle during transitions

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:278), [tires.js](/workspace/VerletDrift/js/physics/tires.js:320), [wheel.js](/workspace/VerletDrift/js/physics/wheel.js:81), [tests/tire-unloading.test.js](/workspace/VerletDrift/tests/tire-unloading.test.js:56).

**Current behavior:** Targets and carried force are capped, but lateral force uses an endpoint relaxation value while longitudinal force uses a tick-average contact impulse. These are different temporal samples of the force vector.

**Physical principle:** The complete applied contact force should respect its load-dependent friction bound throughout integration.

**Assessment:** Confirmed transient bound violation; high confidence. A 486-case source-module sweep found a ratio of 1.03532 at dt=1/30 s, velocity (-4,-20) m/s, initial rotor speed zero, and carried longitudinal force at the negative limit with zero carried lateral force. Initial carried force and target bounds were valid; no integration exception occurred.

**Driver effect:** Extra transient grip is possible at lower tick rates or larger time scale, particularly when braking and lateral demand change together.

**Improvement:** Integrate the two force components on compatible substeps and average the combined contact impulse. A final blind clamp would break the existing longitudinal rotor/contact impulse balance unless the rotor is solved consistently with it.

### F10 — Sliding grip is directional and only partly controlled by its slider

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:220), [tires.js](/workspace/VerletDrift/js/physics/tires.js:244), [tires.js](/workspace/VerletDrift/js/physics/tires.js:278).

**Current behavior:** tireSlidingFrictionRatio supplies a post-threshold longitudinal force floor. It neither sets a general sliding friction circle nor supplies the same post-peak treatment to lateral force. The shared cap uses the original peak grip limit.

**Physical principle:** A locked sliding contact should have a coherent combined-slip law, with dissipative force tied to contact-patch slip velocity. Real tires can have directional differences, but those require an intentional model.

**Assessment:** Useful game-oriented approximation needing calibration; high confidence in implementation, uncertainty about the best replacement for the intended tire.

**Driver effect:** Handbrake lock changes response, as the browser test confirms, but the slider is not a universal “sliding grip percentage.” Lateral resistance and lockup behavior depend strongly on the other curve settings.

**Improvement:** Define combined-slip/sliding behavior explicitly and validate lockup at several sideslip angles. Do not add an arbitrary chassis yaw impulse to create drifts.

### F11 — Slip ratio uses a bounded convention

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:236), [tires.js](/workspace/VerletDrift/js/physics/tires.js:216).

**Current behavior:** Ratio is (Rω−vLong)/max(|Rω|,|vLong|,0.5), clamped to ±1. Slip angle uses atan2(filtered lateral velocity, max(|vLong|,0.5)).

**Physical principle:** Slip conventions must match the tire coefficients or calibration data. Different conventions are legitimate, but not interchangeable at large slip.

**Assessment:** Simplified but reasonable regularization if documented and calibrated; high confidence. It is not the usual unbounded driven-wheel slip convention using vehicle speed alone.

**Driver effect:** Very large wheel overspeed collapses near κ=1, so the tire/slip gauge stops distinguishing progressively larger burnouts. Near rest, the 0.5 m/s reference dominates.

**Improvement:** Document the convention; preserve actual contact slip velocity as telemetry; transform any external tire data into the chosen convention.

### F12 — Multiple filters and low-speed fade alter tire response

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:200), [tires.js](/workspace/VerletDrift/js/physics/tires.js:227), [tires.js](/workspace/VerletDrift/js/physics/tires.js:260), [tires.js](/workspace/VerletDrift/js/physics/tires.js:487).

**Current behavior:** Lateral speed is filtered over 25 ms before tire evaluation; lateral force is then relaxed over length/max(|vLong|,0.5); steering aligning torque is filtered over another 80 ms. Lateral force also fades linearly with body speed below 2 m/s.

**Physical principle:** Tire relaxation represents deformation; numerical noise filtering represents a different concern. Stacking both without calibration can add excessive delay. Tires retain static lateral resistance at low speed.

**Assessment:** Uncalibrated stabilizers and simplified low-speed physics; high confidence in paths, medium confidence on the magnitude of handling error without measurements.

**Driver effect:** Delayed breakaway/countersteering and weak low-speed lateral holding. After a direction reversal, carried force may briefly follow old slip; rubber can physically return stored energy, but the present model has no corresponding stored deformation-energy account.

**Improvement:** First reduce solver noise; then fit one intentional relaxation model and a static/low-speed contact treatment. Measure response and energy before removing filters.

### F13 — Wheel torque/contact impulse matching is a sound foundation

**References:** [wheel.js](/workspace/VerletDrift/js/physics/wheel.js:7), [wheel.js](/workspace/VerletDrift/js/physics/wheel.js:60), [tires.js](/workspace/VerletDrift/js/physics/tires.js:287), [tests/wheels.test.js](/workspace/VerletDrift/tests/wheels.test.js:131).

**Current behavior:** Rotor torque balance includes drive, opposing brake friction, and road reaction. Adaptive step doubling returns accumulated contact and brake impulses. Brakes can hold a rotor at zero; there is no universal omega clamp.

**Physical principle:** Force on the vehicle and reaction torque on the wheel must correspond to the same contact impulse.

**Assessment:** Physically consistent core relationship with limited validation; high confidence. Existing tests verify torque balance, free momentum, passive braking, and a small wheel/chassis exchange.

**Driver effect:** Wheel omega can now represent persistent rotational motion rather than an arbitrary display. A high omega may be physically possible in an unloaded high gear; its meaning depends on radius, gear ratio, and crank speed.

**Improvement:** Preserve this relationship while fixing combined-slip integration. Validate nonlinear root selection and passivity over reversals and parameter extremes; the current bisection assumes an appropriate root despite a post-peak tire curve that need not be monotone.

### Engine, clutch, and drivetrain

### F14 — Locking the clutch does not resolve the speed mismatch

**References:** [engine.js](/workspace/VerletDrift/js/physics/engine.js:121), [engine.js](/workspace/VerletDrift/js/physics/engine.js:178), [engine.js](/workspace/VerletDrift/js/physics/engine.js:212), [tires.js](/workspace/VerletDrift/js/physics/tires.js:145).

**Current behavior:** Engagement above 0.99 switches directly to reflected-inertia mode; engine speed is overwritten from rear-wheel mean afterward. No clutch-lock impulse couples the existing crank and wheel angular momenta. Gear changes can also change the reflected inertia instantly.

**Physical principle:** A clutch synchronizes two inertias through torque/impulse and dissipates their relative-motion energy as heat. Changing a ratio with a connected driveline requires a defined coupling event.

**Assessment:** Confirmed missing coupling mechanics; high confidence. In an isolated source-module case, an initially 4,000 rpm crank carried 21.93 kJ, but locking against initially stationary wheels reduced it to about 120 rpm after a tick without a modeled mismatch impulse or heat account.

**Driver effect:** Clutch engagement and gear changes can erase or create drivetrain energy rather than delivering the expected wheel/chassis reaction.

**Improvement:** Solve finite-capacity clutch torque until synchronization is achievable, then lock with an impulse that preserves the appropriate angular momentum and accounts for dissipated energy. Test both signs and gear changes.

### F15 — Reflected engine inertia incorrectly resists differential wheel motion

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:145), [tires.js](/workspace/VerletDrift/js/physics/tires.js:289), [engine.js](/workspace/VerletDrift/js/physics/engine.js:216).

**Current behavior:** Each rear rotor independently receives Iengine·G²/2, while crank speed is G(ωLeft+ωRight)/2.

**Physical principle:** For an ideal differential, crank inertia responds to average axle speed. Its kinetic energy is 0.5·Iengine·G²·((ωLeft+ωRight)/2)², requiring coupled rear-wheel inertia terms. Equal-wheel motion is represented correctly by the current split; opposite changes in wheel speed are not.

**Assessment:** Confirmed mathematical inconsistency; high confidence. At Iengine=0.25 and G=14.35, rear speeds +20 and −20 rad/s leave crank speed zero, but the split effective inertias imply about 10.30 kJ of extra resistance to that difference mode.

**Driver effect:** Left/right wheel-speed differences during cornering, asymmetric traction, or wheel lift encounter artificial driveline inertia.

**Improvement:** Represent the differential/common axle and crank as coupled degrees of freedom. Then deliberately choose open, locked, or limited-slip behavior and validate equal/opposite wheel modes.

### F16 — Engine torque model is plausible in outline but uncalibrated

**References:** [engine.js](/workspace/VerletDrift/js/physics/engine.js:42), [engine.js](/workspace/VerletDrift/js/physics/engine.js:153), [constants.js](/workspace/VerletDrift/js/constants.js:105).

**Current behavior:** A parabola peaks at fixed 4,500 rpm; its width depends on idle/redline settings. Friction is 3.5% of peak torque plus 0.01·crank angular speed. Governor gain is 0.05 N·m per rpm error. There is no drivetrain efficiency, boost, fuel inventory, or calibrated torque map.

**Physical principle:** Combustion torque, throttle response, pumping losses, idle control, and drivetrain losses should be independently defined or measured.

**Assessment:** Simplified, potentially reasonable prototype; medium confidence on realism. Torque integration and redline fuel cut are real modeled relationships, but the coefficients are not validated against a target engine.

**Driver effect:** Changing redline also changes torque across the operating range. Changing peak torque changes friction and slipping-clutch capacity as well as acceleration.

**Improvement:** Choose a reference engine curve; separate torque shape, friction, clutch capacity, and governor settings. Derive power as torque×crank speed; calibrate acceleration only after tire and coupling corrections.

### F17 — Stall resistance, restart, and rev matching are assists

**References:** [engine.js](/workspace/VerletDrift/js/physics/engine.js:133), [engine.js](/workspace/VerletDrift/js/physics/engine.js:201), [engine.js](/workspace/VerletDrift/js/physics/engine.js:243).

**Current behavior:** Stall resistance lowers the stall threshold rather than supplying engine torque. Stalling is prevented by the detection rule when throttle is at least 5% or speed is at least 0.5 m/s. Disengaging the clutch and applying throttle can restart at idle immediately. Downshifts schedule automatic positive rev-match torque using total body speed.

**Physical principle:** Real stalling depends on crank dynamics and combustion viability; a starter supplies energy. Shaft-speed synchronization should use the actual driven axle speed, especially during drifting.

**Assessment:** Explicit arcade/driver-assistance behavior; high confidence.

**Driver effect:** A heavily loaded engine can avoid reported stalling under throttle; clutch/throttle can revive it instantly. A sideways slide can request an incorrect automatic rev-match RPM.

**Improvement:** Label automatic rev matching/restart as assists. Base rev matching on shaft speed; implement or explicitly approximate starter work and low-rpm torque instead of adjusting a stall threshold to imply resistance.

### F18 — Off/stalled engines have inconsistent connected-driveline behavior

**References:** [engine.js](/workspace/VerletDrift/js/physics/engine.js:94), [engine.js](/workspace/VerletDrift/js/physics/engine.js:133), [tires.js](/workspace/VerletDrift/js/physics/tires.js:145).

**Current behavior:** Engine-off clears lock and torque even if a gear and released clutch remain selected. Stalled operation can retain the lock flag set earlier while returning zero crank torque; synchronization then skips the stalled engine.

**Physical principle:** Switching combustion off does not mechanically disconnect the clutch or remove crank inertia/compression resistance.

**Assessment:** Contradictory state model; high confidence from paths. Consequence magnitude needs a complete connected-driveline test.

**Driver effect:** Engine braking can disappear on shutdown; a stalled engine is not consistently back-driven or bump-started.

**Improvement:** Separate combustion state from mechanical connection. Test coasting with engine running, off, stalled, clutch open, and clutch locked.

### Steering and chassis

### F19 — Mouse steering bypasses steering-column physics

**References:** [input.js](/workspace/VerletDrift/js/input.js:170), [input.js](/workspace/VerletDrift/js/input.js:181), [steering.js](/workspace/VerletDrift/js/physics/steering.js:56).

**Current behavior:** During dragging, front wheel angle is imposed directly. Inertia, aligning torque, viscous damping, and Coulomb friction influence released steering, not the driver-held angle. A new drag is anchored at the new mouse position without preserving the previous steering-angle offset.

**Physical principle:** A position controller is a legitimate input abstraction, but it should not be described as the same torque-driven steering system used when released.

**Assessment:** Hybrid input simplification; high confidence.

**Driver effect:** “Steering inertia” and damping may seem ineffective while steering actively, then dominate abruptly on release. Regrabbing can snap the requested angle toward center.

**Improvement:** Decide between angle-command and torque-command steering; document it. Preserve angle on regrab, optionally rate-limit driver commands, and calibrate released SAT response.

### F20 — Released steering combines several independent return mechanisms

**References:** [steering.js](/workspace/VerletDrift/js/physics/steering.js:83), [steering.js](/workspace/VerletDrift/js/physics/steering.js:100), [steering.js](/workspace/VerletDrift/js/physics/steering.js:110), [tires.js](/workspace/VerletDrift/js/physics/tires.js:464).

**Current behavior:** Tire lateral force times exponentially decaying trail supplies SAT; filtered SAT drives an effective column inertia. A fallback centering spring remains below 3 m/s, while viscous and conditionally applied Coulomb terms oppose motion. Preset steering damping is much lower than the 5.5 startup value.

**Physical principle:** Tire aligning moment, caster/mechanical trail, rack geometry, driver forces, and friction have distinct roles.

**Assessment:** Useful prototype but uncalibrated combination; high confidence in code, medium on realistic feel. The Coulomb application condition is a numerical heuristic, not a full static-friction solve.

**Driver effect:** Auto-centering/countersteering can depend strongly on release mode, tire filters, and chosen preset rather than a coherent steering geometry.

**Improvement:** Measure a step steer/release and drift countersteer response with each mechanism logged. Calibrate trail and effective steering inertia together; treat stationary centering as an explicit convenience if no physical caster model supports it.

### F21 — Chassis geometry and yaw inertia are simple approximations

**References:** [constants.js](/workspace/VerletDrift/js/constants.js:44), [main.js](/workspace/VerletDrift/js/main.js:810), [kinematics.js](/workspace/VerletDrift/js/physics/kinematics.js:96), [tires.js](/workspace/VerletDrift/js/physics/tires.js:171).

**Current behavior:** The center lies midway between axles; static load is 50/50. Yaw inertia uses a rectangular plate based on wheel half-length/half-width: about 1,156 kg·m² at 1,200 kg. Both front tires have the same steer angle. Constraint corrections split equally between four corner particles.

**Physical principle:** CoM location, axle distances, track, mass distribution, and yaw inertia determine turning and load transfer. Wheelbase dimensions alone do not identify body mass distribution.

**Assessment:** Simplified but reasonable baseline for one symmetric vehicle; high confidence. It cannot support claims of calibrated SUV/kart dynamics without more configuration.

**Driver effect:** Understeer/oversteer balance lacks realistic static axle distribution and Ackermann geometry; very tight turns are approximated.

**Improvement:** Expose a complete vehicle definition with axle distances/track and measured or independently specified yaw inertia. Ackermann and steering geometry are later refinements, not substitutes for fixing tire curves.

### F22 — Constraint correction adds substantial unmodeled yaw loss

**References:** [constraints.js](/workspace/VerletDrift/js/physics/constraints.js:42), [constraints.js](/workspace/VerletDrift/js/physics/constraints.js:69), [main.js](/workspace/VerletDrift/js/main.js:828), [integrator.js](/workspace/VerletDrift/js/physics/integrator.js:43).

**Current behavior:** Position corrections also shift previous positions by a configurable fraction, changing encoded velocity. Constraint damping has a hidden 0.05 minimum; constraints run twice per chassis tick.

**Physical principle:** A free rigid body without external torque should preserve angular momentum. Constraint enforcement should not serve as an unmeasured handling damper.

**Assessment:** Confirmed numerical yaw dissipation; high confidence. In a five-second, no-force/no-explicit-damping rotational probe at 100 Hz, 3 rad/s fell to 1.276 rad/s with browser-default damping=0.8/iterations=6. At damping=1/iterations=12 it fell essentially to zero.

**Driver effect:** Drift rotation and recovery depend on constraint settings even when the tire and intended damping parameters are unchanged.

**Improvement:** Add free-rotation, impulse, and energy tests. Consider a planar rigid-body state with exact pose reconstruction; alternatively develop a velocity-consistent constraint solve. Do not merely retune tire grip to compensate.

### F23 — Explicit yaw damping is an independent handling assist

**References:** [main.js](/workspace/VerletDrift/js/main.js:801), [constants.js](/workspace/VerletDrift/js/constants.js:89).

**Current behavior:** Torque = −yawDamping·I·yawRate, independent of tire state, vehicle speed, or contact. Default rate is 1/s; slider allows 0–5.

**Physical principle:** Tire forces already create physical yaw moments and damping. An additional constant yaw damper needs a defined source, or should be identified as an assist. Aerodynamic yaw damping is not established by simply calling this coefficient “aerodynamic-like.”

**Assessment:** Arcade/stability-assist mechanism unless calibrated as a specific physical loss; high confidence.

**Driver effect:** Rotation is suppressed alongside constraint yaw loss and tire response. Higher settings can mask oversteer or make handbrake rotation disappear.

**Improvement:** Log its removed power, τ·yawRate. Make an assist-free calibration configuration and compare its response with the assisted version. Setting it to zero alone will not remove the constraint loss in F22.

### Suspension, weight transfer, braking, and resistance

### F24 — Suspension has sound small-disturbance relationships

**References:** [suspension.js](/workspace/VerletDrift/js/physics/suspension.js:13), [suspension.js](/workspace/VerletDrift/js/physics/suspension.js:64), [tire-load.js](/workspace/VerletDrift/js/physics/tire-load.js:3), [tests/suspension.test.js](/workspace/VerletDrift/tests/suspension.test.js:22).

**Current behavior:** A sprung body integrates heave/pitch/roll on internal steps no larger than 1 ms. Spring/damper/bar forces produce loads, including algebraic unsprung/geometric transfer. Loads can fall to zero and are not renormalized to weight during heave. Tire grip responds sublinearly to load.

**Physical principle:** Springs/dampers govern transient body motion and distribution of transfer. Equilibrium total transfer is set by acceleration, geometry, and CoM; uneven loading reduces combined grip for load-sensitive tires.

**Assessment:** Physically motivated flat-road small-angle approximation; high confidence for the tested regime.

**Driver effect:** Damping changes transition behavior; front/rear roll stiffness changes load distribution and turning. More visible/body roll should not automatically mean more total equilibrium transfer or grip.

**Improvement:** Preserve these validated relationships. Calibrate frequencies, damping ratios, roll gradient, axle transfer distribution, and tires together using a defined reference vehicle.

### F25 — Suspension is not a full four-wheel vertical/contact model

**References:** [suspension.js](/workspace/VerletDrift/js/physics/suspension.js:20), [suspension.js](/workspace/VerletDrift/js/physics/suspension.js:26), [suspension.js](/workspace/VerletDrift/js/physics/suspension.js:75), [state.js](/workspace/VerletDrift/js/state.js:444).

**Current behavior:** Road height is fixed; unsprung masses have no integrated vertical degrees of freedom or tire stiffness. Pitch/roll inertia uses a hard-coded 0.25 m dimension. Springs are preloaded to equal quarter sprung weight regardless of rate. Normal force is clipped; contact is inferred from force. Bump/droop use linearized displacement and added stop stiffness.

**Physical principle:** Wheel travel limits, unilateral road contact, unsprung dynamics, and large-angle rollover need geometry and vertical state beyond this reduced model.

**Assessment:** Intentional simplification with a limited validity range; high confidence in limitations, medium on errors near lift-off/high CoG without broader validation.

**Driver effect:** Wheel hop, terrain response, true wheel lift trajectories, and rollover cannot emerge faithfully. Slider extremes can exceed small-angle assumptions while remaining numerically finite.

**Improvement:** State the validity range and warn when exceeded. Validate the current flat-road model first; add unsprung/tire vertical dynamics only for an explicit road-contact requirement.

### F26 — Instant transfer preserves load but approximates combined wheel lift

**References:** [weight.js](/workspace/VerletDrift/js/physics/weight.js:43), [weight.js](/workspace/VerletDrift/js/physics/weight.js:63), [suspension.js](/workspace/VerletDrift/js/physics/suspension.js:53).

**Current behavior:** Suspension-disabled transfer conserves total weight and shifts it with the correct sign. Lateral transfer is shared equally and capped by the lighter axle. Both models clamp input acceleration to ±2g.

**Physical principle:** Normal-load equilibrium should preserve force and moment balance; contact changes can require a more complete support calculation.

**Assessment:** Reasonable algebraic comparison model before lift-off, simplified at combined extremes; high confidence. It is a substitute for dynamic suspension, not an extra transfer system simultaneously applied on top.

**Driver effect:** Turning suspension off changes the model’s transient response, and its limiting behavior near unloading differs from the dynamic version.

**Improvement:** Keep separate comparison baselines. Measure moment residuals at combined acceleration; log acceleration clipping rather than hiding it.

### F27 — Brake torque is sound, but service and handbrake tuning are coupled

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:67), [main.js](/workspace/VerletDrift/js/main.js:763), [wheel.js](/workspace/VerletDrift/js/physics/wheel.js:17), [tests/e2e/handbrake-drift.spec.js](/workspace/VerletDrift/tests/e2e/handbrake-drift.spec.js:45).

**Current behavior:** Service braking supplies 80% front/20% rear nominal rim force converted to rotor torque. The handbrake uses the same brakeForce parameter, adding half its value per rear wheel. Engagement ramps over 0.25 s. The release value decays over 0.15 s, but brake capacity is gated by the held key, so actual release is immediate.

**Physical principle:** Brakes oppose rotor motion; road grip determines resulting chassis force. Axle bias and parking-brake torque are separate physical properties.

**Assessment:** Correct torque mechanism with simplified controls/bias; high confidence. The existing browser test confirms more sideslip and less speed under handbrake in one maneuver, not a calibrated drifting response.

**Driver effect:** Changing service-brake strength also changes handbrake behavior. Binary braking and fixed bias can lock wheels; there is no ABS. A locked wheel should not create an independent magic yaw force.

**Improvement:** Separate brake torque capacities/bias and handbrake controls. Calibrate stopping distance, wheel lock sequence, and transient sideslip at several speeds and steering angles.

### F28 — Drag is plausible away from rest; rest behavior is patched by sleep

**References:** [tires.js](/workspace/VerletDrift/js/physics/tires.js:500), [engine.js](/workspace/VerletDrift/js/physics/engine.js:306).

**Current behavior:** Drag is Crr·mg plus k·speed², opposing total velocity. Rolling resistance is applied at body level, including lateral motion and regardless of individual contact. Above 0.001 m/s, its finite force can reverse an almost stopped velocity in a tick. Sleep then zeros particle history below 0.02 m/s and 0.02 rad/s when throttle/brake/mouse-throttle conditions allow.

**Physical principle:** Aerodynamic drag opposes air-relative motion; rolling resistance depends on rolling contacts. Dissipation should not propel the vehicle through zero velocity.

**Assessment:** Reasonable high-speed lumped drag, nonphysical near-zero integration patched by a convenience rule; high confidence. Isolated drag at Crr=0.03 changed longitudinal velocity from −0.0011 to +0.001843 m/s in 0.01 s. This probe excludes sleep; it does not prove ordinary full-loop coasting visibly reverses.

**Driver effect:** Rest behavior depends on input flags and sleep. Holding a brake excludes the sleep rule; engine creep and low-speed tire fade also interact with settling.

**Improvement:** Use a dissipative impulse/static treatment through zero speed; model rolling resistance at the intended contact/axle level. Keep sleep as an optimization with consistent cached-state updates, rather than a substitute for passive low-speed mechanics.

### Timing, gameplay, and diagnostics

### F29 — Live timestep changes do not preserve encoded velocity

**References:** [main.js](/workspace/VerletDrift/js/main.js:652), [main.js](/workspace/VerletDrift/js/main.js:672), [integrator.js](/workspace/VerletDrift/js/physics/integrator.js:43), [kinematics.js](/workspace/VerletDrift/js/physics/kinematics.js:113).

**Current behavior:** The next tick uses the new dt but the same current−previous position gap. No prior timestep or history rescaling is used. Camera history has the same dependency.

**Physical principle:** Changing time resolution or playback speed should not create a velocity/energy impulse.

**Assessment:** Confirmed numerical correctness problem; high confidence. Changing dt 0.01→0.005 in a force-free 10 m/s coast produced 20 m/s. A legal timeScale change from 1 to 0.5 can cause this same dt change.

**Driver effect:** Moving timing sliders can make the car suddenly speed up or slow down; energy can jump without engine work.

**Improvement:** Keep a fixed simulated physics dt with scheduling separate from playback rate, or implement a verified variable-step Verlet scheme/history rescaling for all affected state.

### F30 — “Anti-tunnelling” is a timestep-dependent velocity limiter

**References:** [constants.js](/workspace/VerletDrift/js/constants.js:84), [constraints.js](/workspace/VerletDrift/js/physics/constraints.js:187), [main.js](/workspace/VerletDrift/js/main.js:831).

**Current behavior:** A fixed 0.72 m displacement threshold modifies previous positions after the new positions are already calculated. It limits stored per-particle velocity to 0.72/dt; it does not sweep the traveled path for collisions.

**Physical principle:** Collision detection should account for traveled geometry. A speed limit is not an anti-tunnelling contact solution.

**Assessment:** Arcade/numerical limiter mislabeled as collision protection; high confidence.

**Driver effect:** At timeScale=1, the threshold corresponds to approximately 77.8 km/h at 30 Hz and 259.2 km/h at 100 Hz, before accounting for corner rotation. At 100 Hz/timeScale=3 it is about 86.4 km/h. Chassis performance therefore depends on a solver setting.

**Improvement:** Add swept boundary/contact handling; log any emergency limiter intervention. Do not silently enforce normal driving speed through a timestep-dependent displacement threshold.

### F31 — Dropped ticks reduce elapsed simulated driving time

**References:** [main.js](/workspace/VerletDrift/js/main.js:636), [main.js](/workspace/VerletDrift/js/main.js:661), [main.js](/workspace/VerletDrift/js/main.js:682), [main.js](/workspace/VerletDrift/js/main.js:704).

**Current behavior:** Long frame time is capped at 250 ms; backlog beyond maxSubstepsPerFrame is discarded. This drops simulated time, not a set of already-computed forces. Effects, audio, and gameplay also run in physics ticks. The measured TPS EMA only updates on frames with ticks, biasing it high when many render frames contain zero ticks.

**Physical principle:** Fixed-step integration should remain reproducible in simulated time; wall-time performance and numerical accuracy should be distinguished.

**Assessment:** Reasonable overload policy, with performance-dependent real-time behavior and misleading TPS telemetry; high confidence.

**Driver effect:** More expensive visual settings can slow driving relative to real seconds by causing dropped ticks. Telemetry can show roughly display FPS as “TPS” even when configured physics is 100 Hz.

**Improvement:** Measure actual tick counts over all frames in a time window; benchmark effect-heavy scenes; move suitable presentation work out of the mechanical step. Define and display the overload policy clearly.

### F32 — Balloon gameplay directly changes vehicle velocity

**References:** [balloon.js](/workspace/VerletDrift/js/balloon.js:206), [main.js](/workspace/VerletDrift/js/main.js:879), [random.js](/workspace/VerletDrift/js/random.js:20), [renderer/sparks.js](/workspace/VerletDrift/js/renderer/sparks.js:100).

**Current behavior:** Balloon pops add a radial velocity change up to 1.5 m/s and shift all particle histories. There is no modeled balloon mass, opposite impulse, angular contact response, or work account. Mechanical cached velocity changes after its normal derivation, while speed and acceleration are not immediately recomputed. Random balloon spawning and visual effects share one seeded stream.

**Physical principle:** An impact response should follow mass/contact momentum and energy constraints, or be identified as a gameplay effect.

**Assessment:** Confirmed arcade force and coupling; high confidence. Whether a particular balloon increases or reduces kinetic energy depends on impact geometry; it is not guaranteed passive.

**Driver effect:** Balloons can disturb drifts and coastdowns independently of tire physics. Changing effect settings can change random consumption and later balloon placements, indirectly changing future physical bumps. Scoring itself does not feed engine or tire forces.

**Improvement:** Exclude balloons for realism validation. Offer a physical-effect-free gameplay mode or model appropriate impact mechanics. Use separate random streams for gameplay and effects.

### F33 — Grip-state display semantics are inconsistent

**References:** [index.html](/workspace/VerletDrift/index.html:984), [tires.js](/workspace/VerletDrift/js/physics/tires.js:334), [tires.js](/workspace/VerletDrift/js/physics/tires.js:354), [renderer/world.js](/workspace/VerletDrift/js/renderer/world.js:354).

**Current behavior:** Browser defaults trigger slipping above utilization 0.70 and recover below 0.85. At a steady utilization between these values the state alternates each tick. smoothedGrip is updated toward utilization, but the wheel renderer treats it as remaining grip and heats the tire when it is low. Its EMA factors and drift-intensity EMA are fixed per tick rather than time-based.

**Physical principle:** Utilization, remaining force capacity, actual sliding, and tire temperature are distinct quantities; hysteresis must have correctly ordered thresholds.

**Assessment:** Confirmed diagnostic/presentation contradiction; high confidence. These values do not directly scale the contact force.

**Driver effect:** Tires can look “hot” at low demand and cooler at high utilization; grip events can alternate. This misleads the driver about the car even though it does not directly cause lost grip.

**Improvement:** Rename utilization fields, correct threshold ordering, and base sliding/heat displays on measured slip and dissipated work. Use time-based smoothing for presentation.

### F34 — Energy readout is a scoped kinetic estimate, with a misleading component label

**References:** [ui.js](/workspace/VerletDrift/js/ui.js:774), [index.html](/workspace/VerletDrift/index.html:136).

**Current behavior:** The panel sums translational kinetic energy, rectangle-model yaw kinetic energy, and bare wheel-spin energy. “Forward” includes both world velocity components, so it includes sideways drift. Engine rotation, suspension motion/spring energy, heat, fuel, and numerical losses are absent.

**Physical principle:** Stored energy and rates of work must be accounted consistently before making conservation claims.

**Assessment:** Correct formulas for the specified planar components, incomplete energy scope; high confidence. The comment that engine inertia is omitted “to avoid counting twice” is misleading here: the wheel term uses bare wheel inertia, so adding crank energy separately would not double-count that term.

**Driver effect:** The panel can expose unusual wheel-spin energy, but total motion energy need not track engine input or dissipative losses. A sideways moving vehicle can show substantial “Forward” energy.

**Improvement:** Rename it “Translation”; retain the estimate label. Add crank/suspension terms only with consistent coupled states, then an energy ledger for engine work, braking, contact slip, drag, assists, numerical corrections, and gameplay impulses.

### F35 — Some controls and diagnostic assumptions are inactive or stale

**References:** [ui.js](/workspace/VerletDrift/js/ui.js:341), [sound.js](/workspace/VerletDrift/js/sound.js:374), [renderer/debug.js](/workspace/VerletDrift/js/renderer/debug.js:66), [main.js](/workspace/VerletDrift/js/main.js:1138), [constants.js](/workspace/VerletDrift/js/constants.js:47).

**Current behavior:** Turbo controls are stored but have no active synthesizer or mechanical implementation. decalMinRadius, decalMaxRadius, and decalEdgeSoftness have no active consumers beyond state/UI. Several exported constants are unused or import-only. Some geometry comments still give old dimensions; the tachometer marks 6,500 rpm independently of the configured limiter. Debug tire-force drawing interprets stored world fx/fy as local longitudinal/lateral components.

**Physical principle:** Controls and observability should describe the actual model.

**Assessment:** Confirmed inactive controls/documentation and visualization inconsistency; high confidence. Audio-only cylinder count does not alter engine torque or inertia, and “turbo” is not boost physics.

**Driver effect:** Changing some controls does nothing, while gauges can suggest limits or force directions that do not match the model.

**Improvement:** Remove/mark inactive settings, correct diagnostic coordinate transforms, use configured thresholds, and document the live source of each parameter. Do not interpret extra sound/visual controls as more detailed mechanical realism.

## Cross-system interactions and realism conflicts

| Interaction | Established effect | Implication |
|---|---|---|
| Tire raw peak × friction cap × B/C/peak sliders | Oversized raw forces are clipped, masking the peak mismatch. | Grip tuning can conceal a wrong curve rather than calibrate it. Fix F07–F08 first. |
| Constraint correction × yaw damping × tire yaw moments | Constraint probes already lose rotation; explicit damping adds a separate torque. | A drift that dies quickly may have several causes. Log each yaw-moment/loss source. |
| Velocity smoothing × force relaxation × SAT smoothing × released column dynamics | Several delays lie in the steering feedback path. | Adding damping to stabilize one layer may hide lag or instability in another. |
| Clutch capacity × peak engine torque × reflected engine inertia | Peak torque controls combustion, friction, and clutch capacity; inertia switches at the lock threshold. | Engine tuning also changes engagement and asymmetrical rear-wheel response. |
| Suspension transfer × tire load sensitivity × saturation × fixed brake bias | Load distribution affects tire limits and which wheels saturate/lock. | Suspension tuning should be assessed with the same calibrated tires and brake system. |
| Low-speed tire fade × finite rolling resistance × sleep × idle governor | Different systems supply/remove motion around rest. | Stable stopping alone does not establish a correct low-speed force balance. |
| Frequency/timeScale × position history × displacement limit | Timing changes can jump velocity and change the effective speed ceiling. | Solver settings currently alter physical behavior in more than accuracy alone. |
| Visual workload × capped backlog | Effects can cause discarded simulation time. | Compare maneuvers by simulated time and report dropped ticks. |
| Visual RNG × balloon spawning × balloon bumps | One stream couples effects to future gameplay contacts. | Disable gameplay contacts or isolate streams during reproducibility studies. |
| Utilization × “grip” labels × color and effect thresholds | High demand can be confused with remaining grip or actual slipping. | Driver impressions and screenshots can be misleading even if force equations are unchanged. |

The suspension-enabled and disabled load models are selected alternatives; the active step does not add both. Likewise, the legacy computeBrakeForce function is not currently added to tire braking: main uses a zero external brake-force placeholder. These suspected double-counting paths were checked and are not current findings. See [main.js](/workspace/VerletDrift/js/main.js:794).

## Arcade-oriented behavior and missing realism

Confirmed force-affecting arcade/numerical behaviors are the independent yaw damper, constraint yaw loss, timestep-dependent displacement limiter, unphysical balloon velocity bumps, assisted stall/restart rules, automatic rev matching, low-speed grip fade, and instantaneous imposed steering commands. Some are useful interface or stability choices, but should be named and measurable.

Presentation features—blur, sparks, paint, sound, arrow trails, camera shake, and scoring—do not normally contribute tire or engine force. They can alter perception, processing cost, and the shared randomness path. A realistic core can coexist with stylized presentation.

Missing features include calibrated front/rear tire differences, configurable static axle distribution and yaw inertia, a coupled differential/LSD, realistic clutch lock events, contact-aware low-speed holding, brake pressure/bias calibration, and an energy/work budget. Tire temperature/wear, camber/toe/compliance, road height, unsprung wheel dynamics, aerodynamic downforce, ABS/traction control, starter/fuel/thermal systems, and damage are optional expansions. Their absence does not automatically make a flat-road planar simulator invalid; their priority depends on intended maneuvers.

There is no measured target vehicle or tire dataset in the inspected mechanics/tests that establishes how realistic the base calibration is. The report therefore does not declare every sports-car parameter “wrong” merely because it is simplified, or promise that an uncalibrated additional subsystem will improve feel.

## Test coverage and gaps

**Executed for this audit:** 11 unit files, 129 tests passed; five browser files, 22 tests passed. Browser tests used system Chromium through a temporary configuration. Temporary test output stayed under /tmp. The initial attempt to use a second Playwright installation failed during discovery; the repository's own runner was then used successfully. No existing tests were altered or disabled.

| Suite | What it establishes | What it does not establish |
|---|---|---|
| [wheel-solver.test.js](/workspace/VerletDrift/tests/wheel-solver.test.js:9), 7 tests | Free rotor torque integration, passive brake stop, matching impulse, smooth linear-contact accuracy. | Root selection for the nonmonotone production curve, all parameter extremes, 2D slip-energy balance. |
| [wheels.test.js](/workspace/VerletDrift/tests/wheels.test.js:47), 13 tests | Persistent inertia, airborne brakes, handbrake holding, one longitudinal energy exchange, timestep refinement under imposed drive torque. | Actual engine/clutch locking, differential modes, lateral/yaw energy, browser startup defaults. Its chassis helper sets angular acceleration to zero. |
| [engine-inertia.test.js](/workspace/VerletDrift/tests/engine-inertia.test.js:31), 6 tests | Free revs, slipping load, one stall condition, synchronization formula, disengaged shift/rev-match classification. | Momentum/work at lock, clutch heat, running/off/stalled connection equivalence, shifting during sideslip. |
| [wheel-omega-audit.test.js](/workspace/VerletDrift/tests/wheel-omega-audit.test.js:23), 23 tests | Neutral idle, unloaded limiter in all gears/two redlines, imposed over-rev, closed-throttle friction, brake stop, no arbitrary omega cap. | Loaded acceleration/cornering across differential states; many cases intentionally set road loads to zero. |
| [weight-transfer.test.js](/workspace/VerletDrift/tests/weight-transfer.test.js:29), 5 tests | Static split, signs, total load, nonnegative algebraic loads. | Full moment balance under clipped combined transfer, front/rear CoM variation, transient suspension. |
| [suspension.test.js](/workspace/VerletDrift/tests/suspension.test.js:22), 13 tests | Small-disturbance equilibrium/transfer, damper transients, bar distribution, heave load relation, recontact, refinement, passive small roll. | Real road data, full lift-off contact geometry, combined large-angle energy, unsprung wheel hop. |
| [suspension-handling.test.js](/workspace/VerletDrift/tests/suspension-handling.test.js:5), 7 tests | Bounded coupled maneuvers, directional bar effect, selected refined-tick agreement. | Calibrated handling, actual engine/control/scheduler step. [compare-suspension.mjs](/workspace/VerletDrift/scripts/compare-suspension.mjs:33) imposes steering/torque and uses one constraint pass rather than the full runtime path. |
| [tire-unloading.test.js](/workspace/VerletDrift/tests/tire-unloading.test.js:36), 5 tests | Selected carried-force limits, immediate zero-load force removal, recontact relaxation, one locked-sliding case. | General transition force bound: supplementary F09 probe exposes a missing case. |
| Events/faults/logger, 50 unit tests | Diagnostic infrastructure, fault independence, buffering and logging. | Physical accuracy or calibrated vehicle response. |
| [wheel-braking.spec.js](/workspace/VerletDrift/tests/e2e/wheel-braking.spec.js:3), 4 browser tests | Loaded launch/brake, backward braking energy trend, shifting/reverse direction, limiter/braking integration. | Quantified real stopping distance, complete energy budget, curves at parameter extremes. |
| [handbrake-drift.spec.js](/workspace/VerletDrift/tests/e2e/handbrake-drift.spec.js:45), 1 browser test | At 18 m/s, imposed steering and handbrake increase sideslip over a coasting comparison and reduce speed. | Realistic drift initiation/recovery across speeds, steering histories, friction, and clutch use. |
| [suspension.spec.js](/workspace/VerletDrift/tests/e2e/suspension.spec.js:3), 1 browser test | Controls affect state; suspension toggles and export/import round trip. | Preset validity, engine toggle, all slider relationships, physically coherent imported configurations. |
| Console/fault browser suites, 16 tests | Observable behavior and selected injected faults in the running app. | Driving realism. |

Essential missing validation cases:

- Config/schema and every control's displayed/applied value; real startup defaults; preset sequence independence.
- Constant-speed straight roll and **free yaw** with no force, at several dt values and solver settings.
- Changing timeScale/Hz while moving, with momentum/energy continuity.
- Raw and applied tire force curves versus slip, B/C domain, peak semantics, load, and combined slip.
- Passive coastdown and static holding through zero speed, forward/backward.
- Vector force bounds during force reversal, load change, brake/steer transitions.
- Clutch synchronization angular momentum, lock/unlock work, heat, off/stalled back-driving.
- Equal and opposite rear-wheel speed modes, one-wheel lift, split friction.
- Step steer, steady circle, slalom, brake-in-turn, handbrake entry/recovery with fixed simulated-time inputs.
- Contact-free and collision energy/momentum accounting, including any gameplay impulses.
- Effect-heavy frame load, actual tick counters, deterministic repeatability with presentation toggles.

Analytical conservation and dimensional tests can reveal correctness without a real-car dataset. Tire/handling realism still needs measured curves and maneuver benchmarks; agreement between two runs of the same flawed formula is not external validation.

## Prioritized recommendations

### High-impact correctness fixes

| Priority | Task | Depends on | Acceptance evidence |
|---|---|---|---|
| 1 | Canonical parameter schema/defaults; repair preset keys, toggle binding, displayed/applied mismatch, ranges and relationship validation. | None. | Control/preset round-trip tests; all legal settings and complete vehicle baselines defined. |
| 2 | Preserve motion through timing changes; measure actual ticks and limiter interventions. | Canonical timing config. | No-force velocity/yaw/energy continuity when Hz/timeScale change. |
| 3 | Correct tire peak/amplitude semantics and the legal C domain. | Schema/defaults and tire-curve plots. | Calibrated peak location, passive sign, continuous response across supported values. |
| 4 | Correct combined force integration while preserving wheel/body impulse matching. | Explicit tire targets/limits. | Vector bound and torque balance over transition, loading, braking, and refinement sweeps. |
| 5 | Couple crank, clutch, differential, and rear rotors consistently. | Correct impulse instrumentation. | Angular-momentum/energy tests at lock and equal/opposite axle modes; coherent engine-off/stalled behavior. |
| 6 | Remove or explicitly account for constraint yaw loss; separate assist torque. | Free-body harness and energy telemetry. | Free rotation retains expected momentum; assistance has named, measured work. |
| 7 | Separate gameplay impulses and repair grip/force/gauge diagnostics. | Defined mechanical versus gameplay paths. | Repeatable maneuvers without contacts; truthful slip/utilization displays. |

This is sequencing guidance, not permission to implement changes during this audit.

### Model improvements that need calibration

- Choose one reference car and surface; specify mass, axle distribution, wheelbase/track, yaw inertia, engine torque curve, gearing, wheel radius/inertia, brake capacities, and tire curves.
- Calibrate small-slip cornering/longitudinal stiffness, peak slip, post-peak/combined-slip behavior, load sensitivity, and relaxation using compatible data.
- Calibrate released steering response, aligning torque/trail, steering ratio/inertia, and driver-command handling.
- Calibrate suspension natural frequencies, damping, roll gradient, roll-center geometry, and front/rear transfer distribution.
- Calibrate drag/coastdown and low-speed friction with a passive stopping treatment.
- Define clutch torque capacity and governor behavior independently of peak engine torque.

### Optional realism features

After the correctness and calibration work: configurable differential/LSD, Ackermann/caster/camber effects, analog brake pressure, optional ABS/traction-control assists, road-height and unsprung/tire vertical dynamics, tire heat/wear, aero downforce, explicit starter/fuel/thermal systems, and appropriate vehicle impacts/damage.

Choose features because they affect a target maneuver or measurement. An expanded feature list alone does not establish more realistic driving.

### Changes that should wait for measurements or validation

- Retuning friction/steering/yaw damping until drifting “feels right” while F07–F09 and F22 remain.
- Copying arbitrary suspension rates or tire coefficients from unrelated vehicle categories.
- Treating the current energy panel as a conserved total or adding an “energetic” score that changes forces.
- Adding a hard wheel-speed cap or direct handbrake yaw kick to conceal drivetrain/tire problems.
- Declaring a preset realistic from its name, sound, or passing finite-state tests.
- Replacing all models simultaneously; that would make cause/effect and regression assessment difficult.

## Staged roadmap

1. **Establish reproducible configuration and observation.** Freeze a complete base-car definition, reconcile HTML/test defaults, repair inactive/control paths, create replayable inputs in simulated time, and log actual parameters/ticks. Validate all control bindings and preset state transitions.

2. **Establish numerical invariants.** Test free translation/yaw, impulses, timestep changes, low-speed passivity, and correction work. Separate simulation scheduling from dt and identify the displacement limiter. Decide whether to use a direct planar rigid-body state or a validated constraint method.

3. **Repair and calibrate contact mechanics.** Plot tire curves, define parameter meanings and domains, unify combined-force integration, and preserve rotor contact impulse balance. Validate rolling, braking, slide reversals, unloading/recontact, and timestep convergence.

4. **Repair drivetrain coupling.** Add finite clutch capacity, a defined lock impulse, crank/differential coupling, consistent off/stall behavior, and optional labeled rev-match assistance. Validate shaft energy/momentum and asymmetrical rear-wheel cases.

5. **Calibrate vehicle handling.** With consistent tires and numerics, tune steering and suspension against step steer, constant-radius, slalom, brake-in-turn, and drift-entry/recovery measurements. Test assist-free behavior before adding optional stabilization.

6. **Expand the energy ledger.** Track supported stored energies and per-step work/losses, including numerical/gameplay interventions. Compare change in stored energy with integrated work and show a residual. Treat deforming-tire energy carefully; do not infer conservation from force signs alone.

7. **Add realism features with a measurement target.** Introduce one subsystem at a time and rerun the established maneuvers. Preserve a documented simpler model for comparison.

## Supplementary evidence

The audit used real source modules for mechanics probes and real Chromium for UI checks. DOM wiring was also inspected with a lightweight stub; the decisive preset/toggle/slider observations were independently confirmed in the browser.

| Probe | Result | Interpretation |
|---|---|---|
| Tire expression at B=10, C=1.9 | Raw peak factor 2.94498; angle peak 0.86903°; ratio peak 0.013035 | Peak labels and amplitude normalization conflict. |
| C=2.15 / 2.5 / 3 at B=10 | Negative normalizer; raw tire function returns zero | Legal range includes disabled lateral response. |
| Force-free dt 0.01→0.005 | Speed 10→20 m/s | Stored displacement not rescaled. |
| Free yaw, 100 Hz, damping 0.8, 6 iterations | 3→1.27618 rad/s in 5 s | Browser-default constraints alone dissipate rotation. |
| Free yaw, damping 1, 12 iterations | 3→0.00000223 rad/s in 5 s | “Constraint damping” strongly controls motion. |
| Clutch fully released with bitePoint 0.85/range 0.5/curve 2.5 | Engagement 0.049295 | Legal controls can prevent lock. |
| 486 valid carried-force transition cases | Maximum force/limit 1.035322 | Endpoint lateral and averaged longitudinal forces can exceed the cap. |
| Engine button in browser | Running true before and after click | Two handlers negate each other. |
| SUV/kart in browser | Actual mass remains 1,200 kg | Wrong preset property is inactive. |
| Physics slider at 200 | Actual/label 120; element 200 | Hidden clamp and display mismatch. |
| Kart/ice friction in browser | Actual 2.1/0.28; slider 2/0.3 | Programmatic assignments exceed range without state reconciliation. |
| Energy panel in browser | Present, four 0.00 kJ values at rest, no page errors | UI presence verified; physical completeness is separate. |

Probe scripts/results and the control inventory are available beside this report under /tmp. They are audit artifacts, not repository changes or proposed tests.


## Appendix A — Every user-facing slider and checkbox

This inventory covers the actual simulation page, index.html. Separate sound-editing pages are outside the driving controls, but sound settings on this page are included. “Default” is the HTML startup value; transformed values are stated explicitly. Cosmetic settings have no direct engine/tire-force path; processing load or shared RNG can still affect timing/gameplay as described above. Every row was checked for its binding and source references. Dynamic key lookups for suspension were inspected manually.


### Display

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [canvasResolutionSlider](/workspace/VerletDrift/index.html:73) | 1.0; 0.5–2.0 (step 0.1) | [direct DOM](/workspace/VerletDrift/js/main.js:305); [js/main.js:948](/workspace/VerletDrift/js/main.js:948) | Canvas resolution only; drawing cost can cause dropped ticks. |
| [gpuResolutionScale](/workspace/VerletDrift/index.html:78) | 1.0; 0.25–2.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:374); [js/main.js:979](/workspace/VerletDrift/js/main.js:979) | Presentation/effect only; no direct engine/tire-force feedback. |

### ⚡ Simulation

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [simulationFps](/workspace/VerletDrift/index.html:159) | 100; 30–200 (step 10) | [bind](/workspace/VerletDrift/js/ui.js:204); [js/main.js:652](/workspace/VerletDrift/js/main.js:652) | Scheduling: Snapped to tens, internally limited to 10–120; F06/F29. |
| [timeScale](/workspace/VerletDrift/index.html:164) | 1.0; 0.1–3.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:212); [js/main.js:672](/workspace/VerletDrift/js/main.js:672) | Scheduling: Multiplies dt; does not only change scheduling; F29/F30. |
| [maxSubstepsPerFrame](/workspace/VerletDrift/index.html:169) | 6; 1–12 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:211); [js/main.js:661](/workspace/VerletDrift/js/main.js:661) | Scheduling: Integer tick cap; overload discards simulated time; F31. |

### Suspension

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [suspensionEnabled](/workspace/VerletDrift/index.html:178) | on | [bindCheckbox](/workspace/VerletDrift/js/ui.js:310); [js/physics/suspension.js:52](/workspace/VerletDrift/js/physics/suspension.js:52) | Loads: Chooses dynamic suspension or instant transfer; F24–F26. |
| [springRateFront](/workspace/VerletDrift/index.html:183) | 35000; 15000–80000 (step 1000) | [bind](/workspace/VerletDrift/js/ui.js:226); [js/physics/suspension.js:67](/workspace/VerletDrift/js/physics/suspension.js:67) | Loads: Wheel rate, min 1,000 N/m internally; dynamic keyed lookup. |
| [springRateRear](/workspace/VerletDrift/index.html:188) | 35000; 15000–80000 (step 1000) | [bind](/workspace/VerletDrift/js/ui.js:226); [js/physics/suspension.js:67](/workspace/VerletDrift/js/physics/suspension.js:67) | Loads: Same as front rate; fixed quarter-weight preload. |
| [damperRateFront](/workspace/VerletDrift/index.html:193) | 2500; 500–5000 (step 100) | [bind](/workspace/VerletDrift/js/ui.js:226); [js/physics/suspension.js:68](/workspace/VerletDrift/js/physics/suspension.js:68) | Loads: Wheel damping, nonnegative internally; transient effect. |
| [damperRateRear](/workspace/VerletDrift/index.html:198) | 2500; 500–5000 (step 100) | [bind](/workspace/VerletDrift/js/ui.js:226); [js/physics/suspension.js:68](/workspace/VerletDrift/js/physics/suspension.js:68) | Loads: Same as front damping. |
| [antiRollStiffnessFront](/workspace/VerletDrift/index.html:203) | 12000; 0–40000 (step 1000) | [bind](/workspace/VerletDrift/js/ui.js:226); [js/physics/suspension.js:69](/workspace/VerletDrift/js/physics/suspension.js:69) | Loads: Axle torque/radian, nonnegative; shifts front transfer. |
| [antiRollStiffnessRear](/workspace/VerletDrift/index.html:208) | 8000; 0–40000 (step 1000) | [bind](/workspace/VerletDrift/js/ui.js:226); [js/physics/suspension.js:69](/workspace/VerletDrift/js/physics/suspension.js:69) | Loads: Same as front bar; shifts rear transfer. |
| [tireLoadSensitivity](/workspace/VerletDrift/index.html:213) | 0.12; 0–0.3 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:228); [js/physics/tire-load.js:5](/workspace/VerletDrift/js/physics/tire-load.js:5) | Contact: Exponent parameter clamped to 0–0.3; load-factor bounded 0.5–1.5. |

### 🏎️ Car Physics

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [carMassKg](/workspace/VerletDrift/index.html:224) | 1200; 600–3000 (step 50) | [bind](/workspace/VerletDrift/js/ui.js:215); [js/main.js:810](/workspace/VerletDrift/js/main.js:810) | Chassis: Active mass; NOT preset property mass. Suspension separately floors at 100 kg. |
| [rollingResistanceCoeff](/workspace/VerletDrift/index.html:230) | 0.012; 0.001–0.03 (step 0.001) | [bind](/workspace/VerletDrift/js/ui.js:216); [js/physics/tires.js:505](/workspace/VerletDrift/js/physics/tires.js:505) | Resistance: Crr·m·g at body level; F28. |
| [aeroDragCoeff](/workspace/VerletDrift/index.html:236) | 0.4; 0.1–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:217); [js/physics/tires.js:506](/workspace/VerletDrift/js/physics/tires.js:506) | Resistance: Dimensional force coefficient k in N·s²/m², not dimensionless Cd. |
| [tireFrictionCoeff](/workspace/VerletDrift/index.html:241) | 1.0; 0.3–2.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:218); [js/physics/tires.js:157](/workspace/VerletDrift/js/physics/tires.js:157) | Contact: Nominal grip amplitude with load sensitivity; presets can exceed UI bounds. |
| [tireSlidingFrictionRatio](/workspace/VerletDrift/index.html:246) | 0.85; 0.5–1.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:229); [js/physics/tires.js:250](/workspace/VerletDrift/js/physics/tires.js:250) | Contact: Longitudinal post-threshold floor, clamped to 0–1; F10. |
| [cogHeight](/workspace/VerletDrift/index.html:252) | 0.5; 0.1–2.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:219); [js/physics/suspension.js:20](/workspace/VerletDrift/js/physics/suspension.js:20) | Loads: Total-vehicle height; converted to sprung height; fixed 50/50 planar CoM. |
| [bounciness](/workspace/VerletDrift/index.html:257) | 0.3; 0.0–1.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:220); [js/physics/constraints.js:146](/workspace/VerletDrift/js/physics/constraints.js:146) | Collision: Boundary normal-velocity restitution; UI startup overrides constant 0.5 to 0.3. |
| [stallResistance](/workspace/VerletDrift/index.html:263) | 0.5; 0.0–1.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:221); [js/physics/engine.js:201](/workspace/VerletDrift/js/physics/engine.js:201) | Engine assist: Lowers detection threshold, does not increase engine torque; startup 0.5. |
| [yawDamping](/workspace/VerletDrift/index.html:269) | 1.0; 0.0–5.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:222); [js/main.js:813](/workspace/VerletDrift/js/main.js:813) | Handling assist: Unconditional −I·rate·yaw torque; F23. |
| [showKinematicArrows](/workspace/VerletDrift/index.html:280) | on | [bindCheckbox](/workspace/VerletDrift/js/ui.js:311); [js/main.js:1017](/workspace/VerletDrift/js/main.js:1017) | Presentation/effect only; no direct engine/tire-force feedback. |
| [showSparks](/workspace/VerletDrift/index.html:284) | on | [bindCheckbox](/workspace/VerletDrift/js/ui.js:312); [js/main.js:929](/workspace/VerletDrift/js/main.js:929) | Presentation/effect only; no direct engine/tire-force feedback. |
| [showSkidMarks](/workspace/VerletDrift/index.html:288) | on | [bindCheckbox](/workspace/VerletDrift/js/ui.js:313); [js/main.js:1025](/workspace/VerletDrift/js/main.js:1025) | Presentation/effect only; no direct engine/tire-force feedback. |
| [sparkIntensity](/workspace/VerletDrift/index.html:295) | 1.0; 0.1–3.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:325); [js/renderer/sparks.js:81](/workspace/VerletDrift/js/renderer/sparks.js:81) | Presentation/effect only; no direct engine/tire-force feedback. |
| [sparkSize](/workspace/VerletDrift/index.html:300) | 1.0; 0.3–3.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:326); [js/renderer/sparks.js:82](/workspace/VerletDrift/js/renderer/sparks.js:82) | Presentation/effect only; no direct engine/tire-force feedback. |
| [sparkLifetime](/workspace/VerletDrift/index.html:305) | 1.0; 0.3–3.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:327); [js/renderer/sparks.js:83](/workspace/VerletDrift/js/renderer/sparks.js:83) | Presentation/effect only; no direct engine/tire-force feedback. |
| [sparkGripThreshold](/workspace/VerletDrift/index.html:310) | 0.3; 0.05–0.8 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:328); [js/renderer/sparks.js:80](/workspace/VerletDrift/js/renderer/sparks.js:80) | Presentation/effect only; no direct engine/tire-force feedback. |
| [splatViolence](/workspace/VerletDrift/index.html:319) | 1.5; 0.5–3.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:331); [js/balloon.js:260](/workspace/VerletDrift/js/balloon.js:260) | Presentation/effect only; no direct engine/tire-force feedback. |
| [splatDecalPersistence](/workspace/VerletDrift/index.html:324) | 0.7; 0.1–1.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:332); [js/balloon.js:421](/workspace/VerletDrift/js/balloon.js:421) | Presentation/effect only; no direct engine/tire-force feedback. |
| [masterVol](/workspace/VerletDrift/index.html:338) | 0.5; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:422); [js/sound.js:336](/workspace/VerletDrift/js/sound.js:336) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [mainGain](/workspace/VerletDrift/index.html:343) | 0.3; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:423); [js/sound.js:270](/workspace/VerletDrift/js/sound.js:270) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [mainFltLow](/workspace/VerletDrift/index.html:348) | 200; 50–1000 (step 10) | [bindSound](/workspace/VerletDrift/js/ui.js:424); [js/sound.js:341](/workspace/VerletDrift/js/sound.js:341) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [mainFltHigh](/workspace/VerletDrift/index.html:353) | 2000; 500–5000 (step 50) | [bindSound](/workspace/VerletDrift/js/ui.js:425); [js/sound.js:342](/workspace/VerletDrift/js/sound.js:342) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [mainFltQ](/workspace/VerletDrift/index.html:358) | 0.7; 0.1–10 (step 0.1) | [bindSound](/workspace/VerletDrift/js/ui.js:426); [js/sound.js:347](/workspace/VerletDrift/js/sound.js:347) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [subGain](/workspace/VerletDrift/index.html:363) | 0.25; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:427); [js/sound.js:353](/workspace/VerletDrift/js/sound.js:353) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [subMult](/workspace/VerletDrift/index.html:368) | 0.5; 0.1–2 (step 0.1) | [bindSound](/workspace/VerletDrift/js/ui.js:428); [js/sound.js:352](/workspace/VerletDrift/js/sound.js:352) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [harmonicEnable](/workspace/VerletDrift/index.html:373) | off | [bindSound](/workspace/VerletDrift/js/ui.js:429); [js/sound.js:356](/workspace/VerletDrift/js/sound.js:356) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [harmonicGain](/workspace/VerletDrift/index.html:378) | 0.2; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:430); [js/sound.js:356](/workspace/VerletDrift/js/sound.js:356) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [harmonicMult](/workspace/VerletDrift/index.html:383) | 2.5; 0.5–5 (step 0.1) | [bindSound](/workspace/VerletDrift/js/ui.js:431); [js/sound.js:357](/workspace/VerletDrift/js/sound.js:357) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [noiseGain](/workspace/VerletDrift/index.html:388) | 0.1; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:432); [js/sound.js:385](/workspace/VerletDrift/js/sound.js:385) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [noiseLow](/workspace/VerletDrift/index.html:393) | 300; 100–2000 (step 50) | [bindSound](/workspace/VerletDrift/js/ui.js:433); [js/sound.js:382](/workspace/VerletDrift/js/sound.js:382) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [noiseHigh](/workspace/VerletDrift/index.html:398) | 2500; 1000–10000 (step 100) | [bindSound](/workspace/VerletDrift/js/ui.js:434); [js/sound.js:383](/workspace/VerletDrift/js/sound.js:383) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [noiseQ](/workspace/VerletDrift/index.html:403) | 1.5; 0.1–5 (step 0.1) | [bindSound](/workspace/VerletDrift/js/ui.js:435); [js/sound.js:393](/workspace/VerletDrift/js/sound.js:393) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [turboEnable](/workspace/VerletDrift/index.html:408) | off | [bindSound](/workspace/VerletDrift/js/ui.js:436); No active reader | Inactive legacy audio control; no active synth or boost physics. |
| [turboGain](/workspace/VerletDrift/index.html:413) | 0.15; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:437); No active reader | Inactive legacy audio control; no active synth or boost physics. |
| [turboMult](/workspace/VerletDrift/index.html:418) | 20; 1–50 (step 1) | [bindSound](/workspace/VerletDrift/js/ui.js:438); No active reader | Inactive legacy audio control; no active synth or boost physics. |
| [distDrive](/workspace/VerletDrift/index.html:423) | 0; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:439); [js/sound.js:396](/workspace/VerletDrift/js/sound.js:396) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [reverbMix](/workspace/VerletDrift/index.html:428) | 0; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:440); [js/sound.js:397](/workspace/VerletDrift/js/sound.js:397) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [pulseDecayMs](/workspace/VerletDrift/index.html:433) | 30; 5–80 (step 1) | [bindSound](/workspace/VerletDrift/js/ui.js:448); [js/sound.js:268](/workspace/VerletDrift/js/sound.js:268) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [jitterAmount](/workspace/VerletDrift/index.html:438) | 0.15; 0–0.5 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:449); [js/sound.js:269](/workspace/VerletDrift/js/sound.js:269) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [derivativeMix](/workspace/VerletDrift/index.html:443) | 0.10; 0–0.30 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:450); [js/sound.js:408](/workspace/VerletDrift/js/sound.js:408) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [exhaustConvMix](/workspace/VerletDrift/index.html:448) | 0.5; 0–1 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:451); [js/sound.js:401](/workspace/VerletDrift/js/sound.js:401) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [agcThreshold](/workspace/VerletDrift/index.html:453) | -18; -40–0 (step 1) | [bindSound](/workspace/VerletDrift/js/ui.js:452); [js/sound.js:626](/workspace/VerletDrift/js/sound.js:626) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [popMasterGain](/workspace/VerletDrift/index.html:464) | 0.3; 0–2 (step 0.05) | [bindSound](/workspace/VerletDrift/js/ui.js:455); [js/balloon.js:550](/workspace/VerletDrift/js/balloon.js:550) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [popBassTone](/workspace/VerletDrift/index.html:470) | 0.5; 0–1 (step 0.05) | [bindSound](/workspace/VerletDrift/js/ui.js:456); [js/balloon.js:551](/workspace/VerletDrift/js/balloon.js:551) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [popCrackBrightness](/workspace/VerletDrift/index.html:476) | 0.5; 0–1 (step 0.05) | [bindSound](/workspace/VerletDrift/js/ui.js:457); [js/balloon.js:552](/workspace/VerletDrift/js/balloon.js:552) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [popSprayAmount](/workspace/VerletDrift/index.html:482) | 0.5; 0–1 (step 0.05) | [bindSound](/workspace/VerletDrift/js/ui.js:458); [js/balloon.js:553](/workspace/VerletDrift/js/balloon.js:553) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [popDistortion](/workspace/VerletDrift/index.html:488) | 0.3; 0–1 (step 0.05) | [bindSound](/workspace/VerletDrift/js/ui.js:459); [js/balloon.js:554](/workspace/VerletDrift/js/balloon.js:554) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [popSpeedSensitivity](/workspace/VerletDrift/index.html:494) | 1.0; 0–2 (step 0.1) | [bindSound](/workspace/VerletDrift/js/ui.js:460); [js/balloon.js:555](/workspace/VerletDrift/js/balloon.js:555) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [popPitchShift](/workspace/VerletDrift/index.html:500) | 0; -12–12 (step 1) | [bindSound](/workspace/VerletDrift/js/ui.js:461); [js/balloon.js:556](/workspace/VerletDrift/js/balloon.js:556) | Audio synthesis/mixing only; does not change engine torque or grip. |

### ⚙️ Clutch

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [clutchBitePoint](/workspace/VerletDrift/index.html:513) | 0.35; 0.05–0.85 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:232); [js/physics/engine.js:64](/workspace/VerletDrift/js/physics/engine.js:64) | Clutch: Pedal position below this has zero engagement; must validate total range. |
| [clutchBiteRange](/workspace/VerletDrift/index.html:519) | 0.20; 0.02–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:233); [js/physics/engine.js:68](/workspace/VerletDrift/js/physics/engine.js:68) | Clutch: Ramp width; point+range may legally exceed one; F03. |
| [clutchBiteCurve](/workspace/VerletDrift/index.html:525) | 2.5; 1.0–6.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:234); [js/physics/engine.js:74](/workspace/VerletDrift/js/physics/engine.js:74) | Clutch: Exponent in engagement; HTML 2.5 overrides state 1.8. |
| [clutchEngageTime](/workspace/VerletDrift/index.html:531) | 0.30; 0.05–1.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:235); [js/physics/engine.js:106](/workspace/VerletDrift/js/physics/engine.js:106) | Clutch: Both engagement and disengagement pedal slew time. |

### 🎯 Velocity Trail

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [trailSpawnInterval](/workspace/VerletDrift/index.html:542) | 35 raw → 0.0251189 s; 0–100 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:238); [js/main.js:856](/workspace/VerletDrift/js/main.js:856) | Log transform 0.001·10000^(raw/100). Preset refresh writes seconds into raw slider position; changing it can jump the interval. |
| [trailLifespan](/workspace/VerletDrift/index.html:547) | 3.0; 0.5–10.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:244); [js/trail.js:47](/workspace/VerletDrift/js/trail.js:47) | Presentation/effect only; no direct engine/tire-force feedback. |
| [trailFade](/workspace/VerletDrift/index.html:553) | 1.0; 0.2–3.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:245); [js/gpu-renderer.js:729](/workspace/VerletDrift/js/gpu-renderer.js:729) | Presentation/effect only; no direct engine/tire-force feedback. |

### 📷 Camera

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [cameraOmega](/workspace/VerletDrift/index.html:563) | 2.2; 0.5–20.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:248); [js/physics/camera.js:37](/workspace/VerletDrift/js/physics/camera.js:37) | Camera spring/damping/zoom only; cannot correct chassis mechanics. |
| [cameraZeta](/workspace/VerletDrift/index.html:568) | 0.8; 0.1–2.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:249); [js/physics/camera.js:38](/workspace/VerletDrift/js/physics/camera.js:38) | Camera spring/damping/zoom only; cannot correct chassis mechanics. |
| [cameraZoomSensitivity](/workspace/VerletDrift/index.html:573) | 0.3; 0.0–1.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:250); [js/physics/camera.js:63](/workspace/VerletDrift/js/physics/camera.js:63) | Camera spring/damping/zoom only; cannot correct chassis mechanics. |

### 💨 Motion Blur

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [motionBlurSamples](/workspace/VerletDrift/index.html:583) | 6; 1–16 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:253); [js/gpu-renderer.js:659](/workspace/VerletDrift/js/gpu-renderer.js:659) | Presentation/effect only; no direct engine/tire-force feedback. |
| [motionBlurIntensity](/workspace/VerletDrift/index.html:588) | 0.6; 0.0–2.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:254); [js/gpu-renderer.js:660](/workspace/VerletDrift/js/gpu-renderer.js:660) | Presentation/effect only; no direct engine/tire-force feedback. |
| [motionBlurThreshold](/workspace/VerletDrift/index.html:594) | 10; 1–50 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:255); [js/gpu-renderer.js:664](/workspace/VerletDrift/js/gpu-renderer.js:664) | Presentation/effect only; no direct engine/tire-force feedback. |

### 🗺️ Map Size

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [mapWidth](/workspace/VerletDrift/index.html:604) | 300; 100–1000 (step 10) | [bind](/workspace/VerletDrift/js/ui.js:258); [js/physics/constraints.js:148](/workspace/VerletDrift/js/physics/constraints.js:148) | Environment: Boundary and spawn extents; resizing can create immediate collision. |
| [mapHeight](/workspace/VerletDrift/index.html:609) | 240; 100–1000 (step 10) | [bind](/workspace/VerletDrift/js/ui.js:259); [js/physics/constraints.js:149](/workspace/VerletDrift/js/physics/constraints.js:149) | Environment: Same as mapWidth. |

### 🎚️ Gauges

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [gaugeLabelScale](/workspace/VerletDrift/index.html:620) | 100; 60–160 (step 5) | [bind](/workspace/VerletDrift/js/ui.js:262); [js/main.js:1112](/workspace/VerletDrift/js/main.js:1112) | Presentation/effect only; no direct engine/tire-force feedback. |

### 🔧 Engine & Drivetrain

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [peakEngineTorqueNm](/workspace/VerletDrift/index.html:633) | 350; 50–2000 (step 10) | [bind](/workspace/VerletDrift/js/ui.js:268); [js/physics/engine.js:156](/workspace/VerletDrift/js/physics/engine.js:156) | Engine: Also changes friction, clutch capacity, governor cap; F16. |
| [idleRpm](/workspace/VerletDrift/index.html:638) | 800; 400–1500 (step 50) | [bind](/workspace/VerletDrift/js/ui.js:269); [js/physics/engine.js:153](/workspace/VerletDrift/js/physics/engine.js:153) | Engine: Governor target and torque-curve width; restart button hard-codes 800. |
| [redlineRpm](/workspace/VerletDrift/index.html:643) | 7000; 4000–10000 (step 100) | [bind](/workspace/VerletDrift/js/ui.js:270); [js/physics/engine.js:174](/workspace/VerletDrift/js/physics/engine.js:174) | Engine: Fuel cut and torque-curve width; startup 7,000 vs state 9,000. |
| [stallRpm](/workspace/VerletDrift/index.html:648) | 600; 100–1000 (step 50) | [bind](/workspace/VerletDrift/js/ui.js:271); [js/physics/engine.js:201](/workspace/VerletDrift/js/physics/engine.js:201) | Engine assist: Base threshold before stallResistance and input/speed gates. |
| [wheelRadius](/workspace/VerletDrift/index.html:653) | 0.35; 0.2–0.6 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:272); [js/physics/tires.js:237](/workspace/VerletDrift/js/physics/tires.js:237) | Contact/drivetrain: Drive conversion, slip, brake-capacity conversion and unsprung height; inertia not derived from it. |
| [finalDriveRatio](/workspace/VerletDrift/index.html:658) | 4.1; 1.0–8.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:273); [js/physics/tires.js:147](/workspace/VerletDrift/js/physics/tires.js:147) | Drivetrain: Torque/speed multiplier, reflected inertia scales with its square. |
| [brakeForce](/workspace/VerletDrift/index.html:663) | 9810; 500–20000 (step 100) | [bind](/workspace/VerletDrift/js/ui.js:274); [js/physics/tires.js:69](/workspace/VerletDrift/js/physics/tires.js:69) | Brakes: Nominal rim force, not guaranteed applied road force; fixed bias, shared handbrake. |
| [idleCreepForce](/workspace/VerletDrift/index.html:668) | 200; 0–500 (step 10) | [bind](/workspace/VerletDrift/js/ui.js:275); [js/physics/engine.js:161](/workspace/VerletDrift/js/physics/engine.js:161) | Engine: Caps locked idle governor net wheel effort, not an extra chassis motor. |
| [gearRatio1](/workspace/VerletDrift/index.html:673) | 3.5; 0.5–6.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:276); [js/physics/engine.js:28](/workspace/VerletDrift/js/physics/engine.js:28) | Drivetrain: Read directly; no monotonic-ratio validation. Gear 1 also supplies reverse magnitude. |
| [gearRatio2](/workspace/VerletDrift/index.html:678) | 2.1; 0.5–5.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:277); [js/physics/engine.js:28](/workspace/VerletDrift/js/physics/engine.js:28) | Drivetrain: Read directly; no monotonic-ratio validation. Gear 1 also supplies reverse magnitude. |
| [gearRatio3](/workspace/VerletDrift/index.html:683) | 1.4; 0.3–3.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:278); [js/physics/engine.js:28](/workspace/VerletDrift/js/physics/engine.js:28) | Drivetrain: Read directly; no monotonic-ratio validation. Gear 1 also supplies reverse magnitude. |
| [gearRatio4](/workspace/VerletDrift/index.html:688) | 1.0; 0.2–2.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:279); [js/physics/engine.js:28](/workspace/VerletDrift/js/physics/engine.js:28) | Drivetrain: Read directly; no monotonic-ratio validation. Gear 1 also supplies reverse magnitude. |
| [gearRatio5](/workspace/VerletDrift/index.html:693) | 0.75; 0.1–1.5 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:280); [js/physics/engine.js:28](/workspace/VerletDrift/js/physics/engine.js:28) | Drivetrain: Read directly; no monotonic-ratio validation. Gear 1 also supplies reverse magnitude. |
| [gearRatio6](/workspace/VerletDrift/index.html:698) | 0.58; 0.1–1.2 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:281); [js/physics/engine.js:28](/workspace/VerletDrift/js/physics/engine.js:28) | Drivetrain: Read directly; no monotonic-ratio validation. Gear 1 also supplies reverse magnitude. |

### 🏎️ Tire Model (Pacejka)

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [pacejkaB](/workspace/VerletDrift/index.html:709) | 10; 1–30 (step 0.5) | [bind](/workspace/VerletDrift/js/ui.js:284); [js/physics/tires.js:58](/workspace/VerletDrift/js/physics/tires.js:58) | Contact: Stiffness/shape factor interacting with defective normalization; F07/F08. |
| [pacejkaC](/workspace/VerletDrift/index.html:715) | 1.9; 0.5–3.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:285); [js/physics/tires.js:61](/workspace/VerletDrift/js/physics/tires.js:61) | Contact: Legal range includes negative normalizer and zero raw force; F08. |
| [peakSlipAngleDeg](/workspace/VerletDrift/index.html:721) | 8; 2–20 (step 0.5) | [bind](/workspace/VerletDrift/js/ui.js:286); [js/physics/tires.js:132](/workspace/VerletDrift/js/physics/tires.js:132) | Contact: Converted to radians; labeled peak does not locate raw peak; F07. |
| [peakSlipRatio](/workspace/VerletDrift/index.html:727) | 0.12; 0.05–0.30 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:287); [js/physics/tires.js:133](/workspace/VerletDrift/js/physics/tires.js:133) | Contact: Magnitude floor 0.0001; also sliding-floor threshold; F07/F10. |
| [tireRelaxationLength](/workspace/VerletDrift/index.html:732) | 0.3; 0.05–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:288); [js/physics/tires.js:261](/workspace/VerletDrift/js/physics/tires.js:261) | Contact: Internally at least 0.02 m; vLong at least 0.5 m/s sets tau. |
| [wheelInertia](/workspace/VerletDrift/index.html:737) | 1.2; 0.5–3.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:289); [js/physics/tires.js:144](/workspace/VerletDrift/js/physics/tires.js:144) | Rotor: Bare inertia, fallback 1.2 if falsy; rear adds reflected engine inertia. |

### 🌍 World & Visual

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [constraintIterations](/workspace/VerletDrift/index.html:747) | 6; 1–12 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:292); [js/physics/constraints.js:97](/workspace/VerletDrift/js/physics/constraints.js:97) | Numerics: Rounded/capped 1–12; determinism mode cap 8; twice per runtime tick. |
| [constraintDamping](/workspace/VerletDrift/index.html:753) | 0.8; 0.0–1.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:293); [js/physics/constraints.js:69](/workspace/VerletDrift/js/physics/constraints.js:69) | Numerics: Actual clamp 0.05–1 despite UI allowing zero; changes free yaw. |
| [checkerboardTileSize](/workspace/VerletDrift/index.html:759) | 80; 20–200 (step 5) | [bind](/workspace/VerletDrift/js/ui.js:294); [js/gpu-renderer.js:688](/workspace/VerletDrift/js/gpu-renderer.js:688) | Presentation/effect only; no direct engine/tire-force feedback. |
| [maxTrailArrows](/workspace/VerletDrift/index.html:765) | 600; 50–1200 (step 50) | [bind](/workspace/VerletDrift/js/ui.js:295); [js/trail.js:41](/workspace/VerletDrift/js/trail.js:41) | Presentation/effect only; no direct engine/tire-force feedback. |

### 🔭 View Scale

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [pixelsPerMeter](/workspace/VerletDrift/index.html:775) | 20; 5–60 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:335); [js/gpu-renderer.js:652](/workspace/VerletDrift/js/gpu-renderer.js:652) | Render scale/input perception only; no physics length conversion. |

### 🖤 Skid Marks

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [skidGripThreshold](/workspace/VerletDrift/index.html:785) | 0.6; 0.1–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:362); [js/main.js:1335](/workspace/VerletDrift/js/main.js:1335) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidFadeRate](/workspace/VerletDrift/index.html:790) | 8; 0.5–30 (step 0.5) | [bind](/workspace/VerletDrift/js/ui.js:363); [js/main.js:1336](/workspace/VerletDrift/js/main.js:1336) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidWidthMin](/workspace/VerletDrift/index.html:795) | 0.12; 0.01–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:364); [js/main.js:1337](/workspace/VerletDrift/js/main.js:1337) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidWidthMax](/workspace/VerletDrift/index.html:800) | 0.47; 0.1–1.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:365); [js/main.js:1338](/workspace/VerletDrift/js/main.js:1338) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidAlphaMin](/workspace/VerletDrift/index.html:805) | 0.2; 0.0–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:366); [js/main.js:1339](/workspace/VerletDrift/js/main.js:1339) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidAlphaMax](/workspace/VerletDrift/index.html:810) | 0.7; 0.0–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:367); [js/main.js:1340](/workspace/VerletDrift/js/main.js:1340) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidJerkBoostMax](/workspace/VerletDrift/index.html:815) | 0.3; 0.0–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:368); [js/main.js:1341](/workspace/VerletDrift/js/main.js:1341) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidMaxSegments](/workspace/VerletDrift/index.html:820) | 4000; 500–20000 (step 500) | [bind](/workspace/VerletDrift/js/ui.js:369); [js/main.js:1342](/workspace/VerletDrift/js/main.js:1342) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidMaxAge](/workspace/VerletDrift/index.html:825) | 5; 1–30 (step 0.5) | [bind](/workspace/VerletDrift/js/ui.js:370); [js/main.js:899](/workspace/VerletDrift/js/main.js:899) | Presentation/effect only; no direct engine/tire-force feedback. |
| [skidAlphaDecayRate](/workspace/VerletDrift/index.html:830) | 1; 0.05–5 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:371); [js/main.js:900](/workspace/VerletDrift/js/main.js:900) | Presentation/effect only; no direct engine/tire-force feedback. |
| [gpuSkidRedrawInterval](/workspace/VerletDrift/index.html:835) | 120; 30–600 (step 10) | [bind](/workspace/VerletDrift/js/ui.js:372); [js/gpu-renderer.js:841](/workspace/VerletDrift/js/gpu-renderer.js:841) | Presentation/effect only; no direct engine/tire-force feedback. |
| [gpuSkidResolution](/workspace/VerletDrift/index.html:840) | 1; 0.5–3 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:373); [js/gpu-renderer.js:846](/workspace/VerletDrift/js/gpu-renderer.js:846) | Presentation/effect only; no direct engine/tire-force feedback. |

### 🎨 Paint Mixing

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [paintPickupRate](/workspace/VerletDrift/index.html:850) | 2.5; 0.1–10 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:377); [js/main.js:1343](/workspace/VerletDrift/js/main.js:1343) | Presentation/effect only; no direct engine/tire-force feedback. |
| [paintSatPickupRate](/workspace/VerletDrift/index.html:855) | 0.8; 0.05–5 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:378); [js/main.js:1344](/workspace/VerletDrift/js/main.js:1344) | Presentation/effect only; no direct engine/tire-force feedback. |
| [paintDepletionRate](/workspace/VerletDrift/index.html:860) | 0.1; 0.0–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:379); [js/main.js:1345](/workspace/VerletDrift/js/main.js:1345) | Presentation/effect only; no direct engine/tire-force feedback. |
| [paintMinSat](/workspace/VerletDrift/index.html:865) | 0.05; 0.01–0.3 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:380); [js/main.js:1346](/workspace/VerletDrift/js/main.js:1346) | Presentation/effect only; no direct engine/tire-force feedback. |
| [paintDecalDepletion](/workspace/VerletDrift/index.html:870) | 0.08; 0.0–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:381); [js/main.js:1347](/workspace/VerletDrift/js/main.js:1347) | Presentation/effect only; no direct engine/tire-force feedback. |

### 💨 Blur Weights

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [blurSpeedWeight](/workspace/VerletDrift/index.html:880) | 0.5; 0–2 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:384); [js/gpu-renderer.js:667](/workspace/VerletDrift/js/gpu-renderer.js:667) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurDriftWeight](/workspace/VerletDrift/index.html:885) | 0.7; 0–2 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:385); [js/gpu-renderer.js:668](/workspace/VerletDrift/js/gpu-renderer.js:668) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurAngularWeight](/workspace/VerletDrift/index.html:890) | 0.4; 0–2 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:386); [js/gpu-renderer.js:669](/workspace/VerletDrift/js/gpu-renderer.js:669) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurJerkWeight](/workspace/VerletDrift/index.html:895) | 0.3; 0–2 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:387); [js/gpu-renderer.js:671](/workspace/VerletDrift/js/gpu-renderer.js:671) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurAttackRate](/workspace/VerletDrift/index.html:900) | 0.35; 0.01–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:388); [js/gpu-renderer.js:662](/workspace/VerletDrift/js/gpu-renderer.js:662) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurDecayRate](/workspace/VerletDrift/index.html:905) | 0.04; 0.001–0.3 (step 0.001) | [bind](/workspace/VerletDrift/js/ui.js:389); [js/gpu-renderer.js:663](/workspace/VerletDrift/js/gpu-renderer.js:663) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurMaxOffset](/workspace/VerletDrift/index.html:910) | 5; 0.5–20 (step 0.5) | [bind](/workspace/VerletDrift/js/ui.js:390); [js/gpu-renderer.js:661](/workspace/VerletDrift/js/gpu-renderer.js:661) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurOpacityMin](/workspace/VerletDrift/index.html:915) | 0.1; 0–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:391); [js/gpu-renderer.js:706](/workspace/VerletDrift/js/gpu-renderer.js:706) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurOpacityMax](/workspace/VerletDrift/index.html:920) | 0.8; 0.3–1 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:392); [js/gpu-renderer.js:707](/workspace/VerletDrift/js/gpu-renderer.js:707) | Presentation/effect only; no direct engine/tire-force feedback. |
| [blurOpacityCurve](/workspace/VerletDrift/index.html:925) | 2; 0.5–5 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:393); [js/gpu-renderer.js:708](/workspace/VerletDrift/js/gpu-renderer.js:708) | Presentation/effect only; no direct engine/tire-force feedback. |

### 💨 Tire Smoke

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [smokeEnabled](/workspace/VerletDrift/index.html:935) | off | [bindCheckbox](/workspace/VerletDrift/js/ui.js:396); [js/main.js:934](/workspace/VerletDrift/js/main.js:934) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeSpawnRate](/workspace/VerletDrift/index.html:939) | 50; 5–200 (step 5) | [bind](/workspace/VerletDrift/js/ui.js:397); [js/renderer/smoke-system.js:78](/workspace/VerletDrift/js/renderer/smoke-system.js:78) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeLifetimeMin](/workspace/VerletDrift/index.html:944) | 1.0; 0.1–3.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:398); [js/renderer/smoke-system.js:180](/workspace/VerletDrift/js/renderer/smoke-system.js:180) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeLifetimeMax](/workspace/VerletDrift/index.html:949) | 2.0; 0.5–5.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:399); [js/renderer/smoke-system.js:181](/workspace/VerletDrift/js/renderer/smoke-system.js:181) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeSizeMin](/workspace/VerletDrift/index.html:954) | 0.35; 0.1–1.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:400); [js/renderer/smoke-system.js:186](/workspace/VerletDrift/js/renderer/smoke-system.js:186) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeSizeMax](/workspace/VerletDrift/index.html:959) | 0.70; 0.5–2.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:401); [js/renderer/smoke-system.js:187](/workspace/VerletDrift/js/renderer/smoke-system.js:187) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeOpacityLocked](/workspace/VerletDrift/index.html:964) | 0.65; 0–1 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:402); [js/renderer/smoke-system.js:196](/workspace/VerletDrift/js/renderer/smoke-system.js:196) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeOpacityOverspun](/workspace/VerletDrift/index.html:969) | 0.40; 0–1 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:403); [js/renderer/smoke-system.js:201](/workspace/VerletDrift/js/renderer/smoke-system.js:201) | Presentation/effect only; no direct engine/tire-force feedback. |
| [smokeCurlNoiseScale](/workspace/VerletDrift/index.html:974) | 2.5; 0.5–5.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:404); [js/gpu-renderer.js:902](/workspace/VerletDrift/js/gpu-renderer.js:902) | Presentation/effect only; no direct engine/tire-force feedback. |

### 🏁 Grip State Machine

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [gripLossThreshold](/workspace/VerletDrift/index.html:984) | 0.7; 0.1–0.98 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:407); [js/physics/tires.js:336](/workspace/VerletDrift/js/physics/tires.js:336) | Diagnostic state only; startup thresholds are reversed; F33. |
| [gripRecoveryThreshold](/workspace/VerletDrift/index.html:989) | 0.85; 0.3–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:408); [js/physics/tires.js:337](/workspace/VerletDrift/js/physics/tires.js:337) | Diagnostic state only; startup thresholds are reversed; F33. |
| [gripEmaStable](/workspace/VerletDrift/index.html:994) | 0.15; 0.01–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:409); [js/physics/tires.js:352](/workspace/VerletDrift/js/physics/tires.js:352) | Per-tick utilization smoothing for presentation, not tire grip; F33. |
| [gripEmaSlipping](/workspace/VerletDrift/index.html:999) | 0.35; 0.05–0.8 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:410); [js/physics/tires.js:353](/workspace/VerletDrift/js/physics/tires.js:353) | Per-tick utilization smoothing for presentation, not tire grip; F33. |

### 🎈 Balloon System

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [maxBalloons](/workspace/VerletDrift/index.html:1009) | 240; 1–500 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:296); [js/main.js:1275](/workspace/VerletDrift/js/main.js:1275) | Gameplay: Population affects encounters with arcade velocity bumps. |
| [balloonRespawnRate](/workspace/VerletDrift/index.html:1014) | 0.5; 0.01–5.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:297); [js/main.js:1276](/workspace/VerletDrift/js/main.js:1276) | Gameplay: Spawn rate in simulated time; population/RNG affects future contacts. |

### 🔩 Engine Character

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [cylinderCount](/workspace/VerletDrift/index.html:1024) | 12; 1–16 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:298); [js/sound.js:138](/workspace/VerletDrift/js/sound.js:138) | Audio firing character only; not torque, crank inertia, or combustion physics. |

### 💧 Decal / Puddle System

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [decalLifetime](/workspace/VerletDrift/index.html:1034) | 30; 2–300 (step 1) | [bind](/workspace/VerletDrift/js/ui.js:338); [js/balloon.js:422](/workspace/VerletDrift/js/balloon.js:422) | Presentation/effect only; no direct engine/tire-force feedback. |
| [decalEvapRate](/workspace/VerletDrift/index.html:1039) | 0.008; 0.0–0.2 (step 0.001) | [bind](/workspace/VerletDrift/js/ui.js:339); [js/balloon.js:423](/workspace/VerletDrift/js/balloon.js:423) | Presentation/effect only; no direct engine/tire-force feedback. |
| [decalMaxCount](/workspace/VerletDrift/index.html:1044) | 4000; 100–10000 (step 100) | [bind](/workspace/VerletDrift/js/ui.js:340); [js/balloon.js:420](/workspace/VerletDrift/js/balloon.js:420) | Presentation/effect only; no direct engine/tire-force feedback. |
| [decalMinRadius](/workspace/VerletDrift/index.html:1049) | 0.15; 0.05–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:341); No active reader | Inactive: stored/bound but no active consumer found. |
| [decalMaxRadius](/workspace/VerletDrift/index.html:1054) | 0.9; 0.2–3.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:342); No active reader | Inactive: stored/bound but no active consumer found. |
| [decalEdgeSoftness](/workspace/VerletDrift/index.html:1059) | 0.4; 0.0–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:343); No active reader | Inactive: stored/bound but no active consumer found. |

### 📡 Doppler Effect

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [dopplerEnabled](/workspace/VerletDrift/index.html:1069) | on | [direct checkbox](/workspace/VerletDrift/js/ui.js:349); [js/sound.js:909](/workspace/VerletDrift/js/sound.js:909) | Audio Doppler toggle; no mechanical feedback. |
| [dopplerStrength](/workspace/VerletDrift/index.html:1073) | 0.008; 0.0–0.05 (step 0.001) | [bind](/workspace/VerletDrift/js/ui.js:346); [js/sound.js:910](/workspace/VerletDrift/js/sound.js:910) | Presentation/effect only; no direct engine/tire-force feedback. |
| [dopplerMaxShift](/workspace/VerletDrift/index.html:1078) | 0.25; 0.0–0.5 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:347); [js/sound.js:911](/workspace/VerletDrift/js/sound.js:911) | Presentation/effect only; no direct engine/tire-force feedback. |

### 💨 Exhaust & Burble

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [exhaustPopVolume](/workspace/VerletDrift/index.html:1088) | 0.3; 0.0–2.0 (step 0.05) | [bind](/workspace/VerletDrift/js/ui.js:357); [js/sound.js:923](/workspace/VerletDrift/js/sound.js:923) | Presentation/effect only; no direct engine/tire-force feedback. |
| [exhaustPopDensity](/workspace/VerletDrift/index.html:1093) | 1.0; 0.1–5.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:358); [js/sound.js:924](/workspace/VerletDrift/js/sound.js:924) | Presentation/effect only; no direct engine/tire-force feedback. |
| [backfireThreshold](/workspace/VerletDrift/index.html:1098) | 1500; 500–6000 (step 100) | [bind](/workspace/VerletDrift/js/ui.js:359); [js/sound.js:922](/workspace/VerletDrift/js/sound.js:922) | Presentation/effect only; no direct engine/tire-force feedback. |
| [exhaustBassGain](/workspace/VerletDrift/index.html:1103) | 0.35; 0.0–1.5 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:442); [js/sound.js:93](/workspace/VerletDrift/js/sound.js:93) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [exhaustBassTune](/workspace/VerletDrift/index.html:1108) | 65; 20–200 (step 1) | [bindSound](/workspace/VerletDrift/js/ui.js:443); [js/sound.js:773](/workspace/VerletDrift/js/sound.js:773) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [exhaustBassQ](/workspace/VerletDrift/index.html:1113) | 1.2; 0.3–8.0 (step 0.1) | [bindSound](/workspace/VerletDrift/js/ui.js:444); [js/sound.js:778](/workspace/VerletDrift/js/sound.js:778) | Audio synthesis/mixing only; does not change engine torque or grip. |
| [driftScreechGain](/workspace/VerletDrift/index.html:1118) | 0.55; 0.0–1.5 (step 0.01) | [bindSound](/workspace/VerletDrift/js/ui.js:446); [js/sound.js:88](/workspace/VerletDrift/js/sound.js:88) | Audio synthesis/mixing only; does not change engine torque or grip. |

### 🔄 Steering Dynamics

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [steeringSelfCenterRate](/workspace/VerletDrift/index.html:1147) | 5; 0–30 (step 0.5) | [bind](/workspace/VerletDrift/js/ui.js:418); [js/physics/steering.js:101](/workspace/VerletDrift/js/physics/steering.js:101) | Steering assist: Only low-speed released fallback: effective spring coefficient in 1/s², despite “rate” name. |
| [steeringColumnInertia](/workspace/VerletDrift/index.html:1152) | 0.08; 0.01–1.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:414); [js/physics/steering.js:83](/workspace/VerletDrift/js/physics/steering.js:83) | Steering: Released steering only; bypassed while dragging. |
| [steeringViscousDamping](/workspace/VerletDrift/index.html:1157) | 5.5; 0.0–10.0 (step 0.1) | [bind](/workspace/VerletDrift/js/ui.js:415); [js/physics/steering.js:131](/workspace/VerletDrift/js/physics/steering.js:131) | Steering: Implicit velocity damping in released column. |
| [steeringCoulombFriction](/workspace/VerletDrift/index.html:1162) | 0.05; 0.0–2.0 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:416); [js/physics/steering.js:110](/workspace/VerletDrift/js/physics/steering.js:110) | Steering: Conditionally applied dry-friction heuristic, released mode. |
| [pneumaticTrail](/workspace/VerletDrift/index.html:1167) | 0.035; 0.0–0.2 (step 0.005) | [bind](/workspace/VerletDrift/js/ui.js:413); [js/physics/tires.js:480](/workspace/VerletDrift/js/physics/tires.js:480) | Steering: SAT trail amplitude; decreases with slip through fixed 15° scale. |
| [maxFrontWheelAngle](/workspace/VerletDrift/index.html:1172) | 0.52; 0.1–1.2 (step 0.01) | [bind](/workspace/VerletDrift/js/ui.js:419); [js/physics/steering.js:64](/workspace/VerletDrift/js/physics/steering.js:64) | Steering: Direct target magnitude while dragging; released stop limit. |
| [steeringDragRange](/workspace/VerletDrift/index.html:1177) | 150; 50–400 (step 10) | [bind](/workspace/VerletDrift/js/ui.js:417); [js/input.js:186](/workspace/VerletDrift/js/input.js:186) | Input: Pixel sensitivity, fallback 150 if falsy; not physical rack geometry. |

### 🔧 Debug Overlays

| Control | Startup default; allowed range | Binding / reader | Effect and audit note |
|---|---|---|---|
| [debugShowTireForces](/workspace/VerletDrift/index.html:1185) | off | [bindCheckbox](/workspace/VerletDrift/js/ui.js:316); [js/main.js:1040](/workspace/VerletDrift/js/main.js:1040) | Diagnostic overlay only; coordinate/semantics caveats in F35. |
| [debugShowSlipAngles](/workspace/VerletDrift/index.html:1186) | off | [bindCheckbox](/workspace/VerletDrift/js/ui.js:317); [js/main.js:1040](/workspace/VerletDrift/js/main.js:1040) | Diagnostic overlay only; coordinate/semantics caveats in F35. |
| [debugShowSAT](/workspace/VerletDrift/index.html:1187) | off | [bindCheckbox](/workspace/VerletDrift/js/ui.js:318); [js/main.js:1041](/workspace/VerletDrift/js/main.js:1041) | Diagnostic overlay only; coordinate/semantics caveats in F35. |
| [debugShowSmoothingFilter](/workspace/VerletDrift/index.html:1188) | off | [bindCheckbox](/workspace/VerletDrift/js/ui.js:319); [js/main.js:1041](/workspace/VerletDrift/js/main.js:1041) | Diagnostic overlay only; coordinate/semantics caveats in F35. |
| [debugShowCrossover](/workspace/VerletDrift/index.html:1189) | off | [bindCheckbox](/workspace/VerletDrift/js/ui.js:320); [js/main.js:1042](/workspace/VerletDrift/js/main.js:1042) | Diagnostic overlay only; coordinate/semantics caveats in F35. |
| [debugShowWheelSpeeds](/workspace/VerletDrift/index.html:1190) | off | [bindCheckbox](/workspace/VerletDrift/js/ui.js:321); [js/main.js:1042](/workspace/VerletDrift/js/main.js:1042) | Diagnostic overlay only; coordinate/semantics caveats in F35. |
| [debugFontSize](/workspace/VerletDrift/index.html:1194) | 8; 4–14 (step None) | [bind](/workspace/VerletDrift/js/ui.js:322); [js/renderer/debug.js:56](/workspace/VerletDrift/js/renderer/debug.js:56) | Diagnostic overlay only; coordinate/semantics caveats in F35. |

### Buttons, keyboard, and mouse controls

| Control | Mechanical meaning / caveat | Source |
|---|---|---|
| Engine ON/OFF | Two click handlers currently negate the requested transition; F05. | [js/ui.js:496](/workspace/VerletDrift/js/ui.js:496); [js/ui.js:688](/workspace/VerletDrift/js/ui.js:688) |
| Sound ON/OFF | Starts/stops audio; does not switch engine combustion. | [js/main.js:281](/workspace/VerletDrift/js/main.js:281) |
| Drift/SUV/Kart/Ice/Stock preset buttons | Partial parameter merge; obsolete keys and range mismatch; F01–F03. | [js/ui.js:526](/workspace/VerletDrift/js/ui.js:526) |
| Export / import | Export current parameter/sound dictionaries; import merges unchecked values. | [js/ui.js:637](/workspace/VerletDrift/js/ui.js:637); [js/ui.js:667](/workspace/VerletDrift/js/ui.js:667) |
| D | Full throttle; mouse throttle takes precedence while active. | [js/input.js:87](/workspace/VerletDrift/js/input.js:87); [js/physics/engine.js:101](/workspace/VerletDrift/js/physics/engine.js:101) |
| S | Binary service brake; no analog pressure input. | [js/input.js:91](/workspace/VerletDrift/js/input.js:91) |
| F | Progressive rear handbrake while held; immediate actual release. | [js/input.js:95](/workspace/VerletDrift/js/input.js:95); [js/main.js:763](/workspace/VerletDrift/js/main.js:763) |
| A | Clutch pedal toward floor while held, toward released otherwise. | [js/input.js:99](/workspace/VerletDrift/js/input.js:99); [js/physics/engine.js:105](/workspace/VerletDrift/js/physics/engine.js:105) |
| Numpad 7/1/8/2/9/3 | Gears 1/2/3/4/5/6; selection allowed with clutch engaged. Keyboard repeat is not rejected. | [js/input.js:103](/workspace/VerletDrift/js/input.js:103) |
| Numpad 4/5/6 | Neutral. | [js/input.js:112](/workspace/VerletDrift/js/input.js:112) |
| Q + Numpad 1 | Reverse uses negative current first-gear ratio, rather than fixed GEAR_RATIOS.R. | [js/input.js:107](/workspace/VerletDrift/js/input.js:107); [js/physics/engine.js:30](/workspace/VerletDrift/js/physics/engine.js:30) |
| Right drag / Shift+left drag | Direct steering angle; effective visual range ±2.5π rad maps to physical maximum. | [js/input.js:159](/workspace/VerletDrift/js/input.js:159) |
| Left vertical drag | Analog throttle over 120 px; mouseleave releases. | [js/input.js:196](/workspace/VerletDrift/js/input.js:196) |
Keyboard handlers are global and do not clear held flags on window blur; losing focus before keyup can leave an input active. This is a confirmed missing input-release path from source, not a reproduced browser event in this audit. Repeated gear keydown can also repeat rev-match/audio/camera events. These are useful control robustness follow-ups, separate from tire calibration.


## Appendix B — All 99 exported constants

Values below are evaluated exports, not copied from potentially stale comments. “Live reference” excludes import declarations and comments; a state reference often means a startup default later overwritten by HTML. An absent reference means unused/import-only in the inspected JavaScript modules, not a guarantee that no future or external script will use it. Derived geometry exports also depend on each other inside constants.js.

| Constant | Evaluated value | Definition | Live reference / observation |
|---|---|---|
| PIXELS_PER_METER | 20 | [js/constants.js:26](/workspace/VerletDrift/js/constants.js:26) | [js/gpu-renderer.js:652](/workspace/VerletDrift/js/gpu-renderer.js:652); [js/renderer/world.js:107](/workspace/VerletDrift/js/renderer/world.js:107); [js/trail.js:100](/workspace/VerletDrift/js/trail.js:100) |
| KPH_TO_MPS | 0.277777778 | [js/constants.js:30](/workspace/VerletDrift/js/constants.js:30) | [js/main.js:1146](/workspace/VerletDrift/js/main.js:1146); [js/physics/camera.js:59](/workspace/VerletDrift/js/physics/camera.js:59); [js/ui.js:733](/workspace/VerletDrift/js/ui.js:733) |
| CAR_HALF_WIDTH | 0.8 | [js/constants.js:44](/workspace/VerletDrift/js/constants.js:44) | [js/balloon.js:178](/workspace/VerletDrift/js/balloon.js:178); [js/main.js:812](/workspace/VerletDrift/js/main.js:812); [js/physics/kinematics.js:39](/workspace/VerletDrift/js/physics/kinematics.js:39) |
| CAR_HALF_LENGTH | 1.5 | [js/constants.js:45](/workspace/VerletDrift/js/constants.js:45) | [js/main.js:811](/workspace/VerletDrift/js/main.js:811); [js/physics/kinematics.js:40](/workspace/VerletDrift/js/physics/kinematics.js:40); [js/physics/weight.js:36](/workspace/VerletDrift/js/physics/weight.js:36) |
| CONSTRAINT_AXLE_WIDTH | 1.6 | [js/constants.js:48](/workspace/VerletDrift/js/constants.js:48) | [js/physics/constraints.js:108](/workspace/VerletDrift/js/physics/constraints.js:108) |
| CONSTRAINT_SIDE_LENGTH | 3 | [js/constants.js:49](/workspace/VerletDrift/js/constants.js:49) | [js/physics/constraints.js:110](/workspace/VerletDrift/js/physics/constraints.js:110) |
| CONSTRAINT_DIAGONAL | 3.4 | [js/constants.js:50](/workspace/VerletDrift/js/constants.js:50) | [js/physics/constraints.js:113](/workspace/VerletDrift/js/physics/constraints.js:113) |
| CONSTRAINT_ITERATIONS | 12 | [js/constants.js:58](/workspace/VerletDrift/js/constants.js:58) | [js/state.js:521](/workspace/VerletDrift/js/state.js:521) |
| CAR_MASS_KG | 1200 | [js/constants.js:63](/workspace/VerletDrift/js/constants.js:63) | [js/state.js:433](/workspace/VerletDrift/js/state.js:433) |
| GRAVITY | 9.81 | [js/constants.js:68](/workspace/VerletDrift/js/constants.js:68) | [js/physics/suspension.js:41](/workspace/VerletDrift/js/physics/suspension.js:41); [js/physics/tires.js:158](/workspace/VerletDrift/js/physics/tires.js:158); [js/physics/weight.js:34](/workspace/VerletDrift/js/physics/weight.js:34) |
| COG_HEIGHT | 0.5 | [js/constants.js:73](/workspace/VerletDrift/js/constants.js:73) | [js/state.js:451](/workspace/VerletDrift/js/state.js:451) |
| MOMENT_OF_INERTIA | 1156 | [js/constants.js:79](/workspace/VerletDrift/js/constants.js:79) | No live reference beyond declaration/import. Runtime recalculates from current mass; stale comment says ~8,000. |
| MAX_DISPLACEMENT_PER_STEP | 0.72 | [js/constants.js:84](/workspace/VerletDrift/js/constants.js:84) | [js/physics/constraints.js:198](/workspace/VerletDrift/js/physics/constraints.js:198) |
| DEFAULT_BOUNCINESS | 0.5 | [js/constants.js:87](/workspace/VerletDrift/js/constants.js:87) | [js/state.js:452](/workspace/VerletDrift/js/state.js:452) State 0.5 overridden by HTML 0.3. |
| DEFAULT_YAW_DAMPING | 1 | [js/constants.js:98](/workspace/VerletDrift/js/constants.js:98) | [js/state.js:454](/workspace/VerletDrift/js/state.js:454) |
| IDLE_RPM | 800 | [js/constants.js:103](/workspace/VerletDrift/js/constants.js:103) | [js/sound.js:112](/workspace/VerletDrift/js/sound.js:112); [js/state.js:366](/workspace/VerletDrift/js/state.js:366) |
| REDLINE_RPM | 9000 | [js/constants.js:104](/workspace/VerletDrift/js/constants.js:104) | [js/state.js:491](/workspace/VerletDrift/js/state.js:491) State 9,000 overridden by HTML 7,000. |
| TORQUE_PEAK_RPM | 4500 | [js/constants.js:105](/workspace/VerletDrift/js/constants.js:105) | [js/physics/engine.js:45](/workspace/VerletDrift/js/physics/engine.js:45) |
| STALL_RPM | 600 | [js/constants.js:108](/workspace/VerletDrift/js/constants.js:108) | [js/state.js:492](/workspace/VerletDrift/js/state.js:492) |
| PEAK_ENGINE_TORQUE_NM | 350 | [js/constants.js:117](/workspace/VerletDrift/js/constants.js:117) | [js/state.js:488](/workspace/VerletDrift/js/state.js:488) |
| ENGINE_INERTIA_KG_M2 | 0.25 | [js/constants.js:121](/workspace/VerletDrift/js/constants.js:121) | [js/state.js:489](/workspace/VerletDrift/js/state.js:489) |
| BRAKE_FORCE | 9810 | [js/constants.js:125](/workspace/VerletDrift/js/constants.js:125) | [js/state.js:495](/workspace/VerletDrift/js/state.js:495) |
| IDLE_CREEP_FORCE | 200 | [js/constants.js:129](/workspace/VerletDrift/js/constants.js:129) | [js/state.js:496](/workspace/VerletDrift/js/state.js:496) |
| GEAR_RATIOS | {'1': 3.5, '2': 2.1, '3': 1.4, '4': 1, '5': 0.75, '6': 0.58, 'N': 0, 'R': -3} | [js/constants.js:134](/workspace/VerletDrift/js/constants.js:134) | [js/physics/engine.js:39](/workspace/VerletDrift/js/physics/engine.js:39); [js/state.js:497](/workspace/VerletDrift/js/state.js:497) Reverse entry −3 is bypassed by active reverse lookup. |
| FINAL_DRIVE_RATIO | 4.1 | [js/constants.js:145](/workspace/VerletDrift/js/constants.js:145) | [js/state.js:494](/workspace/VerletDrift/js/state.js:494) |
| WHEEL_RADIUS | 0.35 | [js/constants.js:150](/workspace/VerletDrift/js/constants.js:150) | [js/renderer/world.js:26](/workspace/VerletDrift/js/renderer/world.js:26); [js/state.js:493](/workspace/VerletDrift/js/state.js:493) |
| CLUTCH_BITE_POINT | 0.35 | [js/constants.js:155](/workspace/VerletDrift/js/constants.js:155) | No live reference beyond declaration/import. Imported into HUD but active HUD reads parameters. |
| CLUTCH_BITE_RANGE | 0.2 | [js/constants.js:156](/workspace/VerletDrift/js/constants.js:156) | No live reference beyond declaration/import. Imported into HUD but active HUD reads parameters. |
| CLUTCH_BITE_CURVE | 1.8 | [js/constants.js:157](/workspace/VerletDrift/js/constants.js:157) | No live reference beyond declaration/import. |
| CLUTCH_ENGAGE_TIME | 0.3 | [js/constants.js:158](/workspace/VerletDrift/js/constants.js:158) | No live reference beyond declaration/import. |
| DEFAULT_STALL_RESISTANCE | 0.7 | [js/constants.js:159](/workspace/VerletDrift/js/constants.js:159) | [js/state.js:453](/workspace/VerletDrift/js/state.js:453) State 0.7 overridden by HTML 0.5. |
| PACEJKA_B | 10 | [js/constants.js:165](/workspace/VerletDrift/js/constants.js:165) | [js/state.js:505](/workspace/VerletDrift/js/state.js:505) |
| PACEJKA_C | 1.9 | [js/constants.js:166](/workspace/VerletDrift/js/constants.js:166) | [js/state.js:506](/workspace/VerletDrift/js/state.js:506) |
| TIRE_PEAK_SLIP_ANGLE_DEG | 8 | [js/constants.js:167](/workspace/VerletDrift/js/constants.js:167) | [js/state.js:507](/workspace/VerletDrift/js/state.js:507) |
| TIRE_PEAK_SLIP_RATIO | 0.12 | [js/constants.js:168](/workspace/VerletDrift/js/constants.js:168) | [js/state.js:508](/workspace/VerletDrift/js/state.js:508) |
| DEFAULT_TIRE_FRICTION_COEFF | 1 | [js/constants.js:169](/workspace/VerletDrift/js/constants.js:169) | [js/state.js:436](/workspace/VerletDrift/js/state.js:436) |
| DEFAULT_WHEEL_INERTIA | 1.2 | [js/constants.js:170](/workspace/VerletDrift/js/constants.js:170) | No live reference beyond declaration/import. |
| DEFAULT_ROLLING_RESISTANCE_COEFF | 0.012 | [js/constants.js:179](/workspace/VerletDrift/js/constants.js:179) | [js/state.js:434](/workspace/VerletDrift/js/state.js:434) |
| DEFAULT_AERO_DRAG_COEFF | 0.4 | [js/constants.js:186](/workspace/VerletDrift/js/constants.js:186) | [js/state.js:435](/workspace/VerletDrift/js/state.js:435) |
| MAX_FRONT_WHEEL_ANGLE_RAD | 0.52 | [js/constants.js:191](/workspace/VerletDrift/js/constants.js:191) | [js/state.js:509](/workspace/VerletDrift/js/state.js:509) |
| STEERING_DRAG_RANGE_PX | 150 | [js/constants.js:192](/workspace/VerletDrift/js/constants.js:192) | [js/input.js:186](/workspace/VerletDrift/js/input.js:186); [js/state.js:510](/workspace/VerletDrift/js/state.js:510) |
| STEERING_SELF_CENTER_RATE | 5 | [js/constants.js:193](/workspace/VerletDrift/js/constants.js:193) | [js/state.js:511](/workspace/VerletDrift/js/state.js:511) |
| PNEUMATIC_TRAIL | 0.035 | [js/constants.js:204](/workspace/VerletDrift/js/constants.js:204) | [js/state.js:512](/workspace/VerletDrift/js/state.js:512) |
| STEERING_COLUMN_INERTIA | 0.08 | [js/constants.js:207](/workspace/VerletDrift/js/constants.js:207) | [js/state.js:513](/workspace/VerletDrift/js/state.js:513) |
| STEERING_VISCOUS_DAMPING | 5.5 | [js/constants.js:209](/workspace/VerletDrift/js/constants.js:209) | [js/state.js:514](/workspace/VerletDrift/js/state.js:514) |
| STEERING_COULOMB_FRICTION | 0.05 | [js/constants.js:211](/workspace/VerletDrift/js/constants.js:211) | [js/state.js:515](/workspace/VerletDrift/js/state.js:515) |
| CAMERA_SPRING_STIFFNESS | 3 | [js/constants.js:216](/workspace/VerletDrift/js/constants.js:216) | No live reference beyond declaration/import. |
| CAMERA_DAMPING_FACTOR | 4 | [js/constants.js:217](/workspace/VerletDrift/js/constants.js:217) | No live reference beyond declaration/import. |
| CAMERA_MIN_ZOOM | 0.3 | [js/constants.js:218](/workspace/VerletDrift/js/constants.js:218) | [js/physics/camera.js:62](/workspace/VerletDrift/js/physics/camera.js:62) |
| CAMERA_MAX_ZOOM | 1 | [js/constants.js:219](/workspace/VerletDrift/js/constants.js:219) | [js/physics/camera.js:63](/workspace/VerletDrift/js/physics/camera.js:63) |
| CAMERA_ZOOM_SPEED_THRESHOLD_KPH | 80 | [js/constants.js:220](/workspace/VerletDrift/js/constants.js:220) | [js/physics/camera.js:60](/workspace/VerletDrift/js/physics/camera.js:60) |
| SPEEDOMETER_MAX_KPH | 400 | [js/constants.js:225](/workspace/VerletDrift/js/constants.js:225) | [js/main.js:1147](/workspace/VerletDrift/js/main.js:1147) |
| TACHOMETER_MAX_RPM | 10000 | [js/constants.js:226](/workspace/VerletDrift/js/constants.js:226) | [js/main.js:872](/workspace/VerletDrift/js/main.js:872) |
| TACHOMETER_REDLINE_RPM | 6500 | [js/constants.js:227](/workspace/VerletDrift/js/constants.js:227) | [js/main.js:1138](/workspace/VerletDrift/js/main.js:1138) 6,500 display mark independent of limiter. |
| NEEDLE_STIFFNESS | 0.07 | [js/constants.js:228](/workspace/VerletDrift/js/constants.js:228) | [js/ui.js:98](/workspace/VerletDrift/js/ui.js:98) |
| NEEDLE_DAMPING | 0.855 | [js/constants.js:229](/workspace/VerletDrift/js/constants.js:229) | [js/ui.js:109](/workspace/VerletDrift/js/ui.js:109) |
| NEEDLE_RISE_BOOST | 1.35 | [js/constants.js:230](/workspace/VerletDrift/js/constants.js:230) | [js/ui.js:102](/workspace/VerletDrift/js/ui.js:102) |
| NEEDLE_FALL_BOOST | 0.75 | [js/constants.js:231](/workspace/VerletDrift/js/constants.js:231) | [js/ui.js:102](/workspace/VerletDrift/js/ui.js:102) |
| NEEDLE_FLUTTER_THRESHOLD | 0.8 | [js/constants.js:232](/workspace/VerletDrift/js/constants.js:232) | [js/ui.js:115](/workspace/VerletDrift/js/ui.js:115) |
| MAX_TRAIL_ARROWS | 600 | [js/constants.js:237](/workspace/VerletDrift/js/constants.js:237) | [js/state.js:523](/workspace/VerletDrift/js/state.js:523) |
| TRAIL_ARROW_BASE_LENGTH_PX | 22 | [js/constants.js:238](/workspace/VerletDrift/js/constants.js:238) | [js/gpu-renderer.js:738](/workspace/VerletDrift/js/gpu-renderer.js:738); [js/trail.js:100](/workspace/VerletDrift/js/trail.js:100) |
| TRAIL_REFERENCE_SPEED | 25 | [js/constants.js:242](/workspace/VerletDrift/js/constants.js:242) | [js/gpu-renderer.js:171](/workspace/VerletDrift/js/gpu-renderer.js:171); [js/trail.js:99](/workspace/VerletDrift/js/trail.js:99) |
| DEFAULT_MAP_WIDTH | 384 | [js/constants.js:249](/workspace/VerletDrift/js/constants.js:249) | [js/gpu-renderer.js:40](/workspace/VerletDrift/js/gpu-renderer.js:40); [js/main.js:374](/workspace/VerletDrift/js/main.js:374); [js/state.js:477](/workspace/VerletDrift/js/state.js:477) |
| DEFAULT_MAP_HEIGHT | 288 | [js/constants.js:250](/workspace/VerletDrift/js/constants.js:250) | [js/gpu-renderer.js:41](/workspace/VerletDrift/js/gpu-renderer.js:41); [js/main.js:374](/workspace/VerletDrift/js/main.js:374); [js/state.js:478](/workspace/VerletDrift/js/state.js:478) |
| CHECKERBOARD_TILE_SIZE_PX | 80 | [js/constants.js:251](/workspace/VerletDrift/js/constants.js:251) | [js/state.js:522](/workspace/VerletDrift/js/state.js:522) |
| DEFAULT_SIM_FPS | 60 | [js/constants.js:256](/workspace/VerletDrift/js/constants.js:256) | No live reference beyond declaration/import. |
| MAX_FRAME_TIME_SEC | 0.25 | [js/constants.js:257](/workspace/VerletDrift/js/constants.js:257) | [js/main.js:638](/workspace/VerletDrift/js/main.js:638) |
| BALLOON_COUNT | 40 | [js/constants.js:264](/workspace/VerletDrift/js/constants.js:264) | [js/balloon.js:82](/workspace/VerletDrift/js/balloon.js:82) |
| BALLOON_RADIUS_MIN | 0.6 | [js/constants.js:267](/workspace/VerletDrift/js/constants.js:267) | [js/balloon.js:83](/workspace/VerletDrift/js/balloon.js:83) |
| BALLOON_RADIUS_MAX | 1.8 | [js/constants.js:268](/workspace/VerletDrift/js/constants.js:268) | [js/balloon.js:83](/workspace/VerletDrift/js/balloon.js:83) |
| BALLOON_SPAWN_MARGIN | 5 | [js/constants.js:271](/workspace/VerletDrift/js/constants.js:271) | [js/balloon.js:74](/workspace/VerletDrift/js/balloon.js:74) |
| SPLAT_PARTICLE_COUNT_MIN | 10 | [js/constants.js:274](/workspace/VerletDrift/js/constants.js:274) | [js/balloon.js:299](/workspace/VerletDrift/js/balloon.js:299) |
| SPLAT_PARTICLE_COUNT_MAX | 60 | [js/constants.js:275](/workspace/VerletDrift/js/constants.js:275) | [js/balloon.js:299](/workspace/VerletDrift/js/balloon.js:299) |
| SPLAT_LIFETIME_MIN | 0.6 | [js/constants.js:278](/workspace/VerletDrift/js/constants.js:278) | [js/balloon.js:304](/workspace/VerletDrift/js/balloon.js:304) |
| SPLAT_LIFETIME_MAX | 1.8 | [js/constants.js:279](/workspace/VerletDrift/js/constants.js:279) | [js/balloon.js:304](/workspace/VerletDrift/js/balloon.js:304) |
| SPLAT_MAX_REFERENCE_SPEED | 30 | [js/constants.js:283](/workspace/VerletDrift/js/constants.js:283) | [js/balloon.js:228](/workspace/VerletDrift/js/balloon.js:228) |
| SPLAT_SPEED_MIN | 3 | [js/constants.js:287](/workspace/VerletDrift/js/constants.js:287) | [js/balloon.js:329](/workspace/VerletDrift/js/balloon.js:329) |
| SPLAT_SPEED_MAX | 18 | [js/constants.js:288](/workspace/VerletDrift/js/constants.js:288) | [js/balloon.js:329](/workspace/VerletDrift/js/balloon.js:329) |
| SPLAT_RADIUS_MIN | 0.08 | [js/constants.js:291](/workspace/VerletDrift/js/constants.js:291) | [js/balloon.js:339](/workspace/VerletDrift/js/balloon.js:339) |
| SPLAT_RADIUS_MAX | 0.35 | [js/constants.js:292](/workspace/VerletDrift/js/constants.js:292) | [js/balloon.js:340](/workspace/VerletDrift/js/balloon.js:340) |
| COMBO_TIME_WINDOW | 1.8 | [js/constants.js:296](/workspace/VerletDrift/js/constants.js:296) | [js/balloon.js:236](/workspace/VerletDrift/js/balloon.js:236) |
| COMBO_MULTIPLIERS | [1, 2, 3, 5, 8, 13] | [js/constants.js:300](/workspace/VerletDrift/js/constants.js:300) | [js/balloon.js:245](/workspace/VerletDrift/js/balloon.js:245) |
| BALLOON_BASE_SCORE | 100 | [js/constants.js:305](/workspace/VerletDrift/js/constants.js:305) | [js/balloon.js:251](/workspace/VerletDrift/js/balloon.js:251) |
| COMBO_FLASH_DURATION | 0.5 | [js/constants.js:308](/workspace/VerletDrift/js/constants.js:308) | [js/balloon.js:247](/workspace/VerletDrift/js/balloon.js:247) |
| BALLOON_HUE_RANGE | 10 | [js/constants.js:312](/workspace/VerletDrift/js/constants.js:312) | [js/balloon.js:86](/workspace/VerletDrift/js/balloon.js:86) |
| DEFAULT_MAX_BALLOONS | 240 | [js/constants.js:315](/workspace/VerletDrift/js/constants.js:315) | [js/state.js:526](/workspace/VerletDrift/js/state.js:526) |
| DEFAULT_BALLOON_RESPAWN_RATE | 0.5 | [js/constants.js:319](/workspace/VerletDrift/js/constants.js:319) | [js/state.js:527](/workspace/VerletDrift/js/state.js:527) |
| SCREEN_SHAKE_MAX_MAGNITUDE | 1.5 | [js/constants.js:326](/workspace/VerletDrift/js/constants.js:326) | No live reference beyond declaration/import. |
| SCREEN_SHAKE_DECAY | 8 | [js/constants.js:330](/workspace/VerletDrift/js/constants.js:330) | No live reference beyond declaration/import. |
| SKID_MARK_SLIP_THRESHOLD | 1.5 | [js/constants.js:338](/workspace/VerletDrift/js/constants.js:338) | No live reference beyond declaration/import. |
| MAX_SKID_SEGMENTS | 4000 | [js/constants.js:341](/workspace/VerletDrift/js/constants.js:341) | No live reference beyond declaration/import. |
| SKID_MARK_ALPHA | 0.55 | [js/constants.js:344](/workspace/VerletDrift/js/constants.js:344) | No live reference beyond declaration/import. |
| SKID_MARK_WIDTH | 0.18 | [js/constants.js:347](/workspace/VerletDrift/js/constants.js:347) | No live reference beyond declaration/import. |
| GAUGE_SHAKE_SPEED_THRESHOLD | 40 | [js/constants.js:355](/workspace/VerletDrift/js/constants.js:355) | No live reference beyond declaration/import. |
| GAUGE_SHAKE_MAX_AMPLITUDE | 0.04 | [js/constants.js:359](/workspace/VerletDrift/js/constants.js:359) | No live reference beyond declaration/import. |
| TRACTION_LOSS_THRESHOLD | 1.8 | [js/constants.js:366](/workspace/VerletDrift/js/constants.js:366) | No live reference beyond declaration/import. |
| TAU | 6.28318531 | [js/constants.js:368](/workspace/VerletDrift/js/constants.js:368) | [js/physics/engine.js:149](/workspace/VerletDrift/js/physics/engine.js:149); [js/physics/kinematics.js:23](/workspace/VerletDrift/js/physics/kinematics.js:23) |
| DEG_TO_RAD | 0.0174532925 | [js/constants.js:369](/workspace/VerletDrift/js/constants.js:369) | [js/physics/tires.js:132](/workspace/VerletDrift/js/physics/tires.js:132) |
| RAD_TO_DEG | 57.2957795 | [js/constants.js:370](/workspace/VerletDrift/js/constants.js:370) | No live reference beyond declaration/import. |

Unused/import-only exports in this snapshot: MOMENT_OF_INERTIA, CLUTCH_BITE_POINT, CLUTCH_BITE_RANGE, CLUTCH_BITE_CURVE, CLUTCH_ENGAGE_TIME, DEFAULT_WHEEL_INERTIA, CAMERA_SPRING_STIFFNESS, CAMERA_DAMPING_FACTOR, DEFAULT_SIM_FPS, SCREEN_SHAKE_MAX_MAGNITUDE, SCREEN_SHAKE_DECAY, SKID_MARK_SLIP_THRESHOLD, MAX_SKID_SEGMENTS, SKID_MARK_ALPHA, SKID_MARK_WIDTH, GAUGE_SHAKE_SPEED_THRESHOLD, GAUGE_SHAKE_MAX_AMPLITUDE, TRACTION_LOSS_THRESHOLD, RAD_TO_DEG. Their existence should not be mistaken for active simulation features.


## Appendix C — Hidden mechanical coefficients and assumptions

These values are not exposed as driving sliders. They are as influential as several visible controls.

| Mechanism | Value or rule | Source / consequence |
|---|---|---|
| Wheelbase / track / static distribution | 3.0 m / 1.6 m / 50:50 | [js/constants.js:44](/workspace/VerletDrift/js/constants.js:44); [js/physics/weight.js:39](/workspace/VerletDrift/js/physics/weight.js:39) |
| Crank inertia | 0.25 kg·m² default | [js/state.js:489](/workspace/VerletDrift/js/state.js:489); coupling caveats F14/F15. |
| Reverse ratio | Negative first-gear ratio | [js/physics/engine.js:30](/workspace/VerletDrift/js/physics/engine.js:30); the −3 constant is bypassed. |
| Sprung-body geometry | 0.25 m inertia dimension; height min 0.05 m | [js/physics/suspension.js:20](/workspace/VerletDrift/js/physics/suspension.js:20); [js/physics/suspension.js:26](/workspace/VerletDrift/js/physics/suspension.js:26) |
| Roll centers | Front 0.08 m; rear 0.12 m; clamped to sprung height | [js/state.js:444](/workspace/VerletDrift/js/state.js:444); [js/physics/suspension.js:22](/workspace/VerletDrift/js/physics/suspension.js:22) |
| Unsprung mass | 35 kg/wheel, clamped 0…mass/8 | [js/state.js:446](/workspace/VerletDrift/js/state.js:446); [js/physics/suspension.js:16](/workspace/VerletDrift/js/physics/suspension.js:16) |
| Suspension travel/stop | Bump 0.08 m; droop 0.10 m; extra 4×spring-rate stop term | [js/state.js:447](/workspace/VerletDrift/js/state.js:447); [js/physics/suspension.js:75](/workspace/VerletDrift/js/physics/suspension.js:75) |
| Suspension substep | At most 0.001 s | [js/physics/suspension.js:61](/workspace/VerletDrift/js/physics/suspension.js:61) |
| Acceleration guards | ±2g before transfer/dynamic loading | [js/physics/suspension.js:59](/workspace/VerletDrift/js/physics/suspension.js:59); [js/physics/weight.js:47](/workspace/VerletDrift/js/physics/weight.js:47) |
| Tire low-load/high-load factor | 0.5…1.5; sensitivity 0…0.3 | [js/physics/tire-load.js:5](/workspace/VerletDrift/js/physics/tire-load.js:5) |
| Lateral prefilter | 25 ms | [js/physics/tires.js:207](/workspace/VerletDrift/js/physics/tires.js:207) |
| Low-speed tire regularization | Slip denominator ≥0.5 m/s; lateral fade below 2 m/s | [js/physics/tires.js:216](/workspace/VerletDrift/js/physics/tires.js:216); [js/physics/tires.js:231](/workspace/VerletDrift/js/physics/tires.js:231) |
| Relaxation guards | Length ≥0.02 m; speed ≥0.5 m/s; tau ≥0.0001 s | [js/physics/tires.js:261](/workspace/VerletDrift/js/physics/tires.js:261) |
| SAT trail shape/filter | exp(−abs(slip)/15°); 80 ms EMA | [js/physics/tires.js:467](/workspace/VerletDrift/js/physics/tires.js:467); [js/physics/tires.js:489](/workspace/VerletDrift/js/physics/tires.js:489) |
| Brake distribution | 80% front / 20% rear; rear handbrake 50% brakeForce per wheel | [js/physics/tires.js:73](/workspace/VerletDrift/js/physics/tires.js:73) |
| Handbrake timing | Engage 0.25 s; stored value release 0.15 s, capacity gated off instantly | [js/main.js:763](/workspace/VerletDrift/js/main.js:763); [js/physics/tires.js:79](/workspace/VerletDrift/js/physics/tires.js:79) |
| Torque curve | Peak at 4,500 rpm; parabola coefficient 2.5 | [js/physics/engine.js:42](/workspace/VerletDrift/js/physics/engine.js:42) |
| Crank friction | 0.035×peak torque + 0.01×crank rad/s | [js/physics/engine.js:158](/workspace/VerletDrift/js/physics/engine.js:158) |
| Idle governor | 0.05 N·m/rpm error; unlocked cap 25% peak torque | [js/physics/engine.js:161](/workspace/VerletDrift/js/physics/engine.js:161) |
| Clutch slip/lock | Capacity=peak torque×engagement; gain=peak torque/100; lock above 0.99 | [js/physics/engine.js:121](/workspace/VerletDrift/js/physics/engine.js:121); [js/physics/engine.js:191](/workspace/VerletDrift/js/physics/engine.js:191) |
| Rev match | Gain 8/s; torque cap 50% peak; timer 0.2 s | [js/physics/engine.js:144](/workspace/VerletDrift/js/physics/engine.js:144); [js/physics/engine.js:249](/workspace/VerletDrift/js/physics/engine.js:249) |
| Stall rule | stallRpm×(1−0.8×resistance), only low speed and low throttle | [js/physics/engine.js:201](/workspace/VerletDrift/js/physics/engine.js:201) |
| Wheel solve | 40 bisections; adaptive depth 12; relative speed/force tolerance 0.001 | [js/physics/wheel.js:46](/workspace/VerletDrift/js/physics/wheel.js:46); [js/physics/wheel.js:85](/workspace/VerletDrift/js/physics/wheel.js:85) |
| Constraint guards | Damping ≥0.05; iterations ≤12 normally / ≤8 in determinism mode | [js/physics/constraints.js:69](/workspace/VerletDrift/js/physics/constraints.js:69); [js/physics/constraints.js:97](/workspace/VerletDrift/js/physics/constraints.js:97) |
| Displacement limiter | 0.72 m/tick per particle | [js/constants.js:84](/workspace/VerletDrift/js/constants.js:84); F30. |
| Sleep | Speed <0.02 m/s; yaw <0.02 rad/s; selected no-input gates | [js/physics/engine.js:307](/workspace/VerletDrift/js/physics/engine.js:307) |
| Frame guard | Wall-time cap 0.25 s; drop backlog after configured tick cap | [js/main.js:636](/workspace/VerletDrift/js/main.js:636); [js/main.js:682](/workspace/VerletDrift/js/main.js:682) |
| Balloon bump | Velocity change min(hitSpeed×0.08,1.5) m/s | [js/balloon.js:212](/workspace/VerletDrift/js/balloon.js:212) |
| Display derivatives/drift | Acceleration 80 ms; jerk 120 ms; drift EMA 0.25 attack/0.05 decay per tick | [js/physics/kinematics.js:142](/workspace/VerletDrift/js/physics/kinematics.js:142); [js/physics/tires.js:461](/workspace/VerletDrift/js/physics/tires.js:461) |
| Diagnostic overspin | Event above 200 rad/s; fixed-speed warning is not itself evidence of physical runaway | [js/physics/tires.js:403](/workspace/VerletDrift/js/physics/tires.js:403) |

## Appendix D — Reproduction artifacts

- [Mechanics and initialization probes](/tmp/verlet-audit-probes.mjs)
- [Mechanics probe results](/tmp/verlet-audit-probe-results.json)
- [Additional curve/clutch/force-transition probes](/tmp/verlet-audit-extra-probes.mjs)
- [Additional probe results](/tmp/verlet-audit-extra-results.json)
- [Real-browser control checks](/tmp/verlet-audit-browser.mjs)
- [Browser results](/tmp/verlet-audit-browser-results.json)
- [Complete machine-readable control inventory](/tmp/verlet-audit-controls.json)

The supplementary scripts inspect or temporarily mutate in-memory simulation state only. They are not implementation changes. All findings should be retested against future commits after corrections; source links and numeric results describe the audited snapshot.
