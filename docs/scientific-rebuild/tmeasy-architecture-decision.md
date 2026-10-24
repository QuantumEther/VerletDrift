# Mission 20 — architectural decision

## TMEASY CANDIDATE WITH CRITICAL LIMITATIONS

The pinned basic Chrono implementation is accessible, BSD-3-Clause, traceable and sufficiently closed for the bounded original-method tests. It avoids Stocco's unresolved constitutive source/fixture reconstruction problem. That is evidence of practical reproducibility, not physical superiority.

[Source/rights](tmeasy-source-and-license-audit.md), [power](tmeasy-mechanical-power-audit.md), [regimes](tmeasy-low-speed-and-regime-review.md), [numerical verification](tmeasy-numerical-validation.md), and [cost](tmeasy-computational-assessment.md) separate source inspection, execution, independent derivation, project claims and unverified assumptions.

## Comparison with the preserved Zhang reference

|Criterion|Zhang five-state reference|Pinned Chrono basic TMeasy|
|---|---|---|
|Constitutive forces|Explicit analytical combined-slip brush approximation|Explicit load-dependent combined curve plus low-speed Dahl blend|
|Aligning moment/spin|Approximate trail moment; spin neglected locally|Empirical trail; no local contact-frame yaw/spin constitutive input; moment switched off at low/reverse signed Vx|
|Power/storage|Mathematical identity verified; reduced-contact positive-power limitation documented|Actual hub-wrench ports identified; effective/static radius difference and blended bristle storage require further closure; PASSIVITY UNRESOLVED|
|Low speed/reverse|Explicitly excluded from its authorized domain|Regularized, history-dependent approximation; reverse uses a different force path; no parking torsion|
|Wheel rotation|Two prescribed-model axle states with source reactions|External independent wheel body/spin; tire supplies one wrench, external inertia/integration required|
|Cost|Previously measured JavaScript research ODE|Small C++ original-method measurements; full framework/browser cost unmeasured; no comparable speedup claim|
|Calibration|Published vehicle/tire set, restricted source reproduction|Generic source-guessed tire available, but no validated DeLorean or drift tire calibration|
|Four wheels/manual drivetrain|Not itself a four-wheel manual simulator|Compatible interface shape for separate wheels; not proof of correct clutch, differential, brake or handbrake coupling|

Critical findings are the exact-zero-Fn NaN, abrupt Mz onset, signed forward/reverse law asymmetry, and dependence on configured dt rather than Advance's argument. Source limitations also include absent parking/belt dynamics and incomplete full energy accounting. The 38 successful reproduction assertions do not turn those four FAIL findings into passes. A simple scalar state convergence result and inexpensive arithmetic do not establish credible drift/standstill behavior.

Further **isolated investigation is justified**; a production-oriented tire replacement or full drivetrain implementation is not. Acceptability would require explicit decisions/evidence for reverse and parking requirements, coherent timestep ownership, demonstrated contact-transition behavior, and accountable force/moment/storage ports. Corrections must be independently authorized, not smuggled into a port as compatibility changes.

## Exactly one smallest justified next action

Run a separately authorized **upstream-native boundary confirmation** of the four recorded findings in one minimal wheel-on-flat-road Chrono test at the same pinned revision and generic fixture. It should compare the actual instantiated class against the saved prescribed-contact outputs at Fn=0, Vx≈1, mirrored ±10 m/s and unequal Advance/configured dt, checking the translated hub wrench and bristle state. Freeze those states, use no parameter tuning or physics patches, and stop on an adapter/native discrepancy before expanding scope. This single bounded experiment resolves whether the adapter exclusions affect the decisive observations; it is not a complete vehicle build, tire redesign or alternative-model campaign. A readily available Chrono installation can be used in that future task; a substantial framework setup should be reported as a barrier rather than silently expanded.

No additional implementation branch is created now. All existing production VerletDrift systems, the Zhang reference, the Stocco investigations and protected recovery branches remain unchanged. No merges occurred. Only Mission 20 documentation and the isolated research harness/results are added.
