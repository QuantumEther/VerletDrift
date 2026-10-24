# Mission 15 decision — LIMITED GO

**Only for an isolated, constant-steering, moving-domain reproduction of the published approximation. Not a certification of passive vehicle mechanics. No implementation is authorized in this mission.**

Mission 14's four prerequisites are resolved as specifications, rather than declared universally satisfied:

1. Domain: [operating domain](reference-operating-domain.md) fixes positive rotor speeds, input/state ranges, strictly positive source loads and deterministic domain-exit reporting. Cutoffs are engineering safeguards, not physical constants. Standstill/lock/reverse remain excluded.
2. Steering: independent initial-value problems at constant gamma, gamma_dot=gamma_ddot=0. No angle jumps, steering transient, feedback controller or free steering column. A future smooth steering extension has an explicitly derived actuator work port.
3. Energy: [energy analysis](aligning-moment-energy-analysis.md) derives the full three-body balance and proves force-only dissipation. It also disproves global full contact passivity: a valid moving, zero-drive, constant-steer state has E_dot≈+0.230853 W from aligning moments. This is not an integrator error, steering input, deleted term or invented tire reservoir. The source remains an approximation with a known limitation.
4. Numerics: [validation specification](numerical-validation-specification.md) fixes candidate RK4 rates, a refined independent DOP853 reference, error/work budgets, branch/domain checks, replay, scenario refinement and benchmarking procedure. Candidate acceptance remains a future measured result, not something documentation can prove.

The frozen [manifest](reference-experiment-manifest.md) retains the complete source Eq.(6)–(20)/Table 1, with exact zero-slip limiting evaluation, ordinary cornering and unstable drift families. No Dallas, Stocco or legacy formula is substituted. No damping or controller conceals an unsuccessful experiment.

## Why LIMITED GO is scientifically legitimate

The specified experiment can answer whether independently reproduced source equations yield the stated equilibria, local behavior and convergent bounded-cost trajectories. It can quantify a known approximation defect. Reproduction of a model with a disclosed limitation is a legitimate scientific experiment; it does not establish the model is a trustworthy final mechanical foundation. Positive full contact power must be reported as a physical-property FAIL, even if the transcription and numerical ledger PASS. The source's full passivity claim is not rescued by a permissive numerical tolerance.

A strict requirement for an everywhere-passive reference core would instead be NO-GO for these unchanged source equations. No production promotion, driver-control/recoverability conclusions, chaos claims or empirically accurate drift claims follow from LIMITED GO. If source reproduction is no longer the intended objective, stop and separately authorize reconsideration of spin-consistent tire mechanics rather than silently expanding this mission.

## Superseding decisions and preserved records

Mission 14 `mathematical-closure-and-power-audit.md` called moment-level passivity UNRESOLVED. This mission replaces that uncertainty with an analytical counterexample and a bounded-domain power inequality. Mission 14 readiness condition “resolve aligning-moment energy gate” is fulfilled by transparent negative classification, not a global passivity proof. Its source selection remains a valid reproducible approximation, with narrower physical claims. Original Mission 13/14 documents are preserved unchanged.

All full-simulator manual capabilities remain required: independent wheel/drivetrain states, start/stall/restart, back-driving, clutch, gear synchronization, differential, clutch kicks, braking and reverse. They need additional equations, rederived support loads and standstill contact scope. The five-state model may be replaced or extended substantially to satisfy them; its simplicity is not a reason to sacrifice those features.

## Work performed and next action

This mission produced five documents only, from `scientific-rebuild/01-primary-source-verification` at `aa72b8fce97bba00b464755a01473b54fb3c145d`. Checked the attached source hash and critical primary equations/appendices, independently derived kinetic/steering work and the positive-power family, and evaluated the scalar counterexample at 60-digit precision. Symbolic substitutions verify the stated identities. No trajectory simulation, equilibrium search, CPU benchmark, renderer/physics modification or merge was performed. Future tests are UNRESOLVED until run; the proved global-passivity failure is not relabeled a pass.

Single smallest next action: separately authorize only the manifest's isolated source-reproduction experiment, explicitly accepting its approximation scope and known passivity failure. Its implementation must start with constitutive/energy fixtures before the two trajectory families. This decision is not that authorization.

**LIMITED GO**
