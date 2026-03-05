# Performance & Stability Validation

This document defines a lightweight process for validating optimization and handling-stability changes in VerletDrift.

## How to profile (minimal-overhead Chrome trace setup)

1. Run the game normally (no debug overlays, no extra console logging).
2. Open Chrome DevTools → **Performance**.
3. Keep instrumentation lightweight:
   - Enable screenshots **off**.
   - Enable memory timeline **off**.
   - Record on a warm session (after assets/audio have initialized).
4. Capture a 20–30 second run that includes:
   - straight-line acceleration,
   - repeated turn-in events,
   - sustained drift and recovery transitions.
5. Save the trace and annotate it with build/branch and scenario notes.

### Trace review checklist

- Confirm consistent frame pacing (no prolonged long-frame clusters).
- Check scripting time per frame against the CPU budget.
- Inspect physics update cost spikes around drift initiation/recovery.
- Verify no recurring GC-like stalls during steady-state driving.

## Before/After feel checks

Perform these checks with the same input sequence and camera setup before and after each optimization/stability change.

- **Turn-in response:** Initial steering input should produce predictable yaw build-up without a delayed “dead” region or sudden snap.
- **Drift onset/recovery:** Drift should start progressively under throttle/steer load, and recovery should re-center without abrupt overcorrection.
- **Oscillation absence:** After a steering release or counter-steer correction, yaw/lateral motion should settle cleanly without sustained fishtailing.

## Numeric acceptance thresholds

A change is acceptable only when all thresholds pass in the target scenario.

- **Dropped substeps:** `<= 0.5%` of physics substeps dropped over a 30s stress segment.
- **Yaw settle time:** `<= 0.8s` to settle within `±5%` of steady-state yaw after a step-steer release.
- **CPU/frame budget:** `<= 4.0ms` average scripting + physics time per frame over the capture window, with no recurring spikes above `8.0ms` more than once per 5 seconds.

## Reporting template

When posting results, include:

- Scenario name and build/commit ID
- Hardware/browser details
- Before/after metrics for all three thresholds
- A short qualitative note from the feel checks
- Link to trace artifact
