# Reference implementation readiness

## Verdict: CONDITIONALLY READY

One complete published foundation is identifiable: **Zhang–Takács–Orosz's attached five-DoF model and analytic anisotropic combined-slip brush law**, Eq.(6)–(20), Table 1, with derivations A1–A39 and B1–B38. Source accessibility and longitudinal wheel-slip closure are resolved. Numerical/domain and full-power decisions below must be settled **before implementation**; no implementation is authorized by this mission.

Dallas is not the governing torque-driven reference. Stocco is not combined into the selected equations. Earlier Mission 13 records remain unchanged; [decision update](architecture-decision-update.md) supersedes their provisional source choices.

## Reproducible specification boundary

Use the exact source body/rotor Eq.(7), including p, J, aligning moments and prescribed steering acceleration; source load Eq.(17), not static Dallas loads; and force Eq.(20) with slips (11,13). Optional pose quadrature is Eq.(6); wheel phases can be omitted when not used. Essential state order [v,sigma,omega,Omega_r,Omega_f]; include initial pose for visual output data only. There is no transient tire storage state. Fixed gamma/Md gives an autonomous five-state system; feedback/time-varying controls require consistent input derivatives and actuator-work accounting.

Use all Table 1 coefficients as given in the [equation audit](primary-source-equation-audit.md). Explicitly choose terrestrial g=9.81 m/s² as ASSUMED, or record another declared value. Do not substitute a DeLorean parameter set or Stocco fitted coefficients. Treat the source set as a published research reference, not empirical calibration of VerletDrift.

An initial-condition family can use a nonzero straight speed, sigma=omega=0 and Omega_r=Omega_f=v/r with zero drive/steering. For cornering/high-slip reproduction, Table 2 p.18 provides rounded seeds at gamma=5 degrees, Md=200/622/545 Nm for cornering/donut/drift. Refine equilibrium residuals offline before exact equilibrium tests. Unstable drift must not be required to remain stable open-loop under perturbation; examine source equilibrium/local stability and source feedback separately if later authorized.

## Prerequisites before implementation

1. **Freeze the domain and singular branches.** Approve an initially moving, positive-load regime with rotor speeds bounded away from zero; record actual bounds and reject events leaving them. Adopt/test the zero-slip analytic limit. Do not imply the source covers rest, lock-up, restart or reverse crossing. A zero-speed regularization would be an additional model choice, not SOURCE-EXACT.
2. **Freeze steering protocol and work scope.** Start with constant prescribed steering (gamma_ddot=0), or specify a C² steering history with its first/second derivatives. Resolve actuator work before using steering pulses for global energy claims. Steps in gamma do not have a finite source gamma_ddot and are not source-faithful test inputs.
3. **Resolve the aligning-moment energy gate.** The force-level dissipation proof is available, the full reduced moment-level theorem is not. Bound/test the moment-work approximation over the declared moving domain and define an honest acceptance criterion. If acceptable physical work accounting cannot be justified, return to NOT READY for the claimed physical reference; do not delete Mz, add yaw damping, or report force-only passivity as a full energy test.
4. **Freeze numerical accuracy and cost choices.** Derive/select a fixed step and method from wheel-mode scales and required domain, then specify convergence and work-residual tolerances before tuning. RK4 at 100/200/400/800 Hz is a proposed comparison, not source-endorsed stable integration. Keep an independent much-finer offline reference. No variable recursive contact solver is justified by this source.

These are bounded source-reproduction decisions, not missing longitudinal physics or a call for another literature survey. If the intended first experiment must include starts/stops, finite service brakes or unknown free steering from day one, this verdict becomes **NOT READY for that broader scope**.

## Proposed verification plan (future work, not run here)

|Gate|Evidence required / failure disposition|
|---|---|
|Source transcription|Term-by-term match Eq.(7)/(20), parameters/units, optional pose; verify parens and r vs omega, a vs q; no Dallas load substitution|
|Tire surfaces|Pure/combined slip, zero-limit, positive/negative slip and rotation within domain, lambda=0 matching, mu0 vs mu peaks, unloaded-domain rejection; compare Fig.7 and Appendix B approximations without claiming identical exact bristle forces|
|Force-work and full ledger|Prove/check the force sign, rotor reaction, source kinetic cross term and moment contributions. Measure convergent integrated residual against source external work; no endpoint-power “proof”|
|Symmetry/order|Straight invariance, lateral mirror and tire evaluation reversal from identical immutable stages; no order-selected yaw|
|Equilibria|Offline residual refinement near rounded Table 2 seeds; compare ordinary and high-slip branches and Jacobian stability under refinement|
|Numerical accuracy|Matched-time state/work errors on 100–800 Hz plus fine independent solution; assess smooth intervals separately from branch crossings. Reject qualitative changes attributed to solver error|
|Replay|Tick-indexed input/configuration hashes, initial state and deterministic computation; no RNG, render coupling or undocumented interventions|
|Cost|Count force/moment calls and operations; measure named-machine mean/median/p95/p99/max with warmup; keep offline searches separate from stepping|

Each RHS needs two axle force/moment evaluations. A four-stage RK4 step would therefore need eight, plus elementary algebra/kinematics, with no local nonlinear root solves. Fixed substepping multiplies this count and must be disclosed. This is structural predictability, not a millisecond result or stable timestep guarantee. Stocco's 55.7 microsecond mean BCM tire calculation and Dallas's 38.7 microsecond QP solve cannot be used to estimate this browser core's timing.

## Scientific scope and extension

Z provides direct precedents for equilibrium residuals, Jacobian/local stability, folds, Hopf and periodic/period-doubled motions. Continuation and Floquet multipliers would be required to reproduce periodic stability; they are offline research methods. A period-doubling observation is not a positive Lyapunov exponent or proof of a chaotic attractor. Any later chaos test needs bounded/recurrent motion, norms/scales, perturbation and timestep convergence, independent integrator checks, and separation of deterministic forcing from autonomous dynamics.

Recoverability needs a specified safe set/horizon, actuator limits and policy class; Dallas's emulated-platform/barrier results do not provide a general manual-driver reachability certificate. Failed sampled controls mean “no recovery found.” Real tire/vehicle uncertainty and the flat-road/no-roll approximation limit high-speed conclusions.

Manual drivetrain extension is structurally feasible because source rotor inertia and equal/opposite tire reaction are explicit. It is not an input swap. Individual wheel masses/rotors/track and common drivetrain constraints increase state dimension; reverse/lock/stall require contact and mode treatment; Eq.(17) loads need rederivation for internal drivetrain torques. Engine/starter/loss/clutch/gear states and an open differential must exchange power through a consistent common solve as described in the [power audit](mathematical-closure-and-power-audit.md). This preserves clutch kicks, wheelspin and engine braking as energy transfers rather than scripted effects. No current source proves that final system.

**Single smallest next action:** approve a source-faithful constant-steer moving-domain specification and close its aligning-moment/full-power acceptance gate analytically. Do that before authorizing the isolated implementation. No simulator, demo, chaos study or production migration follows automatically.
