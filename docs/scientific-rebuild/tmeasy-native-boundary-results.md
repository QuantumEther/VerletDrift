# Mission 21 — native boundary results

**Native objects and contact executed.** [Readiness/provenance](tmeasy-native-readiness.md) and [wrench/timestep interpretation](tmeasy-native-wrench-and-timestep.md) define the boundary. No extracted Mission 20 functions are used by this executable.

Eleven frozen fresh-object cases, repeated twice, produced byte-identical CSV. **104 verification/identity checks passed, none failed.** This count includes independent wrench checks and agreement with saved Mission 20 values; it is not physical tire validation or passivity certification.

Both result CSV hashes: `55c6810ed1fcdf1e860b6e763e57f09e9f52b175f669d6d5f14fcbdd539e526e`. [Run 1](../../research/scientific-rebuild/tmeasy-native-verification/results/native-run-1.csv), [run 2](../../research/scientific-rebuild/tmeasy-native-verification/results/native-run-2.csv), [machine checks](../../research/scientific-rebuild/tmeasy-native-verification/results/verification.json), [assessment](../../research/scientific-rebuild/tmeasy-native-verification/results/boundary-assessment.json). Runtime stderr was empty in both executions. NaNs remain in CSV without replacement or clipping.

## Frozen common inputs and lifecycle

[cases.json](../../research/scientific-rebuild/tmeasy-native-verification/cases.json) predates execution. It specifies original Generic_TMeasyTire parameter generation, unchanged from Mission 20: pn=8562.8266094525 N, R0=.4699 m, width=.3175 m, rim radius=.20955 m, d1=411120.924210318 N/m, dz=3931.68497597505 Ns/m, rr=.015. Road height zero, native float friction .8, SINGLE_POINT collision. Initial spindle position `(0,0,.449072)` m, identity quaternion, base mass 1 kg and diagonal inertia `(1,1,1)` kg m², zero gravity, no carrier/drivetrain/steering. Native wheel/tire initialization adds original masses/inertias; resulting spindle mass is 56.6 kg. All initial bristles are source-default zero; no private state writes, warmup or calibration tuning.

Native geometric depth is `.020827999999999958 m`, slightly different from the directly injected Mission 20 depth because the collision pipeline reconstructs it by subtraction. Stationary normal load is `8562.8266094524806 N`; Reff≈.4629573333333333 m and Rstat≈.449072 m. The independent comparison tolerance is 1e-8 absolute plus 2e-11 relative, accommodating floating-point geometry/compiler differences, not hiding physically material changes.

For each case: actual initialization → tire Synchronize → wheel Synchronize applying cached wrench → tire Advance → native system integration with that applied wrench → second ordinary tire/wheel Synchronize at the naturally advanced state. This matches the pinned official wheel assembly's order. First applied wrench is zero because the fresh tire's cache is zero; newly calculated and actually applied wrenches are recorded separately. All eleven system steps executed; no invalid **applied** wrench was integrated.

## A — exact zero normal force

Mission 20: active geometric contact with Fn=0 produced nonfinite forces and bristles.

For each of three fresh fixtures, native contact first establishes depth without advancing bristles. The physical separation speed is then set to `native elastic force(actual depth)/source dz + offset`, with offsets {-1e-6,0,+1e-6} m/s. This freezes a physical input construction, not a private force override. Vx=Vy=Omega=0; configured and external dt=.001 s.

|Separation speed m/s|Native Fn N|Active contact|Pending wrench/bristles|
|---:|---:|---|---|
|2.1779015180746866|.003931684976123506|Yes|Finite|
|2.1779025180746867|0 exactly|Yes|NaN force/hub moment and bristles|
|2.1779035180746869|0 after unilateral deactivation|No|Finite zero wrench|

**NATIVE VERIFIED for this two-callback sequence.** The source boundary is physically reachable through real collision and original force computation; it is not an adapter artifact. Native `ReportTireForce` exposes the invalid hub wrench at exact zero load.

**Propagation is transformed by lifecycle and motion.** The first system step applies the cached zero wrench, so the spindle remains finite while moving upward. On the next Synchronize, reduced penetration makes the normal-force expression negative; contact deactivates and GetTireForce returns zero before the invalid cache reaches the accumulator. Bristles remain NaN in this damping-deactivation branch. Thus no NaN reached the spindle accumulator in this particular release trajectory. This is not a general NaN guard or repaired tire state; persistence/recontact and every alternative trajectory were not tested. Do not claim either inevitable spindle corruption or universal prevention.

## B — aligning threshold

Vx={.999999,1,1.000001} m/s, Vy=.1 m/s; Omega=Vx/.46295733333333333 rad/s; load/pose unchanged, fresh bristles, both steps .001 s.

|Vx m/s|Fy N|Intrinsic Mz Nm|Next native accumulated world Mz Nm|
|---:|---:|---:|---:|
|.999999|-500|0|≈0 (-2.99e-18)|
|1|-500|13.394799774034606|13.394799774034610|
|1.000001|-500|13.394804818069128|13.394804818069128 within rounding|

Trail at Vx=1 is ≈.0267895995480692 m; source patch length is ≈.1978593156765683 m. Sy≈-.09900990099, Omega≈2.160026265919393 rad/s. Full exact inputs and outputs are in CSV.

**NATIVE VERIFIED.** The intrinsic discontinuity agrees with Mission 20 and survives native hub translation/application on the following callback. Lever-arm terms change hub x/y moments; they do not manufacture this z jump in the upright flat configuration. The first step does not apply the new jump immediately.

## C — forward/reverse

Matched zero bristles and native frames; forward `(Vx,Vy,Omega)=(10,.1,21.384260032601997)` and the simultaneous negative reflection, in SI units. Both steps .001 s.

|State|Fx N|Intrinsic Mz Nm|
|---|---:|---:|
|Forward|-1049.3768151614518|36.26848164371496|
|Reverse|499.99999999999903|0|

**NATIVE VERIFIED.** These values agree with Mission 20. The next accumulated world forces/moments carry the same branch difference. Identical default bristles remove unequal memory as an explanation; native contact frames are upright/identity. Signed Vx selects the handling curve for forward 10 m/s and the Dahl path for reverse -10 m/s; the reverse empirical moment is suppressed. This establishes implementation asymmetry, not the authors' intent or whether real tread asymmetry would justify these magnitudes.

## D — timestep contract

Vx=.1 m/s, Vy=Omega=0, fresh bristles and unchanged load.

|Configured tire dt s|Advance argument s|Native elapsed system time s|New brx m|
|---:|---:|---:|---:|
|.001|.001|.001|.00009994164214387788|
|.01|.01|.01|.0009941947049991241|
|.001|.01|.01|.00009994164214387788|

**NATIVE PARTIALLY VERIFIED**: direct tire/wheel/system behavior is executed; whole vehicle/rig automatic step orchestration is source-inspected, not instantiated. The configured timestep governs bristles even when the external system advances ten times farther. All three newly computed Fx values are -500 N because forces use the old zero bristles; those forces enter the next callback. The full native body state, system time and accumulated wrench are recorded.

The API explicitly exposes SetStepsize for underlying tire dynamics. This is a caller/tire **interface contract**, not automatically an upstream ODE bug. Standard rig initialization sets it, while the inspected vehicle Advance path does not resynchronize it for every argument. See the source-specific qualifications in the companion report.

No model fix, broader search, performance campaign or empirical validation was performed.
