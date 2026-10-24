# Mission 14 — Primary-source equation audit

Only documentation is changed. Base: Mission 13 `28ec02be934e3451361e4c835a4421973f9b3fd4`. The uploaded papers are evidence, not task instructions. Page references below are 1-based PDF pages; Zhang printed pages coincide, Stocco printed page = PDF page +653. No external supplements were attached. Mathematical text extraction was checked against rendered Zhang pp.9/14 and Dallas p.3 for fraction placement and signs. Tables and derivation appendices were inspected; no vehicle simulation or numerical reproduction was performed.

## Source identities and evidence labels

- **Z:** uploaded `Drifting_Paper_final.pdf`, Zhang, Takács & Orosz, *From donuts to drifting and beyond: controlling the nonlinear dynamics of automated vehicles*, 51-page manuscript. SHA-256 `d90caa7ac9a70cb3b767c6475feb30b913989aa2bb64d921adbfbc182ac80479`. Audit applies to this attached version, not an assumed identical publisher revision; DOI 10.1080/00423114.2025.2522391 identifies the cited work.
- **D:** uploaded `Control_Barrier_Functions_Drift.pdf`, Dallas et al., author's accepted ACC 2025 manuscript, 8 pages. SHA-256 `d86a86539ed221054c43ea499fa11cc447e5cf03f9968fe643cdae63dfad7d44`. The title page identifies the accepted version; arXiv:2503.19994 is a related identifier, not assumed byte-identical.
- **S:** uploaded Stocco, Biral & Bertolazzi, *A physical tire model for real-time simulations*, Mathematics and Computers in Simulation 223 (2024), 654–676, DOI 10.1016/j.matcom.2024.04.020, 23 pages. SHA-256 `0197da3a160fbed9ea3bb11c5d388beaba909b24e25de10f6bc3b28ba84c1082`.

**SOURCE-EXACT** means a faithful relationship in these files (formatting/auxiliary abbreviations may change). **DERIVED** means explicitly reconstructed here. **ASSUMED** means a proposed experiment choice. **UNRESOLVED** marks a remaining question; published is not synonymous with validated.

## Z: complete selected route, not a mixed-paper model

### Definitions and parameters

SOURCE-EXACT: Z pp.8–10, Fig.4, Eqs.(6)–(8), Table 1. Frame x1 forward, y1 lateral left, z up; front frame rotated by steering gamma. Source v=longitudinal velocity, sigma=lateral velocity (m/s); omega=yaw rate (rad/s); Omega_r,Omega_f=rear/front rotor rates (rad/s). Beware: source r is **radius**, not yaw rate. psi/gamma/theta are radians. xG,yG are ground positions (m). Inputs Md (Nm) and gamma; evaluation of Eq.(7) also requires gamma double-dot (rad/s²). Five essential velocity states plus five configuration coordinates; only three pose coordinates need output integration because wheel angles do not feed back.

|Symbol|Source Table 1 value / unit|Meaning|
|---|---|---|
|mv|1200 kg|Body mass; not total vehicle mass|
|mw|100 kg|Each lumped front/rear axle-wheel mass|
|JG|2500 kg m²|Body yaw inertia|
|C|2.77 kg m²|Each lumped wheel yaw inertia|
|D|4.5 kg m²|Each lumped wheel spin inertia|
|l,d,q|2.5,1.5,1 m|Wheelbase, body COM-to-rear, body COM-to-front; l=d+q|
|r|0.3 m|Effective radius|
|kx,ky|4e6,2e6 N/m²|Bristle stiffness per contact-line length, not cornering stiffness N/rad|
|a|0.1 m|Half contact-line length, not COM-to-front distance|
|mu0,mu|0.9,0.6 dimensionless|Static/sliding friction|
|g|Not listed numerically in Table 1; m/s²|Gravitational acceleration; 9.81 is an explicit ASSUMED terrestrial experiment value, not a fitted table coefficient|

