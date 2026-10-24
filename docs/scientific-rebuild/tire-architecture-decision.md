# Tire architecture decision — Mission 17

## Evidence threshold

A production-oriented foundation must have coherent force/moment/rotor power ports, a defensible storage/dissipation interpretation over its intended domain, predictable numerical behavior, feasible cost and a path to independent wheels/standstill/manual drivetrain. It need not be exact in all tire physics; approximations and unsupported regimes must be explicit and testable. Cheap execution, publication, or sophistication alone does not meet this threshold.

The present reference is reproducible: see [audit](independent-reference-reproduction-audit.md). Its instantaneous kinetic contact-power inequality fails in a poorly controlled local-spin-neglect regime; full thermodynamic passivity is not proved either way. Narrow cornering/drift samples show no positive net contact power. The decision therefore rests on unsupported physical scope and unclosed constitutive power meaning, **not** on a claim of large/frequent energy injection or failed numerical reproduction.

## Four alternatives, with bounded evidence

|Criterion|A: Zhang analytic law|B: Zhang underlying bristles with spin retained|C: Stocco–Biral–Bertolazzi|D: pinned Chrono TMeasy implementation|
|---|---|---|---|---|
|Accessible primary basis|Attached Eqs.(7)–(20), Appendices A/B|Attached B3–B5 transport/contact kinematics; later spatial equations/comparisons omit spin in the selected approximation|Attached full 2024 paper, DOI 10.1016/j.matcom.2024.04.020, Eqs.(1)–(49)|Official `ChTMeasyTire.cpp/.h` inspected at commit below; official documentation endpoint blocked|
|Combined slip and wheel motion|Explicit Fx/Fy from wheel-speed slip, separate mu0/mu|Could retain both bristle deformations and actual slip directions; complete new spin-aware solve still requires derivation|Combined stresses, pressure/speed friction and flexible carcass equilibrium; supplied hub motion, not gearbox|Combined sx/sy curve and low-speed Coulomb/bristle blend, effective rolling radius; reads wheel omega|
|Moments, spin and transients|Analytic Mz; no tire-memory ODE; local spin neglected|Can represent spin in B5, but boundary/slide transitions and transport/storage must be consistently rederived|Explicit spin slip (22), carcass/pressure deformation; principally steady-state solution, not a proven full transient storage model|Mz from pneumatic-trail/Fy function; dynamic low-speed bristle states; no explicit parking-spin model; header lists missing belt/parking dynamics|
|Power/passivity|Force-only inequality established; reduced kinetic contact sign can be positive; complete storage/transport passivity unresolved|Potentially better work consistency, **not proved**; merely solving B30 (already spin-neglected) is insufficient|Local sliding stress opposes slip by (18); global force/moment/storage passivity **unknown**, must test|No inspected global passivity proof; source contains force/load limits, blends and damping. Greater maturity does not prove a port inequality|
|Numerical structure|Two explicit axle laws/RHS; wheel stiffness and zero-speed singularity remain|Spatial coupled contact/region solution; may require boundary/value or nonlinear solves and multiple contact regions|Three-variable carcass nonlinear root, rib transition roots and sliding quadrature; convergence-dependent work|Finite explicit combined-curve evaluation plus fixed-form low-speed bristle update; surrounding contact/synchronization still matters|
|Measured cost|Mission 16 Node measurements, not rerun here; not application FPS|No implementation/timing here|Published C++/shielded Xeon measurements; not JS/browser or a universal bound|No comparable local measurement or compilation in this mission|
|Calibration/validation|Synthetic published set; Appendix B analytic-vs-numerical comparison, vehicle validation future work|Would need validated tire parameters and new evidence; no inherited empirical validation by derivation alone|Pure-slip Hoosier TIRF/FSAE TTC fitting, additional manufacturer Magic Formula comparisons; many estimated coefficients/confidential data|Source comments cite FED-Alpha/KRC steady-cornering and converted Pac02 datasets; raw data/results not independently verified here|
|Four wheels and manual coupling|Rotor reactions compatible in principle; masses, support loads, standstill and constraints need redesign|Same mechanical ports if complete work exchange is retained; not an automatic plug-in|Hub wrench/rotor reaction can support individual wheels; drivetrain constraints remain separate|Already a wheel/contact subsystem; wrapper/core interfaces and signed reaction/work still need verification|
|License/reproduction limits|No accompanying author-code license identified; equations do not grant rights to unprovided software/data|No published ready-made spin-complete implementation supplied|Article is CC BY-NC-ND 4.0; no accompanying source-code license/data permission established. Do not assume paper/code/data share terms|Official inspected source/LICENSE is BSD three-clause; commercial TMeasy product has separate terms and is not this basic implementation|

### What “more complete Zhang” would entail

B5 includes omega_z terms and partial time derivatives. Its steady adhesion equations with forward rolling include

`r Omega xi' = Vx-r Omega-omega_z eta`,
`r Omega eta' = Vy+omega_z x+omega_z xi`.

This is a source-derived consequence, not an implemented alternative. Sliding stress direction, entry/exit conditions, possible region topology, integrated moments and elastic/advective work need corresponding treatment. B6 explicitly sets omega_z=0; using B30's anisotropic numerical correction does not by itself restore spin. Table B1 addresses force/moment approximation differences, not a global energetic theorem. A spin-complete extension is credible research, but substantial new derivation rather than a cheap surgical correction to Mz. It is not authorized now.

