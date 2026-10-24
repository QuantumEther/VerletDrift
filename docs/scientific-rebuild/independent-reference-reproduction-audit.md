# Mission 17 — Independent reference reproduction audit

Audit branch `scientific-rebuild/04-physical-suitability-audit`, base `5118582196baba1a3b6fed7eddbd6880d76c7306` (`scientific-rebuild/03-isolated-reference`). A clean source tree was exported with `git archive` into `/tmp/mission17-clean`; no dirty working-tree source was accepted. This is a clean exported checkout, not a separately developed solver or an independent human/team review. Outputs were regenerated only in the disposable tree. The repository reference, committed results, production and historical records remain unchanged.

## Inspection before execution

Read parameters/tire/model/integrator/cases/CLI, offline transcription, tests, benchmark/assessment tools, saved results and the Mission 13–16 authority documents. Source comparison used the attached Zhang manuscript SHA-256 `d90caa7ac9a70cb3b767c6475feb30b913989aa2bb64d921adbfbc182ac80479`: Eq.(7),(8) p.9, Table 1 p.10, slips pp.11–12, Eq.(17) p.13, Eq.(20) p.14, Table 2 p.18 and Appendices A/B. Primary PDF is accessible; no different publisher revision or author code was obtained.

State order and SI units, m/p/J coupling, rotor inertia/reaction, torque-dependent loads and both moments match the audited source under constant steering. Gamma double-dot is zero by the explicit input domain, not silently discarded under changing steering. Each RK stage reads one coherent state; front/rear evaluation does not mutate it. No production imports, hidden yaw damper, output memory, nonlinear tire root or undocumented state clamp was found. Saturated lambda=0 describes absent adhesion; force selection uses the published sliding branch. Exact zero slip is an explicitly derived limiting return. Runtime guards restrict experiments rather than repair invalid states.

The Python reference is independent of JS execution and uses a mass-matrix solve/dimensionless adhesion fraction, but shares the same source interpretation and fixed coefficients. It is not an adversarial guarantee against a common modeling assumption. The decisive extra check in this mission integrates the published **distributed** stress fields, not another call to Eq.(20)'s JS implementation.

## Commands actually executed, in dependency order

Run from repository root; R points into the disposable snapshot. All commands below completed successfully:

```sh
git archive scientific-rebuild/03-isolated-reference | tar -x -C /tmp/mission17-clean
R=/tmp/mission17-clean/research/scientific-rebuild/reference-model
python3 "$R/fixtures.py"
node --test "$R/tire.test.mjs"
node --test "$R/model.test.mjs"
node "$R/cli.mjs" counterexample
python3 "$R/offline.py" roots
node "$R/cli.mjs" plan
node --test "$R/"*.test.mjs
node "$R/cli.mjs" validate
node "$R/source-table-audit.mjs"
python3 "$R/offline.py" stability
node "$R/assess.mjs"
```

Runtime: Node v24.19.0, Python 3.12.14, SciPy 1.17.0, NumPy 2.3.5, mpmath 1.3.0. The full test suite passed **16/16**. Regenerated roots, 88 RK4 comparisons and compressed state/work traces match the committed numerical contents exactly. Counterexample/validation JSON byte hashes differ because audit-branch provenance changed, not numerical fields. Roots converged in three updates each, inside unchanged root windows; no coefficients or tolerances were altered.

**Not executed:** `offline.py references` and `benchmark.mjs`. The expensive two-level DOP853 artifact was reused, not independently regenerated; its original 22-case refinement and accuracy claims are **CONSISTENT BUT NOT INDEPENDENTLY VERIFIED** in this mission. Fresh RK4-to-saved-reference comparison is REPRODUCED, not a fresh independent DOP853 campaign. Original CPU timings are inspected historical measurements, not current benchmarks. This explicitly follows the mission's cost restriction.

|Result|Classification / evidence|
|---|---|
|Tire fixtures, zero-slip/sign/branch/unit tests|REPRODUCED, regenerated fixtures and 16-test suite; same scripts alone are not new mathematical independence|
|Counterexample algebra/power|REPRODUCED by source-stress quadrature at 70 digits plus independent mass-matrix energy derivation|
|Equation-root refinement and stability diagnostics|REPRODUCED using original offline solver, byte-identical roots/stability; solver algorithm itself not reimplemented|
|RK4 state/work histories, four rates|REPRODUCED: all 88 frozen tests pass, 0 domain exits; compressed traces byte-identical|
|DOP853 accuracy, execution-time distributions|CONSISTENT BUT NOT INDEPENDENTLY VERIFIED; saved artifacts inspected only|
|Printed ordinary front wheel speed|DISCREPANT with equations under stated rounding/parameters; cause unresolved|
|Broad tire passivity, actual-vehicle drift realism|NOT TESTED/proved; instantaneous power sign is a narrower property|

Frozen comparison budgets: state A=[1e-4,1e-4,1e-6,1e-3,1e-3] in manifest units, max normalized error <=1; energy/work residual <=0.001 J. Maximum normalized error at 100/200/400/800 Hz was 0.0550983/0.00258861/0.000138936/0.00000804182; maximum ledger residual 4.81205e-5/2.32092e-6/1.28476e-7/2.09298e-8 J. Equality of regenerated numerical fields is stronger than those budgets within this same environment; it does not establish cross-platform bitwise equality.

## Hashes and independent-analysis reproducibility

SHA-256, saved and regenerated respectively:

|Artifact|Saved|Regenerated|
|---|---|---|
|fixtures.json|`edc3389fb7a6ef262ff42746cd22d394a9da17e39b5893f6f06347ba6ecd9061`|same|
|equilibria.json|`471dc25cd12ed4c4ebd89744e1cd09c86c8efe8c3c46aafd21d2169eefc58457`|same|
|rk4-traces.json.gz|`d3d74b45f53e8ca56758e33ce9c37c0b460a5223e1108521fe022a657b370bf7`|same|
|stability.json|`2d0f2eeebb093be365bb1d023ae58419849ace8c648c1af1e44bd83929673a3c`|same|
|validation.json|`d09b79e703ee972c32cf5bbdda688a112786014e5687f3a109e5d12087a5a057`|`c4faeb8004b68a1464c583124ddf98acdcfd2ed4166a762f8e8d8bcf95adcf48`|

The fresh pointwise analysis was executed with `node /tmp/mission17-diagnostics.mjs`, `python3 /tmp/mission17-integral-check.py` and `python3 /tmp/mission17-storage-check.py`. These temporary analysis files are not additions to the reference. The exact mathematical recipes and counts are preserved in [physical suitability](aligning-moment-physical-suitability.md), so they can be reconstructed without modifying numerical code. Diagnostic summary JSON hash: `afc407ecd1997a36ad07244fddee12e1bfd9ee4cc363e3cd0b0e691036791bed`; independent distributed-power JSON hash: `bb8917a7abd711c17d216b9604ea2e436739813e8861445f8f4fcb41c00e4a03`. Runtime logs/raw temporary data remain outside the repository, per documentation-only scope.

Sources and executable artifacts: [reference README](../../research/scientific-rebuild/reference-model/README.md), [tire](../../research/scientific-rebuild/reference-model/tire.mjs), [model](../../research/scientific-rebuild/reference-model/model.mjs), [RK4](../../research/scientific-rebuild/reference-model/integrate.mjs), [offline validator](../../research/scientific-rebuild/reference-model/offline.py), [saved validation](../../research/scientific-rebuild/reference-model/results/validation.json), [Mission 16 report](isolated-reference-validation-report.md). No foundational fixture failed; no dependent results were accepted after a failed gate.
