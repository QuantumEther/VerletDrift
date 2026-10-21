# VerletDrift audit evidence bundle

Read [REPORT.md](REPORT.md) for the complete A–L report. [SUMMARY.csv](SUMMARY.csv) indexes the 63 measured trajectories. JSON files preserve raw observations; scripts reproduce the isolated experiments against the recorded repository revision. The report documents setup paths, measurement definitions and unexecuted validation.

The complete unpacked evidence is in this directory. A matching [ZIP archive](../2026-10-21.zip) is also available.

No production source, UI, defaults or existing tests were changed. Source links in the report point to the audited GitHub revision recorded in [MANIFEST.json](MANIFEST.json). The manifest's working-tree status describes the audit before publication. Artifacts use UTF-8. Figures are supplied as PNG, SVG and PDF.

Experiment scripts retain the original execution paths: `/workspace/VerletDrift` for the audited checkout, `/workspace/physics-audit` for evidence, and `/workspace/.verletdrift-tools` for external dependencies. To reproduce, copy this directory to the evidence path and follow the setup and commands in section K of the report against the recorded revision. Publication changes only Markdown links and bundle documentation; raw measurements and experiment scripts are preserved.
