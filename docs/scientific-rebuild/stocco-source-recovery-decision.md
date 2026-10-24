# Mission 19 — source recovery decision

## Verdict: PARTIALLY RECOVERED

The new primary materials recover usable geometry algorithms, their coordinate/width conventions, exact software revisions and code licenses. They verify the literal friction grouping and expose the precise positive-part function behavior. They do **not** recover a complete Hoosier 18×6-10 LCO fixture or reconcile essential constitutive moment and transport conventions. The frozen 42-case experiment remains **BLOCKED; NOT RUN**.

This verdict refers to evidence recovered, not an authorization to implement a partial model. It is not SOURCE RECOVERED; nor SOURCE REQUIRES ALTERNATIVE FIXTURE, because replacing geometry alone would leave essential mathematical ambiguities. It does not reject the authors' actual software or establish physical unsuitability.

Evidence:

- [Source inventory](stocco-source-recovery-inventory.md): supplied thesis identity/hash; journal identity; pinned ENVE, ACME, student project and author's thesis-source revisions; bounded inspection and separate rights findings.
- [Geometry recovery](stocco-geometry-recovery.md): explicit superellipse and midpoint ribs; ENVE flat/mesh contact construction. Generic geometric chord is distinct from the paper's belt-corrected length. Actual LCO profile, tread bounds, Rell, inflation and unrounded contact fixture remain missing.
- [Equation reconciliation](stocco-equation-reconciliation.md): T (C.15),(C.17) repeat global force×position order while omitting J's contradictory component expansion; sliding-region support narrows but does not close the issue. Lx=xc still conflicts with its derivative≈1 in transport. No author constitutive code resolves either. Friction cancellation is confirmed, not repaired. Required units are derived without rescaling published values.
- [Fixture completeness](stocco-fixture-completeness.md): exhaustive dependency chain and before/after statuses. R25B/MF96 data cannot substitute for LCO geometry or Stocco coefficients; reported 12 psi selection is not LCO inflation evidence.

## Exactly one next action

Obtain **one source-confirmed clarification and complete fixture package** before any implementation authorization. It must jointly provide the numerical LCO profile or equivalent rib record, belt radius, inflation/unit conventions, smoothing/normalization settings, and a consistent moment/transport specification: common reference, force/action convention, axes, chart transformation, all sliding limits, and deformation versus absolute centerline. Include one permitted unrounded `Fx,Fy,Mz,c,residual` output and contact geometry for cross-checking if available. An accessible licensed author implementation could serve as part of that evidence, but geometry software alone cannot.

This is one evidence-recovery action, not an instruction to contact authors now. No correspondence was sent. No synthetic tire, source correction, alternate model, force solver, 42-case campaign or benchmark is authorized here. A source-confirmed package can later be checked against the unchanged 42-case scope; this mission stops at the present readiness finding.

## Preservation and checks

Exactly five new Markdown files under `docs/scientific-rebuild/` are the mission deliverables. Historical Mission 13–18 records are preserved. All production VerletDrift code, manual drivetrain, visuals, controls, protected recovery branches and the executable Zhang reference remain unchanged. No merge occurred.

Verification is source inspection plus explicitly reported small algebra checks, not tire/vehicle validation. External repositories were not built or executed. Repository scope/whitespace/local-document links are checked before commit; no passing physics result or new performance measurement is claimed from a documentation-only change.
