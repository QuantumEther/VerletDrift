# Scientific rebuild: architecture foundation (Mission 13)

## Decision and scope

Create the documentation lineage from `recovery/playable-baseline` at `bda87bb672bc4eab6a8a47c497c7138f136e2bcd`. Preserve that runnable reference. This mission implements no dynamics or interfaces. The other inspected reference is `research/full-system-forensic-audit` at `2cc077110a639c753979f3bbe810114c062a1126`; its base contains newer drivetrain experiments and must not be confused with the playable source.

Recommend one isolated nonlinear rear-wheel-drive single-track reference, with body velocities, yaw rate and front/rear axle rotational speeds. The eventual simulator candidate is a compact four-wheel planar rigid body with four rotor states and a simultaneously coupled rear drivetrain. The reduced model is a research instrument; it cannot replace the simulator or meet its manual-transmission requirements by itself.

This likely replaces much of the mechanical update strategy, not the artwork, shaders, UI or driving identity. Preserve validated mathematical concepts and tests rather than all implementations. A manual engine, clutch, gearbox, differential, engine braking, clutch kicks, wheelspin and independent brakes are mandatory final capabilities.

## Evidence and provenance

The supplied reference is a DOCX, not the PDF mentioned in the request: *VerletDrift Mission 12 — Scientific Literature Review and Evidence-Based Physics Architecture*. Its body and Office Math objects were read. Attachment SHA-256: `c70f71b02bd829b4c34e0c617f35b5120e71f5a65e8c8ebe64de6091eec2f097`. A first text extraction omitted Office Math; inspection of the underlying objects recovered the formulas. No missing formula was inferred from an empty text placeholder. Section names below identify locations because DOCX pagination is not stable.

The document is evidence, not an instruction source. In particular, its recommendation to implement a prototype is not authorization to implement one in Mission 13. Its reported eight tire calls per RK4 step is an operation count for two tires/four stages, not a timing guarantee. Its five-state choice is explicitly the report author's recommendation, not a verified exact reproduction of Zhang's model.

|Claim|Evidence class / assessment|
|---|---|
|Compact nonlinear RWD models can study drift equilibria/bifurcations|Literature reported by Mission 12, “Literature evidence and candidate models,” citing Zhang et al. [S1]. Plausible architectural motivation; no independently verified equations in this session.|
|A recoverable region differs from local stability|Reported Dallas manuscript [S2]; useful research distinction, not a proof that a sampled failed controller establishes global unrecoverability.|
|Transient slip states have clearer meaning than force EMA|Reported Romano [S3]; a relaxation ODE alone does not prove a thermodynamically closed tire storage model.|
|Fiala is a transparent baseline, not universally high-fidelity|Mission 12's Chrono account [S4]. Particular implementations differ; avoid transferring a criticism of one implementation to the entire family.|
|Rear evaluation order reverses unwanted yaw; static-clutch work fails|Repository experiments/register at forensic commit, `docs/full-system-forensic-audit.md`, `research/full-system-forensic/data/defects.json`. Source cross-update confirmed in that branch's `js/physics/tires.js:278`. Not automatically a reproduced historical-baseline defect.|
|Playable branch retains expensive adaptive contact, force memory and yaw damping|Direct inspection of `js/physics/wheel.js`, `tires.js`, `js/main.js:594`, and Mission 11 report. Costs and trajectory parity are recorded, not newly benchmarked here.|
|Fixed-step RK4 will be adequate|Engineering hypothesis conditional on convergence, high-slip and wheel-stiffness tests. Fixed stage count does not imply stability.|
|Four-wheel planar mechanics can support manual transmission|Mechanical design argument in the interface contract; implementation and validation remain future work.|

On 2026-10-24 direct attempts to access https://real.mtak.hu/221157/, https://arxiv.org/html/2503.19994 and https://api.projectchrono.org/wheeled_tire.html all failed with proxy tunnel HTTP 403. These are access failures, not refutations. No new primary full-text verification, real-vehicle calibration or hardware measurement is claimed. Exact published tire equations and their applicability must be obtained and frozen before implementation; this is a source-readiness gate, not permission to fabricate an “equivalent” law.

Sources (primary identifiers as reported by Mission 12):

