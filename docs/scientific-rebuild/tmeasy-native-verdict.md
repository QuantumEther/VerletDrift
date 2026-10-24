# Mission 21 — native verification verdict

## NATIVE FINDINGS PARTIALLY CONFIRMED

All four **intrinsic tire/API observations** from Mission 20 were reproduced with native pinned Chrono objects, actual flat-road collision and real wheel/spindle/system interfaces. The framework changes their delivery and interpretation: cached wrench application delays the new force/moment; the tested natural release suppresses the NaN pending wrench at the next application without repairing NaN bristles; timestep ownership is an explicit interface contract. Whole vehicle/rig orchestration was inspected rather than instantiated. These limits warrant the qualified verdict rather than blanket confirmation of whole-wheel failure consequences.

|Question|Native status|Evidence-backed disposition|
|---|---|---|
|A zero normal force|**NATIVE VERIFIED**, tested two-callback sequence|Exact Fn=0 with active geometric contact produces NaN force/hub-wrench report and bristles. In this release sequence, no NaN reaches the accumulator: the cached first wrench is zero and next contact deactivates. Internal NaNs persist. Universal prevention or inevitable propagation remains unestablished.|
|B aligning threshold|**NATIVE VERIFIED**|13.3947997740346 Nm jump survives contact output and following native hub application. Not an adapter sign/reference artifact.|
|C forward/reverse|**NATIVE VERIFIED**|Mirrored Fx≈-1049.376815/+500 N and Mz≈36.268482/0 Nm reproduced with matched zero memory and real frames; next application retains the asymmetry.|
|D timestep|**NATIVE PARTIALLY VERIFIED**|Real objects/system demonstrate configured-step ownership and external-time mismatch. SetStepsize is explicit; complete standard wrapper initialization/loop was source-inspected, not executed. Classify as interface contract, not automatically an ODE bug.|

## What was executed and preserved

Native readiness was **NATIVE CONDITIONALLY READY**. Executed ChSystemSMC, ChSpindle, Generic_Wheel, Generic_TMeasyTire through read-only observer, FlatTerrain, real disc collision and original lifecycle/wrench methods. No Mission 20 adapter functions, fake native classes or tire-law patches. Eleven frozen cases ran twice, byte-identically; 104 identity/reproduction checks passed. These checks do not validate real-world tire behavior or certify passivity.

Upstream revision `9a5072b5324e012a66d9fb7eaac0c679b8465e73`; VerletDrift base `7e2df69bec9ed5153a7fed6229ced50f34bb998e`. Exact tested input/source hashes, executable/library hashes, runtime, dependency and module configuration are in [verification](../../research/scientific-rebuild/tmeasy-native-verification/results/verification.json), [source integrity](../../research/scientific-rebuild/tmeasy-native-verification/results/source-integrity.json) and [build provenance](../../research/scientific-rebuild/tmeasy-native-verification/results/build-provenance.json). No upstream tracked source differs from the pinned commit.

[README](../../research/scientific-rebuild/tmeasy-native-verification/README.md) gives exact dependency, sparse checkout, native build and two-run verification commands. Results are [boundary report](tmeasy-native-boundary-results.md); reference/power/step reasoning is [wrench and timestep](tmeasy-native-wrench-and-timestep.md). No benchmark or optimization campaign was run. Build took 468.7004 s, with 240,024-byte dynamic probe; those are setup measurements, not tire-performance or browser claims.

The adapter did **not** cause the four local findings. It omitted native wrench caching and application timing, which matter for coupled consequences. No new claim is made about long trajectories, recontact recovery, arbitrary loaded initial caches, additional wheel orientations, different compiler/platforms, engine/brake/drivetrain behavior or global passivity.

## Exactly one smallest justified next engineering decision

Specify a **focused correction contract for the confirmed Fn=0 nonfinite-state boundary**, without implementing it now. Its scope should be limited to unilateral contact activation, finite bristle/wrench state at zero load and the already observed cached-wrench lifecycle. Acceptance must preserve the positive/negative neighbor cases, test the following native callback, and separate safe deactivation from an unjustified reset of finite stored state. It should remain compatible with independent wheel/rotor forces and a future manual drivetrain.

This recommendation addresses a demonstrated numerical singularity. It does not authorize smoothing B, redesigning C, changing D's step API, adding parking physics, claiming passivity or replacing the drivetrain. Those are different approximation/capability/contract questions and are not bundled into this next action.

All production VerletDrift physics, manual drivetrain, Zhang reference, Stocco records and Mission 20 artifacts remain unchanged. Only the isolated Mission 21 harness/results and four new documents are added. No merge occurred.