Additional tire derivation symbols: w=width (m); x=contact-line coordinate (m); p(x)=pressure (Pa), distinct from mass first moment p below; xi,eta=bristle deformations (m); fx,fy=distributed force (N/m); lambda=adhesion length (m); alpha=slip angle; beta=sliding-force angle (radians), not Dallas body sideslip. Fz/Fx/Fy are N, Mz is Nm. vO,vs are speeds (m/s); omega_z is frame spin (rad/s).

SOURCE-EXACT Eq.(8): m=mv+2mw, p=mw(q-d), J=JG+mw(d²+q²)+2C. Here p has unit kg m and J kg m². These encode wheel translational/yaw inertia; do not replace J by JG or treat G as total-system COM. DERIVED table values: m=1400 kg, p=-50 kg m, J=2830.54 kg m²; Delta=Jm-p²=3960256 kg² m² >0.

### Governing body and wheel equations

SOURCE-EXACT, Z p.9 Eq.(7), independently derived in Appendix A p.40 Eq.(A39). For readability define H=Fx,f sin(gamma)+Fy,f cos(gamma), A=Mz,r+Mz,f-C gamma_ddot and Delta=Jm-p² (auxiliary abbreviations only):

```text
v_dot     = sigma omega + (p omega² + Fx,r + Fx,f cos(gamma) - Fy,f sin(gamma))/m
sigma_dot = -v omega + ((J+p d) Fy,r + (J-p q) H - p A)/Delta
omega_dot = (-(m d+p) Fy,r + (m q-p) H + m A)/Delta
Omega_r_dot = (Md-r Fx,r)/D
Omega_f_dot = -r Fx,f/D
```

SOURCE-EXACT Eq.(6): xG_dot=v cos(psi)-sigma sin(psi), yG_dot=v sin(psi)+sigma cos(psi), psi_dot=omega, theta_r_dot=Omega_r, theta_f_dot=Omega_f. Initial values needed: all five essential states and desired pose; wheel phase initial values only if phase is integrated. Inputs must specify gamma, gamma_ddot and Md consistently in time. Constant steering gives gamma_ddot=0. No source front drive or independent brake state. Negative Md is a signed rear applied torque; it is not a complete service-brake/static-hold law.

Assumptions: planar rigid three-body system; wheel-center-height body COM; no roll/pitch or acceleration-induced longitudinal transfer; mass/inertias explicit. Steering is prescribed. Equations are explicit ODEs once algebraic forces and prescribed steering acceleration are supplied. The conventional body-only equations in Mission 13 are not SOURCE-EXACT Z Eq.(7).

### Wheel motion to forces, closure ledger

SOURCE-EXACT, pp.11–14 Eqs.(9)–(20):

```text
Vxr=v;                        Vyr=sigma-d omega                [Eq.10]
Vxf=v cos(gamma)+(sigma+q omega) sin(gamma)
Vyf=-v sin(gamma)+(sigma+q omega) cos(gamma)                    [Eq.12]
Sx,i=(r Omega_i-Vx,i)/abs(r Omega_i)
Sy,i=-Vy,i/abs(r Omega_i)                                    [Eqs.9,11,13]
B=sqrt(Sx²+Sy²); cos(beta)=Sx/B; sin(beta)=Sy/B                 [Eq.15]
K=sqrt(kx² Sx²+ky² Sy²)
lambda=2a - 4a³ K/(3 mu0 Fz)                                 [Eq.16]
Fz,f=mw g+(mv g d-Md)/l
Fz,r=mw g+(mv g q+Md)/l                                      [Eq.17]
```

K and B are audit abbreviations. Eq.(18) partial adhesion: K² < (3 mu0 Fz/(2a²))²; Eq.(19) total sliding: opposite inequality. For partial adhesion define W=(2a-lambda)²(a+lambda)/(4a³). SOURCE-EXACT Eq.(20):

