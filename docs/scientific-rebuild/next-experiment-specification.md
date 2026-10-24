# Exactly one next experiment: Stocco tire-level power and numerical comparison

**Proposal only; not implemented or authorized by Mission 17.** No vehicle, drivetrain, renderer or alternate driving model. Preserve the Zhang executable unchanged as a regression reference. The aim is to decide whether a spin/deformation-aware published tire merits further consideration, not to install it in VerletDrift.

## Foundation and prerequisite gate

Use only Stocco–Biral–Bertolazzi, *A physical tire model for real-time simulations*, DOI 10.1016/j.matcom.2024.04.020, attached 23-page version/hash in [decision](tire-architecture-decision.md): geometry/contact Eqs.(1)–(9), carcass (10)–(15), friction/kinematics (18)–(24), stresses/integration (25)–(48), solver (49)/Sec.3.4. No hybrid with Zhang force/moment coefficients or a commercial TMeasy model.

Before implementation, obtain/freeze **one complete reproducible Hoosier Table 2/Fig.11 fixture**: R(y), width/contact geometry, effective/rolling radius conventions, exact inflation and pressure-unit convention, road plane, loading/contact deflection and initial carcass state. Table 2 contains estimated coefficients and unit anomalies (e.g. deflections); Eq.(19)'s pressure/speed friction expression must be transcribed from the primary typesetting and resolved if ambiguous. A source interpretation requiring a guessed essential equation is a stop condition. The paper alone does not establish the missing author fixture or source-code/data rights. The related geometry references are Stocco & Bertolazzi, *ACME: A small 3D geometry library*, DOI 10.1016/j.softx.2021.100845, and Stocco, Larcher & Bertolazzi, *A novel approach for real-time tire-ground enveloping modeling*, DOI 10.1115/1.4065439. These are identified dependencies, not automatically approved implementation work.

Clarify article/source-code/data permissions before copying software or redistributing experimental data: article CC BY-NC-ND does not by itself license an unprovided implementation or TTC/manufacturer dataset. An independently specified mathematical implementation must not pretend to be author code. No author contact is authorized now. If the fixture, exact law or necessary permission cannot be established, return BLOCKED with the precise missing item rather than substituting a tire or fitting parameters. That preflight is part of this **one** bounded experiment, not a second model campaign.

## Frozen proposed input set

One flat road, Hoosier source parameterization, zero camber, Fz=667 N (one of Fig.11's actual loads), documented inflation/geometry from the prerequisite fixture. Do not use the other tire's 5 kN confidential parameterization or normalize it into Hoosier data.

42 steady input cases: two positive axle speeds Omega={30,60} rad/s; contact-frame yaw rates omega_z={-0.3,0,+0.3} rad/s; seven translational slip pairs

`(0,0), (+0.02,0), (-0.02,0), (0,+0.02), (0,-0.02), (+0.02,+0.02), (-0.02,-0.02)`.

Construct Vx=R_eff Omega(1-Sx), Vy=-R_eff Omega Sy consistently with the source radius/contact definitions. At fixed carcass equilibrium and zero camber, the source spin-slip input follows from Eq.(22): phi=-omega_z/|Vr| (1/m), not phi=omega_z in rad/s. These are proposed kinematic samples, not recorded physical data, and their range must pass the source's contact-region assumptions. Do not expand the set to seek a desired failure. No zero-speed, reverse or vehicle maneuver.

For each case expose Fx,Fy,Mz, source contact reference point, contact normal load/pressure, carcass c and residual, all additional moment/work ports the selected source actually defines, sliding/adhesion boundaries, counts and solver status. Do not assume omitted rolling/normal work is zero without deriving the common-reference wrench interpretation. For fixed flat geometry, normal translation work is zero; rotor/tire reactions must still be paired correctly.

## Independent comparisons and physical checks

1. Reproduce source equations and available author point fixtures before comparing models. Cross-check stress quadrature and wrench integration through an independent numerical procedure, not another call to the same closed function.
2. At zero contact-frame spin, assess source pure/combined slip, signs, reflection and force/moment behavior. At nonzero spin, compare symmetry under simultaneous lateral/spin reflection and evaluate complete wrench work; do not assume aligning torque is simply an empirical trail times Fy.
3. Derive the available storage/transport balance from the selected source. Evaluate force-plus-moment power at the same contact/rotor reference; if positive, distinguish permissible elastic/advective exchange from unexplained supply. No instantaneous-power sign test alone certifies a dynamic tire's passivity. If the necessary storage/flux accounting cannot be established, report global passivity UNKNOWN and do not approve production adoption.
4. Use the existing Zhang results for **property-level comparison**: slip/moment sign, spin sensitivity, port bookkeeping and numerical cost structure. Hoosier and Zhang parameters describe different tires; raw force equality or a fitted cross-model match is not an acceptance condition. No source parameter is tuned to remove discrepancies.
5. Published Fig.11 is evidence of tire fitting, not an independently reproduced dataset. Compare available permitted reference data/author fixtures with uncertainty. Lack of the original TTC data is an explicit limitation, not evidence of validation or failure.

## Numerical and cost gates

Use the published three-variable carcass equilibrium formulation and documented transition root/quadrature procedure. Freeze root selection, initial guess, residual scaling and failure behavior before code; do not silently continue an unconverged root. The source's 100 nonlinear iterations/10 relaxation-step caps are attempted-work bounds, not accuracy guarantees. Report transition-root and quadrature calls separately.

Compare 5/10/20 ribs with independently refined sliding quadrature/root tolerances; distinguish discretization error from nonlinear residual and branch changes. Proposed engineering numerical-resolution targets are <=1 N force difference, <=0.01 Nm moment difference, and <=0.01 W work uncertainty against the independently refined calculation on the declared sample. These are not empirical tire tolerances: the power target is chosen to resolve a sub-watt issue rather than hide it in numerical noise. If refinement does not meet them, report UNRESOLVED/FAIL and stop rather than loosening them. Exact tolerances must be frozen against the complete author fixture before implementation.

Measure named-hardware mean/median/p95/p99/worst CPU cost, actual function/root/quadrature/iteration counts and failure fraction, with warmup and repeated serial samples. Do not predict JavaScript timings from the paper's Xeon/C++ data or divide by legacy bisection counts. A fixed-size problem can still have unreliable convergence. Benchmark only valid solved cases and expose rejected attempts; no successful-only timing narrative.

Accept for **further research**, not production, only if source/fixture fidelity, numerical convergence and explainable wrench-power accounting all pass with feasible measured cost. Stop on missing constitutive closure, unresolved root multiplicity, unexplained energy supply, invalid contact topology, hidden coefficient fitting or excessive/unstable solve cost. If no complete fixture/permission is available, the experiment stops at that gate. Do not substitute Chrono or build a four-wheel model to avoid the blocker.

Future starting/stall/standstill, clutch/gear/differential, braking and steering integration remain separate mechanical requirements. The experiment may reject Stocco as unsuitable; no outcome is presupposed.
