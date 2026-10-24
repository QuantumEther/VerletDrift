# Mission 18 — Stocco architectural assessment

## Outcome: STOCCO SOURCE BLOCKED

Gate Zero returns **SOURCE BLOCKED** for the currently available source and the authorized tire fixture. Conditional implementation authorization did not activate. No solver, fallback, research implementation directory, 42-case execution, validation report, power-result report or performance report was created. This is a reproducibility block, not a demonstrated rejection of the actual Stocco model's physical or computational suitability.

Branch `scientific-rebuild/05-stocco-tire-experiment`, based on `scientific-rebuild/04-physical-suitability-audit` at `24f2a5d7fc976db025f6e6be22dadf48efe0d944`. Exactly two documents are added:

- [stocco-source-readiness.md](stocco-source-readiness.md)
- [stocco-architectural-assessment.md](stocco-architectural-assessment.md)

## Decisive evidence

The complete supplied paper was available and verified by SHA-256 `0197da3a160fbed9ea3bb11c5d388beaba909b24e25de10f6bc3b28ba84c1082`. Missing accessibility of the paper is not the problem. Critical equations and Table 2 were visually inspected rather than trusted to text extraction.

Two independent classes of blocker remain:

1. **Fixture geometry:** the paper defines the family R(y), contact transition radius Rell and rib/contact construction, but does not supply an identified Hoosier numerical profile/contact record sufficient for this fixture. Fz=667 N and zero camber do not uniquely determine contact width, ell(y), rolling radius, area or pressure. Using a generic cylinder or unrelated patch would invent an essential physical input forbidden by this mission. A synthetic pressure choice alone would not cure that gap.
2. **Moment/kinematic interpretation:** the printed cross-product and component formulas disagree, and sliding force/moment integration limits disagree. These determine aligning moment, the carcass root and mechanical wrench power, so treating them as harmless prose errors would preselect essential physics. The source-readiness document identifies exact equations and simple algebraic contradictions. The L offset versus position derivative and parameter normalizations also need explicit interpretation.

The literal Eq.(19) can be read: its mu_k factor cancels algebraically as printed. This is recorded without replacing it by an intended-looking friction formula. Parameter unit anomalies are distinguished from missing numerical values; raw TTC data is explicitly nonblocking for a mathematically complete experiment. The gate does not demand empirical measurements merely to evaluate a known equation.

## What was established, and what was not

|Question|Result|
|---|---|
|Full paper/version and preferred published load identifiable?|Yes; Table 2 Hoosier and Fig.11 667 N are identifiable.|
|General tire/contact/carcass/friction/solver mathematical structure identifiable?|Yes; equation inventory covers (1)–(49), not a constitutive implementation.|
|One unambiguous authorized fixture closed?|No: missing physical geometry and inconsistent moment interpretation.|
|Can a guessed synthetic geometry bypass the gate?|No under current authorization; it would require an explicitly supplied/approved physical fixture, not an undisclosed numerical safeguard.|
|Author's exact fit independently reproducible?|Not established; full fixture and original data are absent.|
|Local friction dissipation law present?|Yes, Eq.(18) is source-exact; it is not by itself full tire passivity evidence.|
|GLOBAL PASSIVITY|UNRESOLVED; no full dynamic storage/transport proof or experiment performed.|
|42-case convergence/reliability/timings|NOT RUN; no invented numbers, no successful-only samples.|
|Stocco physically/computationally unsuitable?|Not demonstrated. The source-readiness block is different from candidate rejection.|

A symbolic check verified that Eq.(7)'s supplied quartic coefficients satisfy edges at 0 and 1, unit integral and the stated barycenter, despite its printed -1 edge condition. That supports a resolvable local typo; it does not fix the independent geometry or moment blockers. No tire force, root, quadrature, fitting or trajectory program was written.

Publisher supplements/errata were not established: the supplied PDF has no embedded files or identified supplement/code/data link, and the DOI landing request was blocked by the network proxy (HTTP 403). This does not assert no author code or corrected source exists. No authors were contacted. No proprietary or unclearly licensed software/data was copied.

## Smallest justified next action

Obtain **one author-confirmed fixture and equation-convention clarification package**, as precisely listed in the source-readiness document: actual R(y)/equivalent rib geometry and Rell with inflation/contact units, and corrected moment sign/region/kinematic conventions. A permitted unrounded force/moment/carcass-output record would cross-check it. This is a request for evidence, not authorization to contact authors, guess inputs, build a solver or switch tire models.

After that package exists, a separately scoped gate recheck can decide whether the unchanged 42-case proposal is executable. No architectural promotion or another implementation branch is warranted now. Do not reopen the general literature survey to avoid the blocker.

All production systems, manual drivetrain, renderer/UI/assets, protected recovery branches and the Zhang research reference remain unchanged. The final simulator's four-wheel/manual requirements remain intact; neither source blockage nor future tire implementation grants those capabilities automatically. Historical Mission 13–17 records are preserved.

**STOCCO SOURCE BLOCKED**