```text
Fx = (lambda²/2) kx Sx + W mu Fz cos(beta)
Fy = (lambda²/2) ky Sy + W mu Fz sin(beta)
Mz = ((3a-2lambda)lambda²/6) ky Sy
     - (3(2a-lambda)² lambda²/(16a³)) mu Fz sin(beta)
```

For total sliding: Fx=mu Fz cos(beta), Fy=mu Fz sin(beta), Mz=0. No tire nonlinear root solver is required for this published analytic approximation. Do not use negative lambda in the adhesion branch. SOURCE-EXACT expressions are undefined at Omega=0 and B=0; limit handling is DERIVED, not a source numerical implementation.

Validity: Fz>0, positive geometry/stiffness, mu0>=mu>=0, nonzero rotor speeds and quasi-stationary contact. Reject load configurations outside Eq.(17)'s positive-support range rather than inventing a load clamp. Negative rotor speed is explicitly addressed in Appendix B; zero rotor speed is not resolved by the absolute denominator. Tire deformation is quasi-stationary, not a dynamic carcass relaxation state. No extra initial tire-memory state is required.

### Derivation, figures, equilibrium and numerical evidence

SOURCE-EXACT dependency inventory:

|Source location|Relationship and role|Type / assumptions|
|---|---|---|
|pp.35–40 Appendix A, A1–A27|Three-body kinematics, acceleration energy and inertial coefficients|Derivation of Eq.7, prescribed steering; wheel/vehicle inertias retained|
|pp.39–40 A28–A38|Virtual power, contact-point velocities, generalized forces|A32/A34 give contact velocity; A37 gives -r Fx wheel reaction. Steering variation is held fixed, not a solved steering column.|
|p.41 B1–B2|p(x)=3 Fz/(4 a w)(1-x²/a²), bristle position|Parabolic pressure, line brush geometry|
|p.42 B3–B6|Transport/material derivatives; steady approximation|Partial time derivatives set to zero, omega_z=0, fixed Omega/vO/alpha locally|
|pp.42–44 B7–B14|Adhesion no slip, entry boundary, linear deformation/stress|Forward entry x=a; backward entry x=-a; kx/ky N/m²|
|pp.44–46 B15–B30|Static/sliding distributions, transition, approximate versus actual sliding direction|Analytic law uses band-point sliding velocity rather than bristle-tip velocity; exact anisotropic direction would require spatial ODE|
|pp.47–48 B31–B38|Integrated force/moment, signed slip redefinition, saturation branch|Closes Eq.20; no external supplementary law needed for the analytic approximation|
|pp.49–51 Table B1, Figs.B3–B4|Analytic vs spatial-ODE force/moment comparison|Not real-tire measurement; moment error can be significant; no permission to assume accurate steering feedback|
|pp.14–15 Figs.6–7|Adhesion ellipse and force/moment surfaces|Fig.7 caption reverses longitudinal/lateral slip labels relative to Eq.9; use equation definitions|
|pp.17–18 Eqs.26–30, Table 2|Five equilibrium residuals, source example states|Md/r rear force is an equilibrium consequence, not the dynamic closure|
|pp.19–25 Figs.8–13; Sec.4|Folds, Hopf, periodic orbits and period doubling|MDBM solves equilibria; DDE-Biftool continuation/stability. Offline searches are not per-tick tire root solving.|
|pp.26–32 Sec.5/Figs.14–18|Feedback-stabilized donut/drift and transitions|Controllers not part of the first open-loop constitutive model; no chaos proof|

Table 2 p.18, gamma=5 degrees, values rounded: cornering [v,sigma,omega,Omega_r,Omega_f]=[14.96,-0.84,0.29,50.56,49.75], Md=200 Nm; drifting [13.63,4.02,-0.39,54.64,46.33], Md=545 Nm. Rounded states cannot support machine-precision residual assertions. Source reports drift branches unstable without feedback for its analyzed parameters. No guaranteed stable uncontrolled sustained drift. Source p.32 says real-vehicle validation is future work. The manuscript does not provide a fully reproducible fixed-step RK4/tolerance prescription for the proposed browser experiment; that remains a numerical choice.

