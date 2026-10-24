# Mission 18 — Stocco source readiness (Gate Zero)

## Verdict: SOURCE BLOCKED

No tire solver, placeholder implementation, 42-case outputs, validation report or benchmark was created. Conditional implementation authorization was not triggered. This gate concerns the currently available source and the specified fixture, not a finding that Stocco's actual software or physical model is unusable.

Branch `scientific-rebuild/05-stocco-tire-experiment`, base `24f2a5d7fc976db025f6e6be22dadf48efe0d944`. Reviewed the six Mission 18 authority documents, particularly [Mission 17 experiment specification](next-experiment-specification.md) and [architecture decision](tire-architecture-decision.md). Historical records, the Zhang reference and all production systems are unchanged.

## Primary evidence and method

Full 23-page publication: Stocco, Biral & Bertolazzi, *A physical tire model for real-time simulations*, Mathematics and Computers in Simulation 223 (2024), 654–676, DOI [10.1016/j.matcom.2024.04.020](https://doi.org/10.1016/j.matcom.2024.04.020). Attached PDF SHA-256 `0197da3a160fbed9ea3bb11c5d388beaba909b24e25de10f6bc3b28ba84c1082`, identical to the earlier missions' source. PDF page n corresponds to printed page n+653.

Text was extracted for equation/reference searches; crucial typesetting was visually inspected on PDF pp.4,7,10,11,12,16, including Eq.(19), Table 2 and the moment expressions. Figures 1–8 and Tables 1–2 establish the geometry, regions and solver context; Fig.11 p.17 establishes the actual Hoosier loads. No formal derivation appendix or attached numerical parameter supplement was found in the supplied PDF. It contains no embedded files and no identified supplement/code/data hyperlink. This is not an assertion that author materials do not exist elsewhere. A bounded attempt to access the DOI landing page returned proxy tunnel HTTP 403, so publisher supplements/errata could not be independently checked. No author was contacted and no commercial code/dataset was obtained.

**SOURCE-EXACT** identifies a printed relationship or value, not necessarily a consistent complete system. **DERIVED** is an explicit dimensional/algebraic consequence. **ASSUMED** is an ordinary declared experiment/numerical choice. **UNRESOLVED** means missing fixture data or conflicting interpretation. BLOCKING means indispensable for this authorized experiment; NONBLOCKING means it limits calibration/reproduction claims or is a permissible numerical choice once closure is available.

## Traceable equation and quantity inventory

|PDF / printed page; equations|Relationship and required quantities|Status and gate significance|
|---|---|---|
|3 /656; (1), Fig.1|Axisymmetric tire set sqrt(x²+z²)<=R(y), y in tread interval; hub axes x longitudinal, z up, y right-handed|SOURCE-EXACT model family. Actual Hoosier R(y), endpoints/width and rim/hub geometry UNRESOLVED; BLOCKING. Nominal size does not specify a crown/profile.|
|3 /656; (2), Fig.2|Road halfspace through point p with normal n; contact patch tire/plane intersection, centroid O and frame|SOURCE-EXACT. Flat plane and zero camber are ASSUMED authorized inputs. Hub placement/deflection still depends on the profile; BLOCKING as fixture.|
|4 /657; (3)–(5)|kz=ksz+kpz*p+komega_z*omega+kgamma_z*gamma²; Fz=kz rho+cz rho_dot+kbz max(0,rho-rho_b); lateral deflection varrho(y)|SOURCE-EXACT. Specified Fz=667 N and steady rho_dot=0 are admissible design choices. Exact inflation p and geometric varrho are not supplied for the selected fixture; cannot uniquely derive contact geometry.|
|4 /657; (6)|ell(y)=2 sqrt([2(R(y)-Rell)-varrho(y)]varrho(y)); Rell represents belt/contact transition radius|SOURCE-EXACT; Hoosier Rell missing from Table 2 and identified text; BLOCKING. Setting it to zero would change a physical geometry parameter.|
|4–5 /657–658; (7)–(9)|Quartic pressure shape Upsilon(chi); qz=Fz/AP*Upsilon(ell/2-x over ell); AP from lateral integration of ell|SOURCE-EXACT coefficients given. Geometry required to evaluate AP/pressure: BLOCKING. Pressure-shape positivity must be checked, not clipped. Boundary/orientation notation issues noted below.|
|5–7 /658–660; (10)–(15)|Carcass c=[xc,yc,theta_c], Lx=xc, Ly=yc+theta_c(x-xc)-yc*Psi*(x-xc)²/2; G(c)=K(c)c-F(c)=0; structural/pressure/bottoming stiffness and smoothed positive part|SOURCE-EXACT formulas and many coefficients. Smoothing h_x,h_y,h_theta and dimensional interpretation not fully specified for this fixture; UNRESOLVED. No arbitrary replacement by hard bottoming.|
|7 /660; (16)–(18)|Tangential stresses qt and slip vs; adhesion vs=0, |qt|<=mu_s qz; sliding qt=-mu_d qz vs/|vs||SOURCE-EXACT local contact condition, not by itself a complete tire law. Needs kinematics and constitutive equations below.|
|7–8 /660–661; (19)|Pressure/speed-dependent rubber friction, mu coefficients, qz, |vs| and vmu|SOURCE-EXACT literal typesetting can be read; physical intention of its cancelling mu_k factor UNRESOLVED. Do not silently substitute a familiar Savkoor expression.|
|8 /661; (20)–(24)|Bristle kinematics, theoretical longitudinal/lateral slip, spin phi, rolling radius Rr=R-varrho/3; practical slips|SOURCE-EXACT. omega is rotor rad/s, psi_dot heading rad/s, gamma camber rad; sigma dimensionless, phi inverse metres. Rr varies with rib geometry; geometry gap prevents unique hub velocities for the 42 cases.|
|8–9 /661–662; (25)–(33)|Steady material transport, straightened bristle paths, adhesion integration and leading-edge zero deformation; xi=ell/2-x|SOURCE-EXACT assumptions: partial time derivative neglected, small carcass/camber angles. Mapping of deformation L versus actual centerline in (27)–(28) requires clarification; see below. Not a full transient storage ODE.|
|10 /663; (34)–(36)|qt=-nu Kt ut, stiffness tensor with kxx,kyy and small cross terms; integrate adhesion stresses|SOURCE-EXACT. nu dimensionless, ut m, Kt N/m³, qt Pa; paper supplies Table 2 values. Needs complete contact/strain fields.|
|10 /663; (37)–(40)|Adhesive/sliding integrated moments and friction direction; dt=-vs/|vs|; Fs=integral mu_d qz dt|SOURCE-EXACT printed equations conflict with subsequent component moment signs; BLOCKING for faithful wrench/power interpretation.|
|11 /664; (41)–(43), Figs.6–7|Conical-frustum ribs, centers yi, widths wi, radius R(yi), local contact length/coordinate|SOURCE-EXACT method. Counts 5/10/20 ribs are ASSUMED authorized discretizations, not the missing physical profile.|
|11–12 /664–665; (44)–(47)|Adhesive force integration 0..xi_s; sliding force integration xi_s..ell; force and all component moment integrals|SOURCE-EXACT typesetting has conflicting cross-product signs/region limits and repeated moment labels; BLOCKING as detailed below.|
|12 /665; (48)|Transition satisfies qx²+qy²=(mu_s qz)²; polynomial root methods suggested|SOURCE-EXACT. First encountered adhesion/sliding transition follows physical narrative; high spin can invalidate two-region assumption. Root isolation/tolerance/topology checks remain required numerical decisions, not force corrections.|
|12–15 /665–668; (49), Secs.3.4–4.1, Fig.8, Table 1|Three-variable nonlinear equilibrium; JG=JK-JF approx JK; c0=0 initial guess; Broyden combined, transition roots and sliding quadrature|SOURCE-EXACT procedure/initialization; 100 iterations/10 relaxation steps in published comparison. Norm units/scales, root uniqueness and fail policy require ASSUMED numerical specification; caps do not prove convergence. No solver created.|

Source coordinate distinction is essential: gamma here is camber (not Zhang steering), omega is wheel spin (not Zhang yaw), Psi is carcass shape, phi is normalized spin, p is pressure (not a mass first moment). For steady carcass/zero camber, Eq.(21),(22) reduce to sigma_x=(Vr-Vx)/|Vr|, sigma_y=-Vy/|Vr| and phi=-psi_dot/|Vr|. This DERIVED input mapping does not determine Vr until R(y)/varrho are supplied.

## Preferred fixture: available values and missing dependencies

SOURCE-EXACT Table 2 p.16/669 identifies Hoosier 18×6-10 LCO, with many starred parameters estimated rather than fitted. Fig.11 p.17/670 includes Fz=667 N among 222/444/667/890/1120 N at zero camber. The author's exact inflation/profile/contact record is not provided there. Fig.10's 225 kPa normalization concerns the **other 325/660R13 tire**; it is not evidence of Hoosier inflation.

|Table 2 group|Printed numerical values|Units/status for evaluating a fixture|
|---|---|---|
|Vertical stiffness/damping|ksz=1.451e5; kpz=0.688; komega_z=1.097; kgamma_z=3.585e4; kbz=1e8; rho_b=0.076; cz=200|SOURCE-EXACT numbers. Structural/bottoming N/m, pressure coefficient N/(m Pa), damping N s/m; camber-power unit notation needs dimensional care.|
|Longitudinal carcass|ksx=6500; kpx=0.9; kbx=1e7; xb=0.05|SOURCE-EXACT numbers; bottoming/unit normalization issues below.|
|Lateral carcass|ksy=10000; kpy=0.121; kby=1e7; yb=0.055|SOURCE-EXACT numbers; same issue.|
|Twisting carcass|ks_theta=1000; kp_theta=0.0575; kb_theta=1e6; theta_b=0.12|SOURCE-EXACT numbers. Torque/angle versus printed force/angle units require resolution for SI fixture.|
|Shape/pressure/void|Psi=2.943; lambda=4.046; delta=0.001993; nu=1|SOURCE-EXACT numbers; lambda/delta here are pressure shape parameters, not Zhang adhesion length. Geometry is still absent.|
|Tread stiffness|kxx=3.511e7; kyy=5.508e7; kxy=kyx=0|SOURCE-EXACT, N/m³; not Zhang's line stiffness N/m².|
|Friction|mu_w=1; mu_s=2.634; mu_k=2.598; vmu=2.060; mu_p0=0.201; mu_p1=0.7109; mu_p2=7.043e-7; mu_v0=1.034; mu_v1=0.101|SOURCE-EXACT numbers. Friction factors dimensionless except vmu m/s, pressure-exponent mu_p2 must be inverse pressure; Table 2 groups it under a dash.|

### Blocking versus nonblocking

|Indispensable item or evidence|Classification / reason|
|---|---|
|Hoosier R(y), lateral extent/contact width and actual profile|**BLOCKING**; Eq.(1),(6),(23),(41) need it. Nominal diameter/width do not identify a crown, belt/contact shape or rib radii.|
|Rell and complete contact/deflection construction|**BLOCKING**; Fz alone does not provide ell(y), AP or local qz. No Table 2 value found. Giving a patch length from another model would substitute physics.|
|Incompatible printed moment relations|**BLOCKING** independently of geometry; different literal interpretations produce different Mz/carcass equilibrium and power.|
|Exact Hoosier inflation|Blocks authors' exact fixture, but **NONBLOCKING in principle** for a declared synthetic test if all essential physics/geometry were supplied. No pressure chosen because that would not resolve the blocking items.|
|Road normal/height, Fz=667, zero camber, prescribed spins/slips|**ASSUMED admissible inputs**, not missing empirical constants. Flat road placement can be chosen once the profile/deflection convention is known.|
|Carcass rates in the proposed stationary test|Setting rates to zero is a declared steady experiment assumption, not a hidden transient state. Does not resolve geometry or moment ambiguities.|
|Smoothing widths, coefficient normalization and kinematics interpretation|**UNRESOLVED**, required for an unambiguous full source fixture; must be documented/clarified, not fitted to converge. Even if permissible numerical choices resolve these, the independent blockers remain.|
|Rib locations, quadrature/root tolerances, residual scaling|Ordinary **ASSUMED numerical choices**, NONBLOCKING in principle; must be frozen and converged after source readiness.|
|Raw TTC experimental points and uncertainty|**NONBLOCKING** for mathematical model evaluation, but blocks independent empirical reproduction of Fig.11's fit. Plot readings are not unrounded data.|
|One author-computed force/moment/residual fixture|Its absence is NONBLOCKING for evaluating a genuinely complete system; highly useful for resolving the actual ambiguities here. No such numerical fixture accompanies the supplied file.|
|No global dynamic storage/passivity theorem|**NONBLOCKING** for a transparently limited steady mathematical experiment; would require GLOBAL PASSIVITY: UNRESOLVED, not a fabricated reservoir or a pass.|

## Precise typesetting and dimensional checks

### Moment sign and interval conflicts — visually confirmed

Eq.(37) p.10/663 prints `integral qt cross (L+xi)`; Eq.(40) uses the same order for sliding. Eq.(45c) p.11/664 instead has the component `qy*(Lx+ell/2-xi)-qx*(Ly+yi)`, which is **position cross force** in the usual right-handed axes. For lever arm (X,0,0) and stress (0,Q,0), the two give -XQ and +XQ for the same z component. This is a direct algebraic mismatch under a shared right-handed force/reference definition, not a numerical integration error. The chart xi=ell/2-x reverses the longitudinal coordinate; an explicitly transformed basis/component convention could matter, so a chart transformation must be established rather than assuming all printed components share an unchanged basis. Force-on-road versus force-on-tire and chart/basis orientation could affect conventions; no complete intervening transformation reconciling these expressions was established in this gate. This is not a claim that the authors' software uses the wrong sign. Silently selecting one would not be a faithful unambiguous transcription.

Eq.(44) defines adhesion over 0..xi_s; Eq.(46) defines sliding over xi_s..ell. Eq.(47a–c) p.12/665 nevertheless prints sliding moment integrals over **0..xi_s**. With full sliding xi_s=0, those printed integrals vanish, whereas Eq.(40)'s full sliding-region moment need not vanish for spin/asymmetric pressure. Equality can occur in special symmetric cases but does not reconcile the formulas generally. Eq.(45b)/(47b) also repeat the x-moment label despite describing a different coordinate arm. Do not silently change limits/signs/labels and then declare source-exact reproduction. A corrected equation or author reference output/convention is needed.

### Eq.(19): readable literal law, author intent not established

Visual inspection distinguishes a typography issue from missing text. With s=|vs| and z=s/vmu, the literal printed expression is

`mu_d=mu_w*(mu_p0+mu_p1 exp(-mu_p2 qz))*(mu_k+(mu_s-mu_k))*exp[-mu_v0² log²(z+mu_v1 exp(-z))]`.

**DERIVED:** its middle factor simplifies to mu_s, so mu_k cancels. This does not make the literal formula mathematically undefined for Table 2's positive log argument. It does make silently moving parentheses to a more familiar static/kinetic interpolation unjustified. A literal-law study could state this behavior; reproducing the authors' intended friction function requires clarification. This observation alone is not used to force SOURCE BLOCKED; geometry and moment conflicts already suffice.

### Other issues: do not turn every printing problem into a false blocker

- Eq.(7) p.4/657 prints Upsilon(-1)=0 while describing edges chi=0,1. Its supplied coefficients satisfy Upsilon(0)=Upsilon(1)=0 and unit integral. The coefficient expressions offer an algebraically checkable resolution of the edge typo; this alone need not block pressure-shape evaluation. Actual pressure positivity still needs validation.
- Eq.(10) gives deformation offset Lx=xc. Eq.(27),(28) use a centerline derivative with dLx/dx approx 1. If xc is the global carcass coordinate held fixed along the patch, its derivative is zero; actual position x+xc would have derivative one. Deformation versus position mapping needs explicit confirmation before implementing material transport/spin, rather than silently adding x to Eq.(10).
- Eq.(15)'s smoothed positive part has length units for translational arguments, and its squared bottoming function has m². In Eq.(14), a coefficient multiplying that function to yield stiffness N/m would require N/m³; Table 2 labels the translational bottoming coefficient N/m. Likewise xb/yb are displacements (m), not the printed N/m; twisting equilibrium requires Nm/rad; mu_p2 qz is dimensionless, requiring inverse Pa if qz is Pa. These are **DERIVED dimensional requirements**, not permission to rescale the printed values. Confirm the authors' numerical normalization/units where necessary.

## Why a synthetic fixture does not cross this gate

An independently chosen pressure or hub speed is ordinary experiment design. Selecting a new cylinder/toroid R(y), belt transition radius or arbitrary contact-patch width is selecting missing physical geometry; changing moment signs/regions is selecting an unresolved constitutive interpretation. Those are exactly the substitutions prohibited by Mission 18. Neither using 667 N directly, reusing Zhang's patch parameters nor inferring a full tread profile from “18×6-10” removes these dependencies. The source family is parameterizable, but the authorized no-invented-geometry fixture is not currently closed.

## Available evidence, permissions and minimal unblock package

The article is CC BY-NC-ND 4.0 as printed on p.1. That does not establish a license for unprovided author code or access to TTC/manufacturer data. No licensed code/data was copied; equation analysis does not require importing a proprietary implementation. Lack of raw experimental data is not being treated as a universal implementation ban.

Minimal requested material, without contacting anyone now:

1. One complete numerical fixture at 667 N/zero camber: R(y) or an author-supplied equivalent rib/profile record, width/extent, Rell, inflation and pressure units, hub/road placement or deflection/ell(y)/Rr construction consistent with Eqs.(1)–(9),(23),(41). Include missing smoothing/normalization choices needed by the selected coefficients.
2. An author-confirmed convention/correction reconciling Eq.(37)/(40) with Eq.(45)/(47), including sliding limits, moment reference point and action/reaction signs; clarify L as deformation versus actual position in Eq.(27)/(28), and the intended Eq.(19) grouping.
3. Preferably one unrounded output with Fx,Fy,Mz,c,residual and contact-region coordinates for that fixture, plus permission/license for any supplied code/data. The numeric output is a consistency check, not a replacement for the governing definitions.

Related geometry sources precisely identified by the paper: [72] Stocco & Bertolazzi, *ACME: A small 3D geometry library*, DOI 10.1016/j.softx.2021.100845; [73] Stocco, Larcher & Bertolazzi, *A novel approach for real-time tire-ground enveloping modeling*, DOI 10.1115/1.4065439. A generic geometry library cannot determine an unspecified Hoosier profile or repair moment conventions. No broad literature search or substitute model was undertaken.

Gate outcome: **SOURCE BLOCKED**. Stop before implementation; preserve the exact 42-case proposal without claiming any case was solved.
