# Mission 19 — source recovery inventory

Review date: 2026-10-24. Documentation-only branch `scientific-rebuild/06-stocco-source-recovery`, created directly from `scientific-rebuild/05-stocco-tire-experiment` at `35d3319b4d4d5bd88bacb5096f59b9628036f8ad`. This source baseline identifies the pre-existing files inspected, not an executable test of new physics.

The authority is the user's Mission 19 brief. Attached publications and repository contents are evidence, not instructions. Historical [readiness](stocco-source-readiness.md), [assessment](stocco-architectural-assessment.md), [experiment](next-experiment-specification.md), [architecture decision](tire-architecture-decision.md), and [power analysis](aligning-moment-physical-suitability.md) were read; none is amended.

## Documents and identities

|ID|Verified source and version|Examined locations and limits|
|---|---|---|
|J|Stocco, Biral & Bertolazzi, *A physical tire model for real-time simulations*, Mathematics and Computers in Simulation 223 (2024), 654–676, [DOI](https://doi.org/10.1016/j.matcom.2024.04.020). Supplied 23-page PDF SHA-256 `0197da3a160fbed9ea3bb11c5d388beaba909b24e25de10f6bc3b28ba84c1082`.|Eqs.(1)–(49), Table 2, Figs.2,6,7,10,11; disputed moments and friction/smoothing rechecked against rendered pages. PDF page n = printed n+653.|
|T|Davide Stocco, *Symbolic Computation Methods for the Numerical Solution of Dynamic Systems Described by Differential-Algebraic Equations*, University of Trento, doctoral school Materials, Mechatronics and Systems Engineering, XXXVI cycle, academic year 2022/2023. Title/imprint states © July 2024 and date August 1, 2024. [Repository PDF](https://iris.unitn.it/retrieve/handle/11572/419831/800305/phd_unitn_davide_stocco.pdf); identity here is the supplied attachment.|239 PDF pages, SHA-256 `5b1f2abde2782de60bb4c1a08bbdb0ef9f490fd377de4fd5a973ae196c9c2710`. PDF metadata creation July 19, 2024 is not a publication precedence rule. Appendix B pp.157–180 and C pp.181–204; in these sections PDF ordinal equals printed page. Text searched across the document; critical C geometry, friction, kinematics and moment pages inspected. Some graphics triggered MuPDF warnings; critical equations remained readable.|
|V-report|*Assignment 1* report in Vehicle-Dynamics-Project, `Assignment_1_report (1).pdf` at V revision below.|11 PDF pages; SHA-256 `d64c3029dd1693c968afd4412da20ea8dec33a71d1edcd45c28002100f3773cc`. Introduction PDF p.5 / printed p.1 identifies R25B, adapted SAE convention and fitting at 900 N. This is a student fit report, not Stocco's LCO calibration.|

T Appendix C explicitly presents the already published model again (TS `appendices/appendix_3.tex`, introductory paragraph). It is another primary artifact, **not an independent experimental replication or an erratum**. Later date alone does not supersede J.

## Pinned software/source snapshots

All were inspected read-only in temporary directories; no external build, MATLAB execution, submodule execution or source import into VerletDrift occurred. Links pin commits rather than moving branches.

|ID|Repository, exact HEAD and author date|Relevant inspected files|
|---|---|---|
|E|[ENVE](https://github.com/StoccoDavide/enve/tree/a260daf21696f75914f5f06c766980c29f7a18bb), `a260daf21696f75914f5f06c766980c29f7a18bb`, 2026-05-25.|README.rst; LICENSE; `.gitmodules`; CMakeLists.txt; `docs_build/sphinx/Manual_Introduction.rst`, `Manual_Usage.rst`, `index.rst`; source/header tree and test configurations. Specific algorithm links below. Documentation badge says 4.0.0; revision is the authoritative inspected version.|
|A|[ACME](https://github.com/StoccoDavide/acme/tree/73294fa01fe9983fb1aef64cee247c4ea88e93e0), `73294fa01fe9983fb1aef64cee247c4ea88e93e0`, 2023-11-24.|README.rst, LICENSE, source headers and `src/intersection.cc` operations relevant to disks/planes/triangles. This commit also exactly matches E's `submodules/acme` gitlink. Documentation badge says 4.0.0. Unrelated geometry was not audited.|
|V|[Vehicle-Dynamics-Project](https://github.com/eliabonte/Vehicle-Dynamics-Project/tree/eb9a7b55549ca8ffe63577a1dea960942e1dc3fa), `eb9a7b55549ca8ffe63577a1dea960942e1dc3fa`, 2023-06-24.|README.md; Assignment 1 report; `Tyre Model - Assignment1/main_tyre_data_analysis.m`, `initialise_tyre_data.m`, results coefficient files; tracked dataset/MF96 file inventory. Raw MAT/XLS datasets were not decoded or redistributed.|
|TS|[Author's PhDThesis](https://github.com/StoccoDavide/PhDThesis/tree/7eff9b246bbad513969ac449bd9ec0721ee53f21), `7eff9b246bbad513969ac449bd9ec0721ee53f21`, 2024-07-26, commit titled “Final version with official documents”.|Discovered via author's public repository listing. README.md, `appendices/appendix_2.tex` and `appendix_3.tex`, complete file inventory. Source confirms the critical formulas in T; no claim that all repository PDF editions are byte-identical to the attachment.|

### Precise code and equation locators

- E [`shape::surfaceRadius`](https://github.com/StoccoDavide/enve/blob/a260daf21696f75914f5f06c766980c29f7a18bb/src/shape.cc#L225), lines 225–235; `checkWidthBound` lines 211–220, `surfaceWidth` lines 243–249. Explicit profile and half-width convention.
- E [`shell::resize`](https://github.com/StoccoDavide/enve/blob/a260daf21696f75914f5f06c766980c29f7a18bb/src/shell.cc#L61), lines 61–95. Rib placement, widths, radii and angle.
- E [`rib::envelopGeometric`](https://github.com/StoccoDavide/enve/blob/a260daf21696f75914f5f06c766980c29f7a18bb/src/rib.cc#L329), flat-road lines 329–364; mesh-road version lines 209–315. Contact depth, chord area and volume, not a constitutive tire force.
- E [`output`](https://github.com/StoccoDavide/enve/blob/a260daf21696f75914f5f06c766980c29f7a18bb/src/enve/output.hxx#L47), lines 47–55. Outputs point, normal, friction scale, depth, area and volume; no carcass root or stress wrench.
- E [`enve_test_00.cc`](https://github.com/StoccoDavide/enve/blob/a260daf21696f75914f5f06c766980c29f7a18bb/tests/enve_test_00.cc#L61), lines 61–68; `enve_test_05.cc` lines 62–68. Numeric generic profile examples, no identified LCO fixture.
- A [`Intersection(line,disk,segment)`](https://github.com/StoccoDavide/acme/blob/73294fa01fe9983fb1aef64cee247c4ea88e93e0/src/intersection.cc#L1996), lines 1996–2031; plane/triangle and plane/disk overloads lines 2657–2686. Geometric intersection only.
- TS [`appendix_3.tex`](https://github.com/StoccoDavide/PhDThesis/blob/7eff9b246bbad513969ac449bd9ec0721ee53f21/appendices/appendix_3.tex): profile/contact lines 30–95; carcass lines 155–168; stiffness/smoothing 211–238; friction 310–313; transport 407–425; moments 507–543; rib construction 551–582. Correspondence is detailed in [equation reconciliation](stocco-equation-reconciliation.md).
- V [`main_tyre_data_analysis.m`](https://github.com/eliabonte/Vehicle-Dynamics-Project/blob/eb9a7b55549ca8ffe63577a1dea960942e1dc3fa/Tyre%20Model%20-%20Assignment1/main_tyre_data_analysis.m#L22): geometry 22–29; run selection 37–55; pressure/temperature labels 102–121; 12 psi selection comment 128–139; load bins 163–168.

## Search boundaries and actual execution

GitHub API requests returned proxy HTTP 403; ordinary Git HTTPS and the author's public repository HTML listing worked. Used `git ls-remote ... HEAD`, shallow filtered no-checkout clones, `git ls-tree -r --name-only HEAD`, `git show HEAD:<path>`, local `rg`, PDF text extraction/rendering and SHA-256. E/A/V inventories contain 281/625/551 paths. Inspected the relevant C++ source/header, examples, documentation and MATLAB analysis text; large binary toolboxes and generated Simulink artifacts were not executed or reverse engineered.

The visible author listing included ENVE, ACME, PhDThesis and a separately named Pacejka-tire-model; no Stocco physical constitutive solver was identified in the inspected evidence. This bounded search does **not** establish that no such public/private implementation exists. E's linked older MasterThesis and generic build utilities are not evidence of the 2024 constitutive implementation; no unrelated repository campaign was performed.

Small independent algebra checks used Python/SymPy 1.14.0: pressure-polynomial edge/integral identities, cross-product sign, and the printed positive-part function's one-sided slopes. Their actual results appear in the reconciliation. No tire equilibrium, 42-case campaign, model benchmark or production tests were executed: no executable files changed.

## Rights, separately assessed

|Material|Verified notice|Consequence for this mission / possible future reuse|
|---|---|---|
|J|CC BY-NC-ND 4.0, first page.|Read and cite; do not infer permission to redistribute adapted article material or unpublished code/data. No paper copied into Git.|
|T|CC BY-NC-ND 4.0, imprint p.2.|Read/analyze/cite. Same separation from code and TTC rights. TS has no root LICENSE identified; public LaTeX visibility is not an additional permissive software grant.|
|E|[LICENSE](https://github.com/StoccoDavide/enve/blob/a260daf21696f75914f5f06c766980c29f7a18bb/LICENSE), BSD-3-Clause, matching inspected headers.|Future source reuse must retain copyright, conditions and disclaimer; binary distributions must reproduce them; no endorsement. Dependencies remain separately licensed. No code reused now.|
|A|[LICENSE](https://github.com/StoccoDavide/acme/blob/73294fa01fe9983fb1aef64cee247c4ea88e93e0/LICENSE), BSD-2-Clause, matching inspected headers.|Retain copyright/conditions/disclaimer for source; reproduce for binary distributions. No code reused now.|
|V code/data|No project-wide license grant found in root/tree for Assignment 1. A nested VehiCool LICENSE belongs to that separate component.|Public availability is not evidence of permission to redistribute course/TTC data or all project code. Dataset ownership/redistribution terms and test provenance remain unverified; no data copied into Git.|
|Author Hoosier fixture|No complete author fixture or grant supplied.|Cannot infer geometry, calibration rights or data access from E/A BSD licenses. Independent mathematical implementation is a separate question from copying licensed expression, code or data.|