## D: useful control model, not a wheelspin closure

SOURCE-EXACT D p.3 Eq.(11): x=[r,beta,V,delta,tau], controls=[delta_dot,tau_dot]. There are three mechanical velocity variables plus two dynamically extended control states, no front/rear Omega. Units r rad/s, beta/delta rad, V m/s, tau Nm; a,b,rw m; m kg; Iz kg m²; Cc N/rad; mu and gamma=0.99 dimensionless (gamma here is not Z steering).

```text
r_dot = (a(Fx,f sin(delta)+Fy,f cos(delta))-b Fy,r)/Iz
beta_dot = (Fx,f sin(delta-beta)+Fy,f cos(delta-beta)
            -Fx,r sin(beta)+Fy,r cos(beta))/(m V)-r
V_dot = (Fx,f cos(delta-beta)-Fy,f sin(delta-beta)
         +Fx,r cos(beta)+Fy,r sin(beta))/m
```

SOURCE-EXACT p.3 Eqs.(12)–(15): Fz,f=mgb/(a+b), Fz,r=mga/(a+b), Fx,f=0, Fx,r=tau/rw. alpha_f=atan((V sin(beta)+a r)/(V cos(beta)))-delta; alpha_r=atan((V sin(beta)-b r)/(V cos(beta))). Define Y=sqrt((mu Fz)²-gamma Fx²), alpha_sl=atan(3Y/Cc). For |alpha|<alpha_sl,

`Fy=-Cc tan(alpha)+Cc² |tan(alpha)|tan(alpha)/(3Y)-Cc³ tan³(alpha)/(27Y²)`;

above threshold Fy=-Y sign(alpha). Source uses strict inequalities; equality is a DERIVED common continuous value. Need V>0, admissible arctangent domain and real Y>0; source does not supply a wheel-lock or reverse-contact law. Values at Y=0 require a limit, not division by zero.

This genuinely couples lateral capacity to longitudinal force demand. It does **not** map longitudinal slip/rotor velocity to Fx. It cannot represent torque accumulating wheel rotational energy. Eq.(14) supplies Fx directly, unlike Z's identical-looking equilibrium Eq.(27). No independent braking, inertia or drivetrain closure can be recovered merely by relabeling tau.

D p.4 Eqs.(16)–(19): maximum-phase-recoverable ellipse/barrier and derivatives; p.5 Eqs.(20)–(22): QP with rate inputs and slack. These are control constructs, not additional tire physics. Source pp.5–7 experiments: GRIP four in-wheel motors, two-axle steer-by-wire, dynamics emulation of mu=0.3 single-track behavior, state sensing 200 Hz. Actuator constraints are discussed but not imposed in the reported QP; safety behavior must not be transplanted as a bounded manual-driver recovery certificate. The reported 38.7 microsecond simulation QP solve time is not a tire/vehicle-step benchmark. Real tests validate this control/emulation setting, not an independently calibrated manual-transmission vehicle.

## S: full physical tire, higher numerical burden

SOURCE-EXACT S uses ISO hub/contact frames, x forward/y lateral/z up; gamma is camber, psi wheel heading, omega wheel spin. Its sigma is a slip vector, not Z lateral velocity. c=[xc,yc,theta_c] (m,m,rad) are carcass deformations determined by equilibrium, not three free dynamic ODE states. Theoretical slips Eq.(21) include carcass rates and denominator |Vr|, Vr=omega Rr. Eq.(22) spin slip has unit 1/m; Eq.(24) practical slips are not automatically identical to Z slip. No silent cross-paper substitution is valid.