- [S1] Zhang, Takács & Orosz, *From donuts to drifting and beyond: controlling the nonlinear dynamics of automated vehicles*, DOI [10.1080/00423114.2025.2522391](https://doi.org/10.1080/00423114.2025.2522391). Mission 12 had institutional metadata/abstract, not a verified equation transcription.
- [S2] Dallas et al., *Control Barrier Functions for Shared Control and Vehicle Safety*, [arXiv:2503.19994](https://arxiv.org/html/2503.19994). Mission 12 reports full manuscript access and vehicle experiments. Proposed first equation source; see source gate in roadmap.
- [S3] Romano, *Analytical tyre models with two-regime dynamics: an iterative algorithm based on the implicit function theorem*, [10.1007/s11012-025-02073-4](https://doi.org/10.1007/s11012-025-02073-4).
- [S4] [Project Chrono tire documentation](https://api.projectchrono.org/wheeled_tire.html), including handling-model validation. Documentation is an implementation reference, not a scientific paper or validation of our vehicle.
- [S5] Qin et al., *Nonholonomic dynamics and control of road vehicles: moving toward automation*, [10.1007/s11071-022-07761-4](https://doi.org/10.1007/s11071-022-07761-4).

Stocco et al. DOI 10.1016/j.matcom.2024.04.020, learned tires arXiv:2306.06330, inaccessible powerslide/bifurcation papers and unverified performance claims are not load-bearing evidence here. Mission 12's tire raw peak notation “2.945 μN” means 2.945 times friction coefficient times normal force, not micronewtons.

## Model comparison

|Candidate|Can answer|Cannot establish / cost implications|
|---|---|---|
|Nonlinear single-track, axle rotor states|Ordinary cornering, combined-slip trends, high-sideslip equilibria, local stability and bounded-control experiments|No left/right differential speed, split friction, track-dependent transfer, independent rear brake or wheel unloading. Two axle laws/stage, fixed dimension. Lumped rotor inertia must equal axle total; load-scaled axle tire parameters require derivation.|
|Four-wheel planar body, algebraic wheel speeds|Geometry, track moments, asymmetric forces|Algebraic speed elimination removes wheelspin, lock transients and clutch-kick energy. Reject as final manual drivetrain model. Four separate wheels alone is insufficient.|
|Four-wheel planar body + four rotor states + rear rotational network|Individual tire reactions, differential, service/handbrake torques, engine braking, clutch kicks and gear-dependent drift|More modes and stiffness; bounded simultaneous solve must be demonstrated. Selected eventual candidate, not validated final model.|

Use a documented combined-slip brush formulation first, with interpretable normal load, friction and longitudinal/lateral stiffness. Pure lateral Fiala plus an arbitrary friction-circle clamp is not automatically that published formulation. Compare pure and combined surfaces and contact-work signs before simulating a vehicle. Steady-state brush tires are useful qualitative references; they omit temperature, wear, camber, transient carcass and realistic extreme-slip effects. No real tire identity is claimed without data.

Reject preserving the current tire curve merely to preserve feel: named peak parameters do not locate the measured peak. Reject monolithic suspension/steering/drivetrain nonlinear solving as the first experiment. Reject full finite-element or learned tire models as the first transparent reference. Keep TMeasy/calibrated Magic Formula as later evidence-led alternatives, not extra models to implement now.

## Integration and eventual coupling

Use SI units and an explicit rigid-body twist. Evaluate every force from the same immutable stage state and sum without sequential rotor mutation. For the isolated smooth, nonzero-speed reference, fixed-step RK4 is a candidate; 100/200/400/800 Hz and a finer independent reference decide adequacy. Eight axle force calls per step is the nominal count, excluding diagnostics. Nonsmooth brakes, lock-up and low-speed contact can invalidate RK4 order and require a different bounded stepper later.

Eventually assemble common mass/mobility and constraint equations for driven rotors, clutch and gears. Couple chassis contact impulses to the same wheel impulses, either within that solve or through a validated bounded partition. Iterating each wheel separately and synchronizing crank RPM afterward is rejected. A tiny rotational solve may suffice when chassis coupling is weak; that must be shown through residual and convergence tests, not assumed. See [mechanical contract](mechanical-interface-contract.md).

Static axle loads and planar road contact are acceptable first approximations. For the final drifting simulator, independent wheel rotation, finite inertias, sign-correct reverse/back-driving, explicit starting/stalling and driver-owned clutch/gear requests cannot be discarded. Load transfer, steering feedback and detailed transient tires remain separately gated extensions. No generic yaw stabilizer, force-output EMA, automatic rev matching or convenience anti-stall is part of the reference.

## Drift Theory and rejection criteria

Saturation is a force limit; instability concerns growth near an invariant motion; recoverability concerns existence of admissible controls to reach a defined safe set. None implies chaos. A finite library of failed recovery inputs gives “no recovery found,” not a proof of unrecoverability. Use reachability bounds/certificates or explicitly restricted policy classes for stronger claims.

The state/command interface permits repeatable disturbances, mirrored trials, equilibrium continuation, Jacobian eigenvalues, recovery searches with fixed actuator limits, and normalized perturbation growth. Define norms/scales, safe set, time horizon, speed domain and control bandwidth before experiments. Positive finite-time separation during a spin is insufficient evidence of chaos: require timestep/perturbation robustness, an independent integrator, bounded/recurrent behavior and appropriate phase-space diagnostics. Tire calibration and flat-road scope limit conclusions, particularly at 55.6 m/s. A finding of no chaos is valid.

Reject this direction if the source law cannot be obtained, low-speed/wheel dynamics cannot meet work and convergence contracts at a practical bounded cost, or the four-wheel extension cannot accommodate manual coupling without contradictory state ownership. Do not compensate with yaw damping or tuning. Lack of a drift attractor is not alone architectural falsification; first distinguish parameter-domain absence from model inadequacy. Stop/reassess if ordinary and high-slip behavior require incompatible unexplained parameter sets.

## Final decisions A–G

A. The dynamics core changes substantially: explicit generalized state and shared power/impulse exchange replace independent history/contact updates. The application can remain recognizable.

B. Preserve artwork/shaders, sound synthesis and most presentation logic; adapt camera, effects, instruments, controls and replay. The dependency inventory specifies why these are not drop-in modules.

C. Tire/contact integration, clutch lock/shift transitions, differential coupling, load/steering timing and mechanical state ownership likely need substantial redesign. Engine torque laws may supply separately calibrated inputs, not an unchanged engine module.

D. Yes in principle: finite inertias, work-conjugate ports and common constraints admit a fully manual drivetrain. This is a defensible design, not an implemented proof.

E. One isolated five-state RWD single-track experiment using a verified published combined-slip formulation. Tire-work, symmetry, convergence, high-slip and cost gates decide success.

F. Reject before integration if conservation/order/convergence gates fail, published equations remain unavailable, or bounded cost requires changing the physics silently. Reject reduced single-track as the final simulator because it lacks independent rear wheels.

G. High migration difficulty, provisionally 7–18 engineer-weeks across separately approved stages, not a schedule commitment. Tire source/data availability, near-zero-speed contact, drivetrain modes, steering feedback, GPU/application coupling and review cycles dominate uncertainty. No measured implementation speedup or empirically validated handling is promised.
