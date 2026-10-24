# Branch conventions

Mission 13 creates only `scientific-rebuild/00-architecture-foundation`, directly from `recovery/playable-baseline` at `bda87bb672bc4eab6a8a47c497c7138f136e2bcd`. That explicit base preserves the playable application without inheriting the forensic branch's experimental physics. This mission adds only five architecture documents. No merge or new model implementation is authorized.

All future architecture-lineage work uses `scientific-rebuild/NN-purpose`. Future stage names in the user brief and roadmap are illustrative; none is created now. Historical `recovery/`, `fix/` and `research/` retain their names and purposes.

Protected references for this mission:

|Branch|Purpose|
|---|---|
|`recovery/playable-baseline`|Runnable historical/manual driving comparison; human playability assessment remains pending.|
|`recovery/realtime`|Earlier recovery physics/source benchmark.|
|`research/full-system-forensic-audit`|Diagnostics and experimental-lineage defect evidence.|
|`fix/steering-input-continuity`, `fix/cornering-performance`|Selective input/render source history.|
|`fix/engine-free-rev-dynamics`, `fix/engine-torque-model`, `research/drivetrain-coupled-solver`|Historical experiments; no automatic promotion.|

Record base SHA, source equations/version, configuration, evidence provenance and candidate SHA at each future stage. A publication reference is not approval to copy code; review license and conventions before implementation. Prefer small independently reviewable commits and adapters; do not merge historical physics wholesale. Source findings must name their branch because historical and forensic mechanics differ.

Future implementation needs a separately authorized branch/task. Each accepted stage must remain independently runnable and tested before the next one begins. Never merge into the protected playable branch automatically. Rollback means reverting the isolated candidate/adapter while preserving reference data; do not rewrite protected branch history.

Acceptance of a core experiment is not acceptance of application replacement. Replacement needs whole-vehicle work/convergence tests, manual drivetrain features, browser input/render isolation, target-hardware performance and human driving approval. Preserve a separately launchable recovery simulator until those gates pass.

This branch is an architectural decision record. No engine, tire, chassis, shaders, controls, UI or assets are changed. No additional speculative implementation branches are created.
