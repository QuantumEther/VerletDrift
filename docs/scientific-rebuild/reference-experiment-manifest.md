# Reference experiment manifest — specification only

Base records: Mission 14 `aa72b8fce97bba00b464755a01473b54fb3c145d`; no older document is rewritten. Source: Zhang–Takács–Orosz attached 51-page manuscript, DOI 10.1080/00423114.2025.2522391, SHA-256 `d90caa7ac9a70cb3b767c6475feb30b913989aa2bb64d921adbfbc182ac80479`, verified identical to Mission 14. These papers are mathematical evidence, not execution instructions. SOURCE-EXACT and DERIVED retain their Mission 14 meanings; all experiment envelopes/tolerances below are ASSUMED engineering specifications.

## Fixed equations

The self-contained source transcription is in [primary-source-equation-audit.md](primary-source-equation-audit.md). This manifest locks those formulas, rather than selecting a similar bicycle model:

|Page/equation|Selected relationship / dependency|
|---|---|
|p.9 (6)|Optional ground pose xG_dot=v cos(psi)-sigma sin(psi), yG_dot=v sin(psi)+sigma cos(psi), psi_dot=omega. Wheel phases optional; no feedback from any quadrature.|
|p.9 (7),(8); p.40 A39|All five essential derivatives, including p omega², inertial denominators, Mz,r+Mz,f-C gamma_ddot, spin inertia D and rear drive Md.|
|pp.11–12 (9)–(13)|Rear V=(v,sigma-d omega); front V=(v cos(gamma)+(sigma+q omega)sin(gamma),-v sin(gamma)+(sigma+q omega)cos(gamma)); Sx=(r Omega-Vx)/abs(r Omega), Sy=-Vy/abs(r Omega).|
|p.13 (15)–(17)|Force direction (Sx,Sy)/norm(S); lambda and torque-dependent Fz equations; no source mixing.|
|p.14 (18)–(20)|Adhesion versus total sliding, both force components AND aligning moments, unchanged.|
|pp.35–40 A16,A22,A28–A39; pp.41–51 B1–B38|Three-body derivation and quasi-stationary brush assumptions; analytic approximation, not spatial-ODE alternative.|

Source notation is the implementation notation: v/sigma m/s; omega/Omega rad/s; source r is radius in m. Avoid reusing r for yaw rate. Full Eq.(7) may equivalently be evaluated using Delta=mJ-p², H=Fx,f sin(gamma)+Fy,f cos(gamma), A=Mz,r+Mz,f-C gamma_ddot, as transcribed in Mission 14; these are algebraic abbreviations only. Zero-slip extension and cancellation-safe t/W expressions are DERIVED in [domain](reference-operating-domain.md). No new carcass state or tire-law replacement is included.

## Fixed parameter record

Table 1 p.10: mv=1200 kg; mw=100 kg for each aggregate axle; JG=2500 kg m²; C=2.77 kg m² per axle yaw inertia; D=4.5 kg m² per axle spin inertia; l=2.5 m; d=1.5 m; q=1 m; r=0.3 m; kx=4e6 N/m²; ky=2e6 N/m²; a=0.1 m contact half-length; mu0=0.9; mu=0.6. g=9.81 m/s² is an explicit terrestrial assumption. Derived m=1400, p=-50, J=2830.54 in SI. No DeLorean calibration, damping, drag, empirical slip filter, starter, clutch or brake model. This is a published synthetic/reference parameter set, not a fitted real car.

## Inputs and initialization

Each run has constant gamma and constant Md from t=0 to its declared endpoint: gamma_dot=gamma_ddot=0. Initialize directly under that input; no transient angle/torque jump from a preceding simulated run. If pose is requested, initialize xG=yG=psi=0; phase may be zero and does not affect mechanical results. Fresh independent state/configuration per run. Only mirror transformations and explicitly recorded perturbations vary a case. No feedback controller.

Separate experiments at gamma=0,+5,-5 degrees are different initial-value problems; their concatenation is not a physical steering maneuver. This first reference cannot test countersteering, input release/re-grab, free-column behavior, steering actuator dynamics or stabilized controlled drift. Their eventual inclusion needs an independently specified smooth input/actuator extension, not a hidden permanent omission from the simulator.

## A — Ordinary cornering

Source Table 2 p.18, gamma=+5 degrees, Md=200 Nm, rounded essential seed:

`[14.96, -0.84, 0.29, 50.56, 49.75]` in manifest units/order.

