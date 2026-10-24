# Mission 19 — frozen fixture completeness

**The 42-case experiment is not presently implementable unambiguously.** This is a source/fixture finding, not a failed numerical tire test. No cases were evaluated.

The [unchanged experiment specification](next-experiment-specification.md) prescribes flat road, camber zero, Fz=667 N, wheel spins {30,60} rad/s, contact yaw rates {-0.3,0,+0.3} rad/s and slips `(0,0),(+.02,0),(-.02,0),(0,+.02),(0,-.02),(+.02,+.02),(-.02,-.02)`. All 2×3×7 combinations remain frozen. These inputs are not Stocco experimental measurements.

## Dependency closure

Sources/revisions are indexed in [inventory](stocco-source-recovery-inventory.md); detailed geometry and equation evidence is in [geometry](stocco-geometry-recovery.md) and [reconciliation](stocco-equation-reconciliation.md).

|Required dependency|Verified source / available content|Category; closure|
|---|---|---|
|Tire identity|J Table 2, Fig.11; T C.4.2, Figs.C.6–C.8: Hoosier 18×6-10 LCO.|Essential source fixture; identity known, not its whole geometry.|
|R(y), tread endpoints, crown, rib radius function|J (1), T pp.161,184 arbitrary; E shape gives a superellipse family.|Essential source geometry; **UNRESOLVED** LCO coefficients/width.|
|Belt transition Rell|J (6), T (C.2) p.186.|Essential source geometry; **UNRESOLVED** value. ENVE's chord is not a supplied belt correction.|
|Inflation and pressure units|kz/K laws in J (3),(14); Table 2 lacks exact fixture inflation; T does not supply it.|Essential exact-fixture input; **UNRESOLVED**. A declared pressure could be a permissible input for another separately authorized fixture.|
|Road plane, camber, Fz|Frozen experiment, J Fig.11 contains 667 N, zero camber.|Permissible experimental inputs, **RESOLVED — PRIMARY-SOURCE** specification. World origin can be chosen; missing hub height is not arbitrary once load/profile are fixed.|
|Vertical constitutive coefficients and steady rate|J Table 2; J (3)–(5), T (C.1). Set rho_dot=0 for stationary evaluation.|Numbers available as historically inventoried; rate is declared experimental input. Deflection still depends on pressure/profile. **PARTIALLY RESOLVED**.|
|Hub/road placement, rho(y), ell(y), AP|E/A intersection plus J (6),(9), T (C.2),(C.4).|Derived contact geometry; **PARTIALLY RESOLVED** algorithm, numerics blocked by inputs above.|
|Rolling radius and speed/slip mapping|J (21)–(23), T p.193: Rr=R-rho/3; Vr=Omega Rr; sigma_x=(Vr-Vx)/abs(Vr), sigma_y=-Vy/abs(Vr), phi=-yaw/abs(Vr) at steady zero camber.|Definitions **RESOLVED — PRIMARY-SOURCE**; numerical Vr and hub velocity/rib mapping not frozen until geometry supplied. Rib-dependent Rr must not be silently replaced by one guessed radius.|
|Pressure shape lambda,delta,nu|J Table 2: 4.046,.001993,1; J (7)–(9), T (C.3),(C.4).|Essential constitutive inputs supplied; endpoint typo **RESOLVED — DERIVED**. Geometry/positivity still require verification.|
|Bristle stiffness tensor|J Table 2: kxx=3.511e7, kyy=5.508e7, cross entries=0 N/m³; T p.196.|Essential constitutive coefficients supplied; **RESOLVED — PRIMARY-SOURCE** numerical entries, not a verified wrench.|
|Carcass spring/bottoming coefficients, thresholds|J Table 2 and J (10)–(15); T pp.188–190 repeats structure.|Essential constitutive physics/calibration; numeric entries available, dimensions/normalization **UNRESOLVED**. See historical readiness table for all values.|
|Smoothing hx,hy,h_theta|J (14),(15), T pp.189–190.|Regularization settings; **UNRESOLVED** exact fixture. May be declared numerical choices only if their effect and constitutive interpretation are separately authorized/frozen.|
|Carcass state and transport field|c solved from Kc-F=0; J (10),(27),(28), T (C.5), p.194.|Essential physics; **UNRESOLVED** offset versus absolute position, not an initial-guess choice.|
|Friction parameters and grouping|J Table 2/(19); T p.192/TS 310–313 repeats cancellation.|Literal coefficients/formula available; cancellation **RESOLVED — DERIVED**, intended kinetic dependence **UNRESOLVED**. No replacement selected.|
|Adhesion/sliding transition and region topology|J (18),(48), T (C.8),(C.18); first transition from leading edge.|Source condition known; root isolation/selection/tolerance is permissible numerical work after closure. High spin may invalidate two-region topology. **PARTIALLY RESOLVED**; do not manufacture a root.|
|Moment signs, components, common reference, intervals|J (37),(40),(45),(47); T (C.15),(C.17) and p.197.|Essential constitutive wrench; **UNRESOLVED** sign/reference, **PARTIALLY RESOLVED** support for S interval.|
|Rib density and quadrature refinement|Frozen 5/10/20 ribs; J Sec.3; T C.3; E midpoint placement.|Permissible numerical choices, not physical tire fitting. **RESOLVED — PRIMARY-SOURCE** method, no accuracy run yet.|
|Nonlinear iteration controls|J (49), Table 1; T C.3.3/Table C.1: c0=0, bounded quasi-Newton comparison.|Permissible numerical policy; residual scales, tolerances/fail behavior must be frozen. No guarantee of convergence from author timing success rates.|
|Storage/transport and total mechanical work|Source stationary approximation and future common-reference force/moment ledger.|Essential physical interpretation for power comparison; **UNRESOLVED** global passivity. Not required to invent a transient storage ODE; cannot certify passivity from local friction alone.|
|Raw TTC records, uncertainty and author point output|T C.4.2 says Calspan TIRF/FSAE TTC; plotted fits, no complete unrounded LCO fixture found.|Optional empirical validation for mathematical evaluation, **UNRESOLVED** for reproducing the author's fit. Not a universal implementation prohibition.|
|Code/data reuse permission|E BSD-3-Clause; A BSD-2-Clause; no LCO dataset grant recovered.|Separate rights dependency. No external copying is needed for this analysis; no future blanket data grant established.|

