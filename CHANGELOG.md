# Changelog

All notable changes to VerletDrift are documented here.

## [Unreleased]

### New Features
- **Four new real-time gauges** (v15 gauge expansion):
  1. **Yaw Stability Margin**: Circular dial where needle rotates ±140° and grows in length as yaw rate approaches the stability limit (2.0 rad/s). Visual indicator of oversteer/spin risk.
  2. **Friction Circles (Front & Rear)**: Two separate tiles plotting normalized axle force vectors (FxN, FyN) inside a unit circle. Shows combined traction/steering saturation and grip reserve per axle.
  3. **Slip Angle Meter (β)**: Horizontal bar meter showing magnitude of vehicle slip angle (±45°). Spring-smoothed indicator with color zones (green/yellow/orange/red).
  4. **Drift Stability Radar**: Six-axis spider chart visualizing drift health. Each axis normalized to [0,1]: Yaw Margin, Rear Saturation, Front Authority, Slip Angle, Countersteer Alignment, Speed Ratio. Polygon morphs smoothly with spring-smoothed values.
  - All gauges integrated into existing grid layout; no breaking changes
  - Custom renderers (`drawYawStabilityGauge`, `drawFrictionCircle`, `drawSlipAngleMeter`, `drawDriftRadar`) in `renderer.js`
  - Reuse existing needle physics system for smooth spring-damped animation
  - Zero per-frame allocations; direct state access for telemetry

- **Telemetry export**: New state fields for gauge rendering:
  - `state.wheelForces`: Per-wheel longitudinal/lateral forces (N) in world-space
  - `state.axleForces`: Aggregated front/rear forces and normal loads for friction circles
  - Computed during `computeTireForces()` physics step

### Documentation
- **`docs/new_gauges.md`**: Complete specification of the four new gauges (v15)
  - Telemetry sources and calculation formulas
  - Rendering implementation details
  - Interpretation guide for each gauge (what the values mean for drift control)
  - Testing checklist and tuning parameters

- **`docs/performance_audit.md`**: CPU hotspot analysis and optimization roadmap
  - Identified three Tier-1 bottlenecks with estimated savings (10–25% total reduction possible)
  - Tier-2 and Tier-3 analyses for completeness
  - Profiling instrumentation snippets (disabled by default)
  - Prioritized optimization roadmap (Phases 1–4)

### Optimization
- Added a **minimal-overhead profiling workflow** based on Chrome trace captures to measure frame pacing, physics substep load, and main-thread hotspots with production-like settings.
  - **Rationale:** Profile data should reflect player-facing performance; reducing profiler overhead avoids optimizing for instrumentation artifacts instead of real bottlenecks.
- Standardized performance validation around an explicit **CPU/frame budget** and **dropped-substep monitoring**.
  - **Rationale:** A fixed budget and a substep health metric make regressions easy to detect and compare across hardware and tuning iterations.
- New gauge renderers designed for zero per-frame allocations (reuse state objects; no temporary arrays in draw loops)
  - Gauges use pre-created needle physics instances; smoothing shared with existing gauges
  - Estimated performance impact: negligible (<1% frame time for 5 additional gauges at 60 FPS)

### Stability
- Added repeatable **before/after feel checks** for turn-in response, drift onset/recovery behavior, and oscillation absence.
  - **Rationale:** Handling quality is perceptual; codifying feel checks prevents accidental regressions that pass purely numeric tests.
- Added numeric acceptance thresholds for **dropped substeps**, **yaw settle time**, and **CPU/frame time**.
  - **Rationale:** Stability work needs objective pass/fail gates so tuning discussions are anchored in measurable outcomes.
