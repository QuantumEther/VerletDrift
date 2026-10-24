# Mathematical closure and power audit

Labels and SOURCE-EXACT equations/units are in the [equation inventory](primary-source-equation-audit.md). This document distinguishes analytical derivations from proposed numerical policy. No simulations or fitted measurements were produced.

## Is the selected system closed?

On Fz,f>0, Fz,r>0, |r Omega_i|>0 and nonzero slip norm, yes: Table 1 plus g, five velocity states and a prescribed input history (Md,gamma,gamma_ddot) determine loads (17), center velocities (10,12), slips (11,13), angles/adhesion (15,16), force/moment (20), then every derivative (7). Eq.(6) provides optional pose/phase derivatives. No unknown Fx is left to a root solve. No engine, brake or transient tire variable is secretly required for this source system.

At zero slip, divisions in beta are removable **DERIVED** limits: Fx=Fy=Mz=0, lambda=2a. Evaluate the analytic limit, not a chosen arbitrary beta force. At zero wheel speed, slips diverge; a finite locked-wheel sliding limit for nonzero contact velocity can be DERIVED from Eq.(20): force tends to `-mu Fz (Vx,Vy)/hypot(Vx,Vy)`, moment zero. At simultaneous zero center velocity and zero rotation, approach-dependent slip forces generally have no unique limit. The source is not a complete standstill/static-friction differential inclusion. This is an essential limitation for the later manual simulator; the first reference can explicitly exclude it.

Loads remain positive only for

`-mv g q-mw g l < Md < mv g d+mw g l`.

This is DERIVED from (17), not a clamp. Table 1 l=q+d and m>0, D>0, Delta=Jm-p²>0 are preconditions. Outside this domain the no-lift/no-pitch model must be rejected, not patched with negative loads or silent saturation.

Equilibria can be multiple even though a derivative is unique at a regular state. MDBM equilibrium searches and bifurcation continuation occur offline. Do not import their iterations into tire evaluation. Rounded Table 2 states are test seeds, not exact roots.

## Coordinates, dimensions and signs

Map Mission 13 u,v,r to source v,sigma,omega; source radius r maps to R. Source gamma maps to steer delta; source a maps to half contact length, not front COM arm. Dallas beta is body sideslip; Zhang beta is sliding-force direction. Stocco gamma is camber and sigma is tire slip. The exact Eq.(7) includes wheel translation and yaw inertia through m,p,J; a single body inertia with the same numerical value is not an exact rewrite.

DERIVED dimensions: K=sqrt(kx² Sx²+ky² Sy²) is N/m². a³ K/Fz is m; lambda² kx is N; a³ ky is Nm; W is dimensionless. The adhesion threshold is a slip-space ellipse, not itself a longitudinal constitutive law. Md/l is N. Delta is kg² m². Each term of Eq.(7) has m/s² or rad/s²; D Omega_dot and r Fx are Nm. Dallas gamma=0.99 is dimensionless and its radicand is N²; Stocco kxx N/m³ is not Zhang kx N/m².

For each selected tire let c=(Vx-r Omega,Vy), h=|r Omega|, S=(Sx,Sy), so c=-h S. Positive drive slip produces Fx>0, positive lateral wheel motion gives Sy<0 and Fy<0. Rotor equation D Omega_dot=Md-r Fx transfers equal/opposite tire reaction; front Md=0. Under ideal straight rolling Vx=r Omega, Vy=0, tires give zero force/moment and constant free motion. Negative slip gives braking reaction; negative Omega is explicitly permitted but Omega=0 is not defined by using abs(). Negative applied torque is not automatically a correct brake near rotor sign changes.

Left/right mirror transformation: sigma,omega,gamma and gamma_ddot change sign, v/Omega/Md unchanged; Sy,Fy,Mz change sign while Sx,Fx/Fz do not. Eq.(7) is equivariant. Straight symmetric source states therefore cannot acquire yaw. All stage tire evaluations must read one common state; no sequential cross-wheel mutation exists in this reference.

## Contact force passivity: what is established

DERIVED translational/spin contact power is `Pforce=Fx(Vx-r Omega)+Fy Vy=-h(Fx Sx+Fy Sy)`.

In adhesion,

`Fx Sx+Fy Sy=(lambda²/2)(kx Sx²+ky Sy²)+W mu Fz sqrt(Sx²+Sy²) >=0`;

in total sliding it is `mu Fz sqrt(Sx²+Sy²)>=0`. Thus the force/rotor contribution is dissipative when stiffness/friction/load are nonnegative and the correct branch is used. Sign/dimension checks establish no tire calibration accuracy.

For positive load and mu<=mu0, the adhesion stress is within the local static limit and the sliding stress within it; the integrated force magnitude has conservative bound mu0 Fz. Total sliding magnitude is exactly mu Fz. Do not use sliding mu Fz as a universal peak cap when mu0>mu. Force branches meet at lambda=0. Near zero slip leading force slopes are 2a² kx and 2a² ky (N per dimensionless slip). No load-independent “peak slip” parameter is implied.

No transient tire storage coordinate is retained: quasi-steady elasticity is algebraically eliminated. It cannot explain arbitrary positive force work through a missing elastic-energy account. Conversely, the above force inequality is not a proof that every generalized moment/steering exchange in the full reduced model is passive.

## Total kinetic energy and aligning/steering work

For constant steering, DERIVED from the three-body kinetic sum:

`E= m(v²+sigma²)/2 + p sigma omega + J omega²/2 + D(Omega_r²+Omega_f²)/2`.

The cross term is essential because G is the body COM, not necessarily total-system COM. With steering rate s=gamma_dot, front wheel yaw energy also contributes `C omega s + C s²/2`. Do not use the Mission 13 body-only energy formula unchanged.