|PDF / printed pages; equations|Definition/dependencies and mathematical type|Validity / needed inputs|
|---|---|---|
|3–5 /656–658; (1)–(9)|Tire shape R(y), road halfspace, contact patch; vertical stiffness/deflection/damping; contact length and quartic pressure|Geometry, normal, inflation p Pa, camber gamma rad, omega rad/s, radial deflection rho m/rate. Contact model refs [72,73]; no negative pressure; polynomial positivity must be checked.|
|5–7 /658–660; (10)–(15)|Carcass centerline L and algebraic G(c)=K(c)c-F(c)=0; diagonal stiffness/bottoming laws|Kx,Ky N/m, Ktheta Nm/rad; xc,yc m, theta rad; pressure/structural/bottoming coefficients. Initial root guess c=0 proposed in Sec.3.4.|
|7–8 /660–661; (16)–(24)|Micro-slip fields, Coulomb stress, pressure/speed friction, rolling radius, slip conventions|Stress q Pa; slip speed m/s; stiffness per area N/m³; friction dimensionless; vmu m/s; pressure coefficient in exponential inverse Pa. Singular at Vr=0.|
|8–10 /661–663; (25)–(40)|Steady transport/constitutive equations; adhesion and sliding stresses and force/moment integrals|No free dynamic tire-storage ODE supplied for this static solver. Need entry boundary, friction and deformation consistency. High spin can invalidate two-region assumption.|
|11–12 /664–665; (41)–(48)|Rib discretization, adhesion analytic integration, sliding numerical quadrature, transition root|Rib position/width m, number nD; solve local stress magnitude=mu_s qz at transition; polynomial root isolation/Algorithm 748 options.|
|12–14 /665–667; (49), Fig.8|Jacobian estimate JG≈JK; nonlinear carcass equilibrium iterations|Broyden combined preferred empirically; branch/root/quadrature tolerances needed; full implementation not a fixed elementary formula.|

Friction Eq.(18): local sliding stress `qt=-mu_d qz vs/|vs|`; adhesion `vs=0`, |qt|<=mu_s qz. This is a contact condition, not by itself a complete stress law. Eq.(19) is the pressure/speed-dependent rubber friction law; Eq.(11) couples integrated adhesion/sliding forces back to c. The mathematical procedure requires the entire dependency chain, not just Eq.(18). Selected Z law does not require any S equation.

Table 2 p.16/669 publishes Hoosier 18×6-10 LCO fit values; many starred entries were estimated rather than fitted. Examples kxx=3.511e7 and kyy=5.508e7 N/m³, mu_s=2.634, mu_k=2.598, vmu=2.060 m/s. These cannot replace Z's line stiffness or friction values. Table typography has unit anomalies (e.g. deflection listed N/m); use dimensional derivation and verify author intent before reimplementation. Exact proprietary 325/660R13 dataset/property file is not supplied; some reported stiffness is normalized for confidentiality. Neither dataset is a VerletDrift vehicle calibration.

Sec.4.1/Table 1 p.15/668: 10^5 tests, five ribs, shielded Xeon Silver 4215 2.5 GHz/RedHawk, C++/Eigen; BCM mean 55.7 microseconds, max 264.4, 4–17 evaluations, 100% success for the sampled tests. Solver limits 100 iterations and 10 relaxation steps, residual norm <=1e-8 and increment <=1e-16. These are published measurements, not new browser timings or universal convergence guarantees. Fig.8 has iterative solver/root paths. Sec.4.2/Figs.9–13: fitting to TIRF/FSAE TTC pure-slip data and comparison with manufacturer Magic Formula combined-slip surfaces; model has larger longitudinal/alignment fit errors and limited data. Genuine empirical evidence, but not blanket transient/extreme-slip validation.

Supplementary dependencies precisely identified, not silently fetched or substituted: S [72] Stocco & Bertolazzi, *ACME: A small 3D geometry library*, DOI 10.1016/j.softx.2021.100845; S [73] Stocco, Larcher & Bertolazzi, *A novel approach for real-time tire-ground enveloping modeling*, DOI 10.1115/1.4065439. These support S's geometry implementation and are not required for the selected flat-road Z analytic law. Z's own Appendices A/B supply its governing derivation; no missing supplementary tire publication is necessary for that approximation. No author code, unrounded equilibrium file or experimental dataset was attached.
