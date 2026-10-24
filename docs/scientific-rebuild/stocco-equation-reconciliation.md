# Mission 19 — equation reconciliation

Pinned sources and primary locators: [inventory](stocco-source-recovery-inventory.md). J page references below are PDF / printed. T references are both PDF ordinal and printed page. Reading T is not independent experimental corroboration: Appendix C says it reports the published model again. TS LaTeX verifies the typesetting, not author intent or constitutive software behavior.

## Moments: journal versus thesis versus software

Let `X=Lx+ell_i/2-xi`, `Y=Ly+yi`. The following preserves the source expressions rather than selecting corrections.

|Issue|Journal expression|Thesis counterpart|Actual relevant implementation|Disposition|
|---|---|---|---|---|
|Adhesive moment order|J (37), 10/663: `Ma=integral_A qt^xi × (L^xi+xi) dxi`.|T (C.15), p.196, same order; TS line 516.|No constitutive moment function found in E/A. ENVE normal-vector cross products are geometry, not this wrench.|**UNRESOLVED** physical moment convention. Repetition confirms the text, not reconciliation with J components.|
|Sliding moment order|J (40), 10/663: `Ms=integral_S mu_d qz dt × (L^xi+xi) dxi`.|T (C.17), p.196, same order; TS line 542.|No corresponding Stocco tire solver found in inspected code.|**UNRESOLVED**, same conflict.|
|Adhesive components|J (45a,b,c), 11/664: respective integrands `qz Y`, `qz X`, `qy X-qx Y`, all over `0..xi_s`; (45a) and (45b) both labelled Mxa.|T p.197 discusses rib sums but **omits these explicit component formulas**; no replacement sign/axis table.|No constitutive implementation establishes an axis convention.|**UNRESOLVED**; do not rename b or change its sign silently.|
|Sliding region|J (46) forces over `xi_s..ell`; (47a,b,c), 12/665 moments instead over `0..xi_s`. (47b) repeats Mxs.|T (C.16),(C.17) both integrate over S; p.197 refers to their numerical integration but gives no corrected component limits.|No corresponding code.|**PARTIALLY RESOLVED**: thesis supports the sliding region S, but does not authorize a complete corrected J (47).|
|Chart and reference point|J (31),(43): `xi=ell(y)/2-x`, eta=y; O is patch centroid, not leading edge.|T pp.184,195,197 repeats patch frame and chart.|E/A hub/contact geometry does not define the missing constitutive chart-to-wrench mapping.|**PARTIALLY RESOLVED** chart; force/moment component mapping still missing.|

### Independent cross-product and interval checks

In fixed right-handed physical axes, for lever `r=(X,Y,Z)` and force `q=(qx,qy,qz)`,

`r×q=(Y qz-Z qy, Z qx-X qz, X qy-Y qx)`.

With Z=0, J (45a) matches its x component and (45c) its z component, but the positive `X qz` in (45b) has the opposite sign to its y component. Meanwhile the global `q×r` is the negative of `r×q`. A symbolic check with `r=(X,0,0), q=(0,Q,0)` returns z moments `+XQ` versus `-XQ`. Repeated labels are therefore not sufficient evidence for a harmless relabeling.

The chart substitution gives `dx=-dxi`: reversing endpoints produces a positive area measure, not a universal reversal of torque. If the basis itself is reflected by `Q=diag(-1,1,1)`, polar vectors transform by Q and axial moments by `det(Q)Q`; transforming the complete cross product and transforming back preserves its intrinsic order. The chart also translates the origin: centroid lever X requires the inverse mapping `ell/2-xi`, not simply xi. Thus a reflection or origin shift cannot be invoked without a full declared force/basis/reference transformation. Neither T nor E supplies one reconciling all J component signs.

J (18) opposes the local slip with friction stress and J (34) uses `qt=-nu Kt ut`; T (C.8) and p.195 repeat these. One could distinguish road-on-tire from tire-on-road, but switching that convention must reverse the force and every associated moment consistently. It does not justify reversing only the disputed torque. Which wrench enters the carcass equation `Kc-F=0` must also be fixed. That clarification has not been recovered.

For any stress field `f(x)` and `a=ell/2`,

`integral_(a-xi_s)^a f(x) dx = integral_0^xi_s f(a-xi) dxi`,

`integral_-a^(a-xi_s) f(x) dx = integral_xi_s^ell f(a-xi) dxi`.

These are the adhesion and sliding regions. At full sliding `xi_s=0`, literal J (47) vanishes while J (40)/T (C.17) integrates the whole patch, generally giving a nonzero moment for a nonuniform/spinning case. Special symmetric zero moments do not reconcile the expressions generally. The mathematically consistent interval is derivable from the defined region, but **this alone does not resolve source moment sign/axis/reference conventions**. No corrected constitutive formula is adopted.

