# Live control workspace and instruments

The main application now uses the proposal-11 dashboard and proposal-9 control
workspace. The mockup files remain independent design references. The production
page imports no sample snapshots or mockup assets.

## Ownership and data flow

- `js/main.js` owns initialization, input, the physics loop, rendering and sound.
  Vehicle initialization and balloon spawning run before the first frame.
- `js/ui/control-data.js` lists all 176 controls: 160 sliders and 14 checkboxes in
  the workspace, plus the two canvas/GPU resolution sliders above the canvas.
- `js/ui/controls.js` owns bidirectional DOM/state bindings. Vehicle controls write
  to `state.params`; sound controls write to `state.soundParams` through the sound
  manager. Canvas resolution is a view setting read by the renderer. Presets,
  imports, reset, and direct edits use these same bindings.
- `js/ui/workspace.js` builds the nine categories and 37 subsystem cards and owns
  filtering, animations, responsive packing, gauge folding, and layout persistence.
- `js/ui/instruments.js` reads actual vehicle state. It updates the 19 instruments
  and compact folded readouts at up to 30 Hz without adding a second game loop.
- `js/ui.js` maintains the existing live info bar and diagnostic logging.

## Units and synchronization

The trail-spawn slider remains logarithmic: raw 0–100 maps to 0.001–10 seconds.
Gauge label scale maps raw 60–160 to 0.6–1.6. Sliding friction is stored as a
coefficient, with percentage formatting applied only to the display. Metadata
separates `valueScale` (state conversion) from `displayScale` (presentation).

Mass, friction, CoG height and pneumatic-trail ranges/steps accommodate the exact
values in the existing presets, including the 165 kg kart and 0.28 ice friction.
Old preset fields `mass` and `rollResistCoeff` have been corrected to the names
consumed by physics. Unused yaw-torque/downforce/brake-multiplier fields are not
reintroduced as fictitious physics parameters.

Preset files contain `params`, `soundParams`, and optionally `view`. Imports
validate the whole file before applying changes, reject unknown or invalid
settings, and enforce ordered min/max pairs. Older exports with the known alias
fields are accepted; canonical fields take precedence. Layout choices are stored
separately under `verletdrift.gauge-layout.v1` and are not vehicle tuning settings.

Sound preferences preserve valid zero values, update audio nodes immediately,
and synchronize across windows. The app and layout controls remain usable when
browser storage is disabled. Engine ignition has one event handler. Driving keys
are ignored while editing controls, and held input is released on blur.

RPM warnings and the redline marker follow the actual redline setting. Tire-slip
zones and folded warnings follow the peak-slip setting. Grip circles use axle
forces divided by μN; yaw, slip angle, lateral G, wheel utilization/slip, jerk,
drift, and blur come from their existing simulator fields. Nonfinite telemetry
keeps the last valid plots and displays a diagnostic status instead of writing
invalid SVG coordinates. Engine-off/stalled conditions are displayed explicitly.

## Validation

The cloud workspace uses the pinned Linux test dependencies in
`/workspace/VerletDrift-tools`, because the checkout contains tracked Windows
`node_modules`. The helper refreshes test copies and uses symlinks to the actual
application modules and physics comparison scripts.

```bash
bash /workspace/VerletDrift-tools/run-tests.sh unit
bash /workspace/VerletDrift-tools/run-tests.sh e2e
```

`tests/e2e/ui-integration.spec.js` covers every binding, all five presets,
percentage/logarithmic/scaled conversions, atomic import validation, actual file
import/export, single ignition toggling, audio startup, cross-window sound
synchronization, typing isolation, driving, real telemetry, warnings, folding,
persistence, mobile layout, and storage restrictions. Existing physics, braking,
handbrake, suspension, fault-detection, and console-guard tests also run.

Browser validation uses system Chromium with the Canvas 2D fallback. The WebGPU
renderer and its shaders are retained; hardware WebGPU performance and audible
sound quality require a check on a suitable interactive machine.
