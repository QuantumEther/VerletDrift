# Mission 22 — decisions

## Safety correction: SAFETY PATCH VERIFIED

The labelled research variant changes one comparison, Fn<0→Fn<=0, in a temporary copy of pinned native Chrono. Exact-zero support becomes inactive before friction/bristle division. It returns zero wrench, freezes existing finite bristles during geometric overlap, resumes them under positive support, and retains the existing reset on true separation. No epsilon, force law, coefficient, moment threshold, reverse or timestep change.

All 83 native comparison checks passed. Both variants ran eleven historical cases and nine controlled history stages twice, deterministically. Original failure traces remain: zero support corrupts bristles, and direct re-support before separation can expose an invalid applied spindle wrench. The patched sequence remains finite and completes all nine native body updates. Ten unaffected historical records are unchanged. [Validation/provenance](tmeasy-zero-load-patch-validation.md), [root cause](tmeasy-zero-load-root-cause.md).

This is not upstream Chrono, a production patch, a corrupted-checkpoint repair, physical recontact validation or a global passivity proof. Original source/libraries, Mission 20/21 records and all prior investigations remain unchanged.

## Vehicle architecture: MINIMUM VIABLE VEHICLE CONTRACT READY

The state, mechanical ports, reactions, timing, parameter inventory and measurable gates are specified sufficiently to begin the next isolated mechanical increment. This is **contract readiness**, not a claim that a four-wheel vehicle exists or has passed acceptance.

Recommend safety-patched basic TMeasy as the initial engineering research candidate, using its unchanged combined-slip/moment law and explicit limitations. Preserve the Zhang reference for comparisons and the Stocco source findings as historical evidence. No new tire search or hybrid is warranted for this increment.

Selected representation: native 6-DOF sprung chassis plus four heave/spin wheels, ideal prescribed front steering and eight source bristle states. Native bodies/constraints own wheel motion, including inertia; no second rotor integrator. Springs/guides produce dynamic load transfer. Driver torque/brake/steering ports have physical reactions and work accounting, with future clutch/gearbox/differential compatibility. [State and parameters](minimum-viable-vehicle-state.md), [mechanical interfaces](vehicle-mechanical-interface-contract.md).

Selected scheduler: same frozen body stage for all four tires, source Advance once with internal h asserted equal to master h, then apply the newly computed wrenches and integrate bodies. This removes the extra callback cache lag **in the future caller policy**, not by changing this safety patch or rewriting historical experiments. It remains a first-order explicit tire/body partition requiring refinement and cost gates.

Known limitations retained: the 1 m/s aligning jump, reverse bristle-only path, no parking/belt/thermal model, empirical calibration and unresolved full energy/storage interpretation. They are conditional research approximations subject to [fourteen practical gates](vehicle-physics-acceptance-gates.md). Empirical DeLorean fidelity, source passenger-tire fixture transfer, coupled stability and four-wheel real-time cost have not been verified. Those are implementation/validation gates, not missing interface definitions.

All vehicle seed values/tolerances are explicitly proposed engineering assumptions. No real-world DeLorean preset, tire tuning or physics correction is smuggled into documentation. The provisional seed has 15 independent body/geometry/suspension scalars, one immutable source wheel/tire fixture and separate numerical/diagnostic settings.

## Exactly one next implementation step

Implement **one headless native sprung corner with heave and spin**, the safety-patched Generic tire, one spring/damper and prescribed shaft torque/brake ports at a single fixed master timestep. Verify static support, relative/absolute wheel speeds, reaction/work bookkeeping, lock behavior, safety transitions and short timestep refinement before instantiating four corners. Do not implement the vehicle, manual drivetrain, renderer or AI in that next increment. The later ordered path is documented in [roadmap](scientific-rebuild-implementation-roadmap.md).

No production VerletDrift physics, manual drivetrain, controls, sound, visuals, parameter panels, camera, Zhang reference, Stocco files or Mission 20/21 baselines are modified. No merge occurred. New code exists only under `research/scientific-rebuild/tmeasy-safety-experiment/`; seven new documents exist only under `docs/scientific-rebuild/`.

## Exact added-file inventory

Documents: `tmeasy-zero-load-root-cause.md`, `tmeasy-zero-load-patch-validation.md`, `minimum-viable-vehicle-state.md`, `vehicle-mechanical-interface-contract.md`, `vehicle-physics-acceptance-gates.md`, `scientific-rebuild-implementation-roadmap.md`, and this `mission-22-decision.md`.

Under `research/scientific-rebuild/tmeasy-safety-experiment/`: `CMakeLists.txt`, `README.md`, `UPSTREAM-LICENSE`, `build_variant.py`, `inputs.json`, `trajectory.cpp`, `verify.py`, `zero-load.patch`. Results: `native-environment.json`, `verification.json`; `original-frozen-1.csv`, `original-frozen-2.csv`, `original-trajectory-1.csv`, `original-trajectory-2.csv`, and corresponding four `patched-*.csv`; `original-frozen-libraries.txt`, `original-trajectory-libraries.txt`, `patched-frozen-libraries.txt`, `patched-trajectory-libraries.txt`. No generated binaries are committed.