### Stocco: credible candidate, not automatically passive or cheap

Primary file SHA-256 `0197da3a160fbed9ea3bb11c5d388beaba909b24e25de10f6bc3b28ba84c1082`. ISO hub/contact frames; Eq.(11) solves G(c)=K(c)c-F(c)=0, (18) specifies local Coulomb contact, (19) pressure/speed friction, (20)–(24) kinematics/slips including spin, (41)–(48) ribs/quadrature/transition root, (49)/Sec.3.4 nonlinear solver. Its spin/deformation-aware force/moment construction directly addresses physics omitted in A, but a quasi-static carcass root is not a transient energy-state proof.

Table 1 p.15/printed 668 reports BCM mean 55.7 microseconds/max 264.4 microseconds at five ribs on a 2.5 GHz Xeon Silver 4215/RedHawk, C++/Eigen, 10^5 sampled tests, 100% sampled success. Limits are 100 iterations/10 relaxation steps. A cap bounds attempted work, not successful convergence. These published measurements cannot be compared as a speedup to JS analytical calls or legacy bisections. No Stocco implementation was built or timed here.

Sec.4.2/Fig.11 p.17 uses Hoosier pure-slip data at 222/444/667/890/1120 N, zero camber. Manufacturer-based 325/660R13 combined-slip plots have confidential axes/coefficients. Do not silently mix that 5 kN tire with Hoosier Table 2. Friction/moment fits are not perfect and Table 2 has estimated entries. A reproducible input/geometry/calibration fixture is a real prerequisite, not something to fit around.

### Chrono TMeasy: primary code now accessible, limitations visible

Official documentation `https://api.projectchrono.org/wheeled_tire.html` returned proxy tunnel HTTP 403. Official GitHub source was accessible and pinned to **`9a5072b5324e012a66d9fb7eaac0c679b8465e73`**:

- [ChTMeasyTire.cpp](https://github.com/projectchrono/chrono/blob/9a5072b5324e012a66d9fb7eaac0c679b8465e73/src/chrono_vehicle/wheeled_vehicle/tire/ChTMeasyTire.cpp), SHA-256 `4e254282b6e45eeb17e7206d08eb512b08f1c5e20402b198b26de7026b93322a`.
- [header](https://github.com/projectchrono/chrono/blob/9a5072b5324e012a66d9fb7eaac0c679b8465e73/src/chrono_vehicle/wheeled_vehicle/tire/ChTMeasyTire.h), SHA-256 `8c33511b9310156f507f3b582230777f8433688f3d3038fe5871ae4ed25cdf96`.
- [LICENSE](https://github.com/projectchrono/chrono/blob/9a5072b5324e012a66d9fb7eaac0c679b8465e73/LICENSE), inspected BSD three-clause.

`Synchronize` lines ~150–172 computes omega/slips using |R_eff omega|+vnum and load-dependent curve parameters. `Advance` ~195–275 blends low-speed forces and combined TMeasy curves; applies normal-load extrapolation limits and optional startup transition. `CombinedCoulombForces` ~278–340 integrates bristle states by BDF1/trapezoid and includes damping/force-circle bounding; its own comment calls this experimental. `AlignmentTorque` ~387–412 returns -Fy*contactLength*trail. Header comments explicitly list no parking slip/dynamic parking torque/belt dynamics and simplified standstill. These are actual implementation assumptions to audit, not a license to port arbitrary stabilizers or assume ideal reverse/standstill physics. The code was inspected only, not compiled, benchmarked or certified passive. Other Chrono tire families are outside this shortlist.

## Recommended balance and architectural consequence

A is the best **already verified small research benchmark**, not the best justified definitive tire foundation. B could preserve its interpretation but demands significant spin/storage research. C is the strongest primary-source candidate for the next *physical suitability test* because it addresses spin, integrated moments and deformation with tire-data evidence; it has higher calibration/numerical risk. D is an accessible, permissively licensed engineering fallback, but its standstill/parking/moment assumptions and global work behavior need their own evidence. No alternative earns production selection on this audit alone.

Constitutive questions: how forces/moments/slip/storage relate, low-speed validity, load dependence and calibration. Separate system questions: common contact/rotor impulses, gear/differential/clutch constraints, starter/loss torque, engine modes, time integration and command/snapshot adapters. No tire law by itself implements manual transmission. Future four-wheel motion must pass rotor reaction and chassis power consistently while preserving starting, stalling/restarting, engine braking, clutch slip/lock/kicks, synchronization, wheelspin, brakes/handbrake, reverse/standstill and steering. Do not sacrifice those capabilities to keep a five-state reference unchanged. Visual/input identity remains protected.

The threshold for rejecting the reference itself is not met: no foundational transcription or numerical-replay failure was found. The threshold for adopting A as a definitive physically credible extension base is also not met: spin-sensitive moment work, complete storage interpretation, standstill and empirical domain are not established. Preserve A unchanged as a benchmark and test one better-grounded alternative before structural/drivetrain expansion.

**RETAIN AS REFERENCE ONLY**