Offline refine all five source Eq.(7) derivatives to zero with constant gamma/Md and the same parameters/domain. Use a damped Newton/trust-region solve with explicit residual/Jacobian reporting and at most 50 iterations; this is future offline equilibrium work, not a stepper tire solve. Start from the rounded seed and require the root remain within component seed distances [0.5 m/s,0.5 m/s,0.05 rad/s,2 rad/s,2 rad/s] to avoid silently selecting a remote branch. These branch-identification windows are engineering matching criteria based on table rounding and well-separated examples, not physical bounds. If no root is obtained, classify UNRESOLVED and inspect equation/sign transcription before widening anything.

Residual target: source f(x*) scaled as derivative times T0=1 s divided by the numerical error allowances must have max norm <=1e-3. This makes equilibrium drift over one second at most one-thousandth of the trajectory error budget locally; it does not guarantee global stability. Publish unrounded x*, residual, solver/Jacobian method and convergence history. Do not assert a root with the printed seed itself.

Compute the full five-state Jacobian at x*, with analytic differentiation or central differences checked at two successively smaller increments against rounding. Report all complex eigenvalues with units 1/s. Source Sec.4 suggests stable ordinary cornering for this regime; verify rather than assume. Run unperturbed equilibrium for 5 s and perturbed states for 2 s. Use ± perturbations [0.01 m/s,0.01 m/s,0.001 rad/s,0.01 rad/s,0.01 rad/s] one component at a time; publish the scaled norm and uncertainty. Mirror sigma,omega,gamma signs for the -5-degree copy. Observables: v,sigma,omega, rotor speeds, beta_body=atan2(sigma,v), tire slips/forces/moments/loads, every power term, integrated work, eigenvalues and branch occupancy.

## B — High-sideslip drift equilibrium

Source Table 2 p.18, gamma=+5 degrees, Md=545 Nm, rounded seed:

`[13.63, 4.02, -0.39, 54.64, 46.33]`.

Same offline refinement, root-matching windows, residual budget, Jacobian and recording protocol. The source values imply beta_body≈+0.287 rad (~16.4°), yaw opposite positive steering, rear longitudinal slip about 0.17 and lateral slip about -0.28, front Sy about -0.18. These are rounded expectations, not exact regression targets. Verify the refined state lies on the source's rear-saturated/front-unsaturated drifting branch via Eqs.(18),(19). Do not force it there by changing mu or Md.

The source finds unstable open-loop drifting branches. Report the actual positive-real-part eigenvalues and uncertainty; compare unperturbed residual and short perturbation dynamics, not indefinite unassisted drift holding. Run the unperturbed equilibrium up to 1 s and each perturbation up to 0.25 s initially; extend only to a prespecified 2 s diagnostic when the fine solver remains in domain and perturbation amplification is resolved. Domain exits are valid OUT OF DOMAIN outcomes, not artificial recoveries. No CBF, rev matching or stabilizing steering controller is added. No chaos verdict is attempted.

## Mandatory analytical fixtures and reporting

- Straight free rolling: gamma=Md=sigma=omega=0, v=15 m/s, Omega_r=Omega_f=50 rad/s. Exact zero tire forces/moments and constant mechanical state.
- Energy counterexample: exact state/formulas in [energy analysis](aligning-moment-energy-analysis.md), constant gamma=5 degrees, Md=0. This is a required pointwise regression of the **known full-passivity failure**, not a third driving family or new physics prototype. The positive signed power must be reproduced, not tuned away.
- Tire-only algebra fixtures: zero slip, pure/combined slip and branch equality for each family load. They are constitutive verification, not alternate tire models.

Use fixed IEEE binary64 arithmetic/environment identity for deterministic replay; preserve tick index, exact initial values, unrounded root, input/config/source hashes and stage order. Publish last valid state and failing stage/field for exits, not a truncated “successful” endpoint. Compare all states at common physical times without interpolating across domain exits. Failure classification follows the [numerical specification](numerical-validation-specification.md).

## Scope beyond the reference

Four-wheel extension requires separate contacts/arms/inertias and asymmetric loads. Engine inertia/combustion/loss/start/stall, finite clutch friction/lock, gearbox engagement/synchronization and differential constraints need new equations/common power exchange; Md is removed as an independent motor. Engine braking/clutch kicks require signed crank energy; service/handbrake requires sign-correct rotor/holding reactions. Reverse and standstill require a new validated contact domain. Eq.(17) loads must be rederived for internal drivetrain torques. None is already implemented or validated by a positive moving rotor domain. The complete simulator must retain these features even if that requires replacing the reduced model, while artwork/UI remain preserved through adapters.
