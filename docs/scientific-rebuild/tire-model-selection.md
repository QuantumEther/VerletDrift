# One model selection

Select **Zhang–Takács–Orosz attached manuscript, Eqs.(6)–(20), Table 1**, using its analytic quasi-stationary combined-slip approximation and its own five-velocity-state mechanics. Do not combine Dallas chassis/load equations with Zhang tire forces under a SOURCE-EXACT label. Equation ledger and version hashes: [primary audit](primary-source-equation-audit.md).

|Criterion|Zhang|Dallas|Stocco|
|---|---|---|---|
|Published closure|Full body/rotor/slip/force/load chain on non-singular domain|Closed for its force-controlled safety model, incomplete for torque-driven rotors|Tire equilibrium, contact geometry, root/quad/iteration procedure; no vehicle model|
|Parameter meanings/data|Table 1 complete reference set, interpretable line stiffness/friction/inertias; not calibrated to our car|Physical chassis/cornering parameters, mu=0.3 emulation; not an axle-rotor parameter set|Extensive physical/fitted parameters; some estimated/confidential data|
|Combined slip|Both forces from two wheel-velocity slips; distinct static/sliding friction|Lateral capacity depends on prescribed Fx; no longitudinal slip law|Full coupled stresses/carcass/friction, camber/spin/geometry|
|Wheel rotation|Two aggregate dynamic rotors, equal/opposite reaction explicit|Absent; tau/rw bypasses rotational energy|Receives hub motion/rolling speed; needs separately supplied rotor/chassis model|
|Ordinary/high-slip|Table 2/Figs.8–18: cornering/donut/drift, periodic motions and controlled stabilization|Safety/recoverability and drift control, experimental dynamics emulation|Pure/combined force validation; does not alone establish vehicle drift|
|Numerical difficulty|Algebraic piecewise tires, low-speed stiffness/singular rotor denominator, steering acceleration input|1/V and arctangent/saturation limits; QP separate from mechanics|Nonlinear carcass root, rib transition roots, sliding quadrature; convergence-dependent cost|
|Cost structure|Two tire calls/RHS; no constitutive iterative solve in selected approximation|Two lateral tire calls/RHS plus control QP if used|Nested numerical evaluation/iterations; fixed caps do not guarantee valid solution|
|Empirical support|Appendix B compares approximate/exact brush calculations, not tire/vehicle experiments; vehicle validation future work|Real closed-course shared-control tests on emulated dynamics, not manual driveline identification|Real tire data fitting plus Magic Formula comparisons, stronger tire-level empirical evidence|
|Manual drivetrain path|Rotor torques/reactions provide mechanical seam; loads/body mass representation and constraints must be rederived|Must add missing rotor/longitudinal tire dynamics, so source would cease to specify that model|Possible but heavier; no supplied gearbox/differential closure|

Zhang is the simplest **complete** candidate for the first torque-driven reference; its supplied formulation supersedes Mission 13's provisional Dallas choice. Completeness on its declared domain is not global validity, numerical stability or real-world accuracy.

Dallas is retained as a later recovery/control methodology reference, not a longitudinal constitutive model. Stocco is a future tire comparison/alternative, not a source to graft onto the first experiment. Its use of nonlinear solving is scientifically justified for flexible carcass equilibrium; reject it here for scope/cost/parameter burden, not because all iterative tire methods are inherently wrong. The published execution measurements cannot predict JavaScript performance.

The selected analytic brush law deliberately approximates anisotropic sliding direction and neglects transient bristle transport. Appendix B supplies a more accurate spatial-ODE comparison; this is not an essential missing closure for reproducing the **analytic** law. Do not silently replace it with that more expensive calculation. Its moment approximation needs special caution before steering-column reuse.

No second prototype, tire hybrid, suspension or empirical tuning is authorized. Recommended verdict is **CONDITIONALLY READY** for a narrowly scoped source-reproduction experiment; remaining numerical/domain decisions are enumerated in [readiness](reference-implementation-readiness.md).
