# Changelog

All notable changes to VerletDrift are documented here.

## [Unreleased]

### Optimization
- Added a **minimal-overhead profiling workflow** based on Chrome trace captures to measure frame pacing, physics substep load, and main-thread hotspots with production-like settings.
  - **Rationale:** Profile data should reflect player-facing performance; reducing profiler overhead avoids optimizing for instrumentation artifacts instead of real bottlenecks.
- Standardized performance validation around an explicit **CPU/frame budget** and **dropped-substep monitoring**.
  - **Rationale:** A fixed budget and a substep health metric make regressions easy to detect and compare across hardware and tuning iterations.

### Stability
- Added repeatable **before/after feel checks** for turn-in response, drift onset/recovery behavior, and oscillation absence.
  - **Rationale:** Handling quality is perceptual; codifying feel checks prevents accidental regressions that pass purely numeric tests.
- Added numeric acceptance thresholds for **dropped substeps**, **yaw settle time**, and **CPU/frame time**.
  - **Rationale:** Stability work needs objective pass/fail gates so tuning discussions are anchored in measurable outcomes.
