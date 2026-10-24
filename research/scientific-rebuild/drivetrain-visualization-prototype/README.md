# Mission 33 — a window into the driveline

Start `python3 serve.py` at repository root and open
`http://localhost:8000/research/scientific-rebuild/drivetrain-visualization-prototype/`.

## Inspection

The permanent 2D panel shows the flywheel, separated input/output plates, gear output, carrier and rear outputs. Input markers follow flywheel angle; output follows G times mean rear angle; carrier and half-shafts follow their actual derived/individual angles. Slip is orange, locked plates have a green joined collar, and disengagement opens the illustrative gap. Gap follows the engagement command/state: it is an explanatory drawing, not another mechanical coordinate. Friction locks angular speed, not absolute phase, so old marker phase offsets are intentionally retained.

Torque arrows reverse when transmitted shaft power changes sign and grow with clutch torque magnitude. The panel explicitly says engine-to-wheels, wheels-to-engine or no transmitted power. Heat bar width comes only from calculated slip power; its indicator is inactive below 1e-9 W (roundoff threshold). Static lock never fabricates a heating animation. Grouped engine/clutch and differential panels retain torque, capacity, heat, speeds and residuals; raw wheel data are expandable.

Select 3D perspective, then Normal vehicle, Transparent chassis, or Driveline and wheels. Focus clutch provides a closer camera; reset-camera/orbit/zoom remain available. A wireframe housing encloses the flywheel and plates. Clutch input/output rotate separately when slipping. Transmission output and carrier angles are gear-derived. The rear housing and half-shafts meet the actual rear hub height; the propeller connection is a simplified link. No detailed gears, universal joints or shaft bending are simulated. Some shaft cylinders are rotationally symmetric; plate/half-shaft markers make real rotation visible.

## Interaction

W external motor torque, S wheel brakes, A/D steering, Space chassis impulse, B road bump, R reset. Clutch slider and Disengaged/Partial/Full buttons change existing engagement. Reset from rest initializes equilibrium. Reset flywheel spinning initializes 60 rad/s with clutch disengaged. Reset coasting initializes 3 m/s with a stopped flywheel. These are explicit new initial conditions, not momentum-conserving live interventions. Differential/scenario changes also reset. There is no new engine or gearbox model.

## Physics preservation

`vehicle.js`, `planar.js`, `clutch.js` and `differential.js` are byte-for-byte copies of Mission 32. `visual-state.js` is the single pure mapping used by both renderers and grouped diagnostics; it creates no evolving state. All four predecessor directories remain byte-for-byte unchanged (verified against commit 31fd7f1). Production files are untouched. The fixed ratio, clutch heat law, bounded active-set solve, carrier inertia, externally supported gear casing, simplified tire forces and reduced chassis assumptions are inherited unchanged.

## Verification

```bash
node --test research/scientific-rebuild/drivetrain-visualization-prototype/tests/*.test.js
node --test research/scientific-rebuild/clutch-driving-prototype/tests/*.test.js
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/drivetrain-visualization-prototype/tests/browser-smoke.mjs
CHROMIUM_PATH=/usr/bin/chromium node research/scientific-rebuild/drivetrain-visualization-prototype/tests/browser-3d.mjs
```

Executed: 9/9 new-exhibit tests (six retained mechanics/preservation checks and three new visual-mapping checks), plus 6/6 original Mission 32 tests, all passed. Visual tests use actual stepping to verify different slip speeds, matched locked speeds, no heat trigger at zero power, back-driving flow, and open/locked rear-speed mapping.

Chromium checks cover grouped controls, the 2D rotating panel, all reset modes, driving/braking, mode changes, and 3D render/orbit/zoom. At a controlled clock, switching top/side/3D and normal/x-ray/driveline inspection leaves an identical complete simulation snapshot. Screenshots of the cutaway were inspected. This verifies state mapping and runnable rendering, not real-world calibration. Three.js is vendored locally with its existing MIT license.