For constant gamma, substituting Eq.(7) gives

`E_dot=Md Omega_r + sum(Pforce_i) + (Mz,r+Mz,f) omega`.

Source Appendix A's virtual-power calculation holds steering variations fixed. For time-varying prescribed steering, the actuator enforcing gamma supplies/removes work; the -C gamma_ddot term and front aligning moment cannot be ignored. That port must be derived explicitly before claiming a closed full mechanical energy ledger for changing steering.

**UNRESOLVED limitation:** Appendix B sets local omega_z=0 and approximates sliding direction, yet applies its aligning moments to a yawing vehicle. Force-only dissipation does not prove sign of `Pforce+Mz omega_z`. The source supplies no global passivity theorem for this approximation. Appendix B pp.49–51 shows relatively large moment discrepancies, including nonzero more-accurate total-sliding moments where the analytic approximation gives zero. Do not claim total-contact passivity just from the force proof, delete Mz without declaring a model variant, or add yaw damping to repair it. Constant-steer reproduction can measure the full residual/moment contribution; broader power validity needs analytical bounds or explicitly limited approximation scope. This is one readiness condition, not a demonstrated claim that all source trajectories create energy.

## Numerical regularity and bounded cost

Regular-state constitutive evaluation is explicit and piecewise; static/sliding contrast gives nonmonotone peaks and can create real dynamic instability. Derivatives change across branch boundaries; do not assume global smoothness or RK4 fourth-order convergence there. As Omega approaches zero, slip derivatives become large even where the force remains finite. Cornering equilibria avoid many singularities, but a brake-to-lock or restart does not.

DERIVED rolling straight-mode scale at source parameters: longitudinal force slope Kx=2a² kx=80000 N. With Vx approximately frozen at rolling, dSx/dOmega≈1/Omega, giving rotor relaxation rate r Kx/(D Omega)=1600/v per second (v in m/s). At 15 m/s approximately 107/s; at 1 m/s approximately 1600/s. This local linear scale omits chassis coupling and is not a measured stability bound, but demonstrates why a fixed RK4 stage count alone cannot justify 100 Hz near stopping. Integrator choice and tested operating domain remain prerequisites.

Two tire force/moment evaluations per RHS; provisional RK4 costs eight per macro-step, no nonlinear roots in the chosen analytic law. If fixed substeps are required, count 8N for chosen N and disclose the domain/error evidence. No timing has been measured here. Stocco's nonlinear equilibrium iterations and measured C++ times answer a different cost question.

## Future manual drivetrain: compatibility and required changes

The source rotor equation is a mechanical seam because both angular momentum and -r Fx reaction exist, not merely because Md accepts a number. Split aggregate rear mass/inertia/contact into individual L/R wheels with physically derived distribution; add front wheels and track arms; reassemble body/rotor mass and load equations. An open differential imposes Omega_c=(Omega_L+Omega_R)/2, equal side torques in the ideal massless case. Signed gearbox ratio G connects input to carrier: Omega_in=G Omega_c, output torque=G input torque, preserving ideal power. Add engine/input/carrier inertias once each, finite clutch slip torque and capacity, synchronization and actual gear engagement states.

Remove the external Md motor as a simultaneous authority. Engine torque/loss/starter work act on crank; clutch and shaft constraints exchange equal/opposite impulses, with heat from relative slip. Rear tire/brake/clutch constraints need a consistent simultaneous or validated partitioned solve; do not solve scalar contacts then overwrite RPM. Starting/stall modes need signed crank state; reverse requires signed ratio and zero-speed contact treatment; engine braking/clutch kicks need retained rotational energy. No source paper here supplies that complete gearbox model.

Crucially Eq.(17)'s load transfer from applied external Md cannot be reused by inserting arbitrary internal clutch torque. Re-derive whole-vehicle pitch/support reactions for the new drivetrain and COM assumptions, even if pitch is constrained. Steering-column dynamics likewise replace prescribed gamma/gamma_ddot with actuator/column states and reaction work. These are later architecture changes, not input substitutions. They do not make manual transmission structurally impossible, but they prevent claiming it is already designed/validated by this source.

## Missing closure inventory

|Item|Status / disposition|
|---|---|
|Regular-state source force, rotor and body derivatives|Closed, SOURCE-EXACT as inventoried|
|Zero slip beta|Removable limit DERIVED; must encode/test deliberately in future|
|Zero Omega with nonzero motion|Sliding limit DERIVED; reject crossing in initial domain unless explicitly approved|
|Full standstill/lock/reverse crossing|UNRESOLVED static-contact formulation; outside first moving reference, required later|
|Changing steering rate/acceleration and actuator work|UNRESOLVED experiment protocol/full power port; constant-steer first reduces scope|
|Moment-level passivity of spin-neglect approximation|UNRESOLVED; quantify/justify before a broad physical-consistency claim|
|Numerical step/domain/tolerances|ASSUMED choices to freeze, then verify by convergence|
|Real car calibration/experimental fidelity|UNRESOLVED; not necessary to reproduce Table 1 as a synthetic source reference|
|Engine/clutch/gear/differential/start/brakes|Absent intentionally from first reference, not optional for eventual simulator|

Verification performed in this mission: an independent SymPy simplification of the constant-steer body kinetic derivative from Eq.(7) gives exactly `v Fx_body + (sigma-d omega) Fy,r + (sigma+q omega) H + omega(Mz,r+Mz,f)`. Rotor reaction/drive work then yields the stated full identity. The symbolic residual is zero; the Table 1 inertia determinant was independently checked as 3960256 kg² m². These are algebra checks, not simulated trajectories, tire data validation or a proof of total moment passivity.