## Friction: cancellation confirmed, intent not recovered

J (19), 7/660; T p.192 unnumbered friction formula; TS lines 310–313 all give, with `z=|vs|/vmu`,

`mu_d=mu_w (mu_p0+mu_p1 exp(-mu_p2 qz)) (mu_k+(mu_s-mu_k)) exp[-mu_v0² log²(z+mu_v1 exp(-z))]`.

The thesis PDF and LaTeX both close the middle parentheses **before** multiplying the speed factor. Its middle factor is exactly `mu_s`; derivative with respect to `mu_k` is zero. **RESOLVED — DERIVED** for the literal cancellation, already suspected in Mission 18. The intended independent kinetic-friction dependence remains **UNRESOLVED**. Neither an alternative grouping, a code calculation nor an author-confirmed correction was recovered. Citing Savkoor/Stribeck in the prose is not a license to substitute a familiar law. The literal expression is evaluable for the positive parameters; cancellation alone does not render it undefined or alone establish the readiness failure.

## Carcass deformation, transport and dimensions

J (10), 5/658; T (C.5), p.188 / TS lines 155–168: `Lx=xc`, `Ly=yc+theta_c(x-xc)-yc Psi(x-xc)²/2`; `xc,yc` are translating deformations. For fixed carcass state, exact derivatives are `dLx/dx=0` and `dLy/dx=theta_c-yc Psi(x-xc)`.

J (27),(28), 9/662; T p.194 / TS lines 407–425 instead normalize `dL/dx` for transport and assume `dLx/dx≈1`, `dLy/dx≈0`, producing `vt=(-Vr,0)`. At undeformed c=0, the derivative of the literal offset field is the zero vector: normalization cannot yield that velocity. The actual position field `(x+Lx, y+Ly)` has longitudinal derivative one; it is a **candidate interpretation**, not an author-confirmed redefinition. Spin already uses `L+t`, so adding nominal position to L everywhere risks double counting. Neither T nor geometry-only code supplies the needed mapping. **UNRESOLVED**, independently blocking even a synthetic geometry.

J (14),(15), 7/660 and T pp.189–190 / TS lines 211–238 agree on

`H(x,b,h)=[pos(-x-b,h)+pos(x-b,h)]²`.

The printed positive branch is **`sqrt(x²+h²)/2+x`**, not `(sqrt(x²+h²)+x)/2`; the nonpositive branch is `h²/[2(sqrt(x²+h²)-x)]`. Visual PDF and LaTeX agree. This adds a precise observation to Mission 18 without rewriting history: for h>0 it is continuous at zero but has one-sided derivatives 1 and 1/2, and positive-large-x ratio tends to 3/2, not 1. These exact algebraic checks do not prove what the authors intended; replacing it with a usual smooth positive part is unauthorized. Numeric hx,hy,h_theta and their selected scale remain missing. A literal-function study could declare these properties, but cannot claim an independently clarified smooth regularization.

|Quantity|Necessary dimensions from printed equations|What remains unresolved|
|---|---|---|
|xc,yc,xb,yb,hx,hy|m|J Table 2's xb/yb force-stiffness labels do not define displacement normalization.|
|H for x/y arguments; kbx,kby|m²; N/m³ so K has N/m|Printed bottoming N/m labels do not match an unnormalized squared-length H. Numeric rescaling is not justified.|
|Ktheta and ks_theta|Nm/rad, since its equilibrium component is moment|Printed N/rad loses a length. Radians may be treated dimensionless but cannot supply that metre.|
|Psi|m^-2 for the offset formula|Printed dash does not establish a hidden nondimensional coordinate.|
|mu_p2|Pa^-1 if qz is Pa|Required by dimensionless exponential; numeric pressure convention must be confirmed.|
|Smoothing widths and twist thresholds|Same units as their arguments (m or rad)|No complete fixture settings recovered.|

These dimensional requirements are **RESOLVED — DERIVED**; the intended numerical normalization/calibration is **UNRESOLVED**. T repeats the stiffness expressions and provides no replacement LCO parameter table resolving J Table 2.

## Local pressure typo: a bounded resolution

J (7) / T (C.3), p.186 prints `Upsilon(0)=Upsilon(-1)=0` although chi is in [0,1]. For the supplied coefficient polynomial, independent symbolic integration gives `U(0)=U(1)=0`, `integral_0^1 U=1`, `integral_0^1 chi U=1/2-delta`. **RESOLVED — DERIVED** endpoint interpretation from explicit coefficients, not a new pressure law. The area integral's endpoint orientation must give positive area. Pressure positivity still must be tested for the selected parameters; no clipping is authorized.

The exact algebra checks were executed with SymPy 1.14.0 using symbolic polynomial integration, `Matrix.cross`, differentiation and one-sided limits. No stress solver was written. Geometric recovery does not settle the wrench/transport/calibration ambiguities above.