Dependency order is `profile + pressure + vertical law -> deflection -> patch/rolling radius -> pressure/contact velocities -> deformation/transport + friction -> stresses/regions -> wrench -> carcass root -> power/convergence/cost`. Missing early geometry is not the only block: the wrench and transport definitions also interrupt this chain.

## Third-party lead: what it can and cannot establish

V README and report identify **Hoosier 18.0×6.0-10 R25B**, not LCO. The same nominal size does not demonstrate identical compound, carcass construction, rim/test preparation or calibration. Construction details beyond the stated designation remain unverified. `dataset/Hoosier_B1464run23.mat` and `...run30.mat` are tracked; V analysis lines 47/51 labels them lateral/longitudinal cases. The associated `1464 Summary Tables.xls` and raw MAT contents were not decoded; filename associations alone do not independently establish the original Calspan/TTC chain of custody or test protocol.

V analysis selects runs/indices (lines 37–55), comments that it retains 12 psi data (128), labels pressure psi and temperatures degC (102–121), and converts angular channels from degrees to radians and FZ/MZ signs (133–139). Report p.1 says fitting at 900 N was chosen because lower-load data were noisy. These are **source-reported selection/analysis conditions**, not independently measured pressure/speed/temperature histories. Exact belt/rim dimensions, construction, warmup, surface and velocity protocol remain unverified. V line 27 uses `18*2.56` for inch-to-cm diameter conversion and line 29 flags its nominal radius as “TO BE CHANGED”; this is not precision geometry evidence. No correction, fitting or execution was performed.

The coefficients are MF96 fits. They neither supply Stocco carcass/bristle parameters nor repair its moments/transport. Do not use V's 12 psi as Stocco LCO inflation. Data redistribution permission remains unestablished.

## Before / after Mission 19

|Mission 18 dependency|New evidence|Status now|
|---|---|---|
|Generic geometry source not inspected|E shape/rib/shell + A intersections, T Appendix B|**RESOLVED — PRIMARY-SOURCE** algorithms.|
|LCO profile and tread extent missing|T still arbitrary; E examples unrelated/unidentified|**UNRESOLVED**.|
|Rell missing|T repeats definition; E geometric chord distinct|**UNRESOLVED**.|
|Rolling-radius convention, numerical geometry|T confirms R-rho/3; no LCO fixture|**PARTIALLY RESOLVED** overall; definition confirmed.|
|Moment cross-order/component disagreement|T repeats global force×position, omits component expansion|**UNRESOLVED**.|
|Sliding force/moment region conflict|T uses S for both global integrals|**PARTIALLY RESOLVED**, full corrected wrench absent.|
|Repeated labels/axis interpretation|No corrected component table/code|**UNRESOLVED**.|
|Friction cancellation/intended grouping|T PDF and TS reproduce cancellation exactly|Literal **RESOLVED — DERIVED**; intention **UNRESOLVED**.|
|Offset/position transport contradiction|T repeats Lx=xc and derivative≈1|**UNRESOLVED**.|
|Bottoming units, smoothing parameters|T repeats form; precise nonsmooth positive-part behavior identified|Required dimensions **RESOLVED — DERIVED**; calibration/settings **UNRESOLVED**.|
|Pressure endpoint typo|T repeats typo, supplied coefficients still resolve endpoints|**RESOLVED — DERIVED**, unchanged mathematical conclusion.|
|Possible third-party calibration|R25B/MF96 identity verified, different tire|**NOT APPLICABLE** as a substitute LCO fixture.|
|Actual author constitutive code/fixture|Geometry APIs inspected, no matching solver located|**UNRESOLVED** availability in bounded search.|
|Software/data rights|E/A LICENSE files inspected; other data rights not established|E/A code licenses **RESOLVED — PRIMARY-SOURCE**; data grant **UNRESOLVED**.|

A separately authorized synthetic profile could fill missing geometry, but **cannot yet close the abstract system**: moment convention and carcass transport are still unresolved. Consequently a synthetic-fixture campaign is not the justified next implementation. Raw data absence alone would not prohibit evaluating an otherwise closed mathematical model.
