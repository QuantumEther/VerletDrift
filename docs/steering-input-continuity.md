# Mission 6 — Steering input continuity and refresh shortcuts

Branch: `fix/steering-input-continuity`, based on `research/vehicle-behavior-audit` at `3870cc9`. No merge. Mission 5 evidence and scripts are unchanged.

## Reproduced failures and corrections

Before modifying production, actual Chromium mouse/keyboard tests reproduced the pending-command loss, isolated one-pixel re-grab, and modified-R interception. Regression expectations failed normally; no expected-failure annotations or tolerance changes conceal them.

| Defect | Cause | Correction |
|---|---|---|
| Pending mouse command disappears | `renderFrame()` borrowed shared steering fields for interpolation, then restored `curr.wheelAngle`, which could predate the last mouse event | Save both live steering angles on render entry and restore those exact values in `finally`, including on a drawing exception |
| Re-grab centers an already turned wheel | Drag mapping retained pointer origin but omitted the current wheel angle | Capture `dragStartAngle` on mouse-down; add the existing pixel-to-radian mapping to that baseline, with existing locks |
| Modified R prevents reload and starts engine | Default suppression and held-key mutation ran before a modifier guard | Return for Ctrl/Meta/Alt/Shift-modified R before suppression, held-key mutation or dispatch; bare R retains existing finite-start policy |

Shift+left drag also now remembers its initiating button, so releasing Shift before the mouse does not leave steering stuck. Releasing an independent left-button throttle drag does not cancel right-button steering. Canvas exit, blur and hidden-tab release behavior remains intact.

## State ownership and changed files

- `js/input.js`: owns `isDragging`, `dragStartX`, `dragStartAngle`, `dragButton`, and mouse writes to `wheelAngle`. Adds the R modifier guard and continuous drag origin. No new sensitivity, filtering or damping.
- `js/state.js`: declares the two drag-origin fields and documents ownership.
- `js/main.js`: only the render scope changes. It temporarily interpolates steering, draws both Canvas/GPU world paths, and restores live angles in `finally`. The whole `runPhysicsStep()` function is byte-for-byte unchanged.
- `tests/e2e/steering-input-continuity.spec.js`: actual application events and controlled actual RAF callbacks; command delivery, re-grab, locks, release, modifiers, starter and mixed controls.
- `tests/e2e/steering-native-refresh.spec.js` and `helpers/native-refresh.py`: headed Linux/X11 native-key tests against both the preserved original input module and the repair. No simulated reload handler.
- `tests/e2e/steering-physics-parity.spec.js`: seven matched Mission 5 replays against source served from the preserved audit commit.
- `tests/e2e/steering-render-paths.spec.js`: Canvas and real software WebGPU command paths, using the existing offscreen-target helper.

`wheelAngle` remains one authoritative writable field: the driver command while dragging, and the physical column's visual mirror otherwise. `frontWheelAngle` and angular velocity/acceleration/jerk belong to `physics/steering.js`. That module alone advances those physical fields; its equations are unchanged. Input owns the drag origin, not a second evolving physical angle.

`makeBodySnapshot()` captures `steerAngle` and `wheelAngle`; the fixed-step loop advances `snapPrev`/`snapCurr` only at its existing points. These snapshots are drawing inputs, not authoritative pending commands. World rendering temporarily writes interpolated angles; HUD drawing runs after restoration. JavaScript input callbacks cannot interleave with this synchronous drawing scope, so a subsequent mouse-down sees the live command/column mirror rather than a stale interpolation value. A drawing exception also cannot leave interpolated steering in the simulation. This does not promise continued rendering after an unrelated drawing exception.

## Measured steering traces

Visual/command and road angles are radians; velocity is road-angle rad/s. Physics is 100 Hz, default maximum road angle .52 rad, drag range 150 px.

| Scheduling event | Original command / road angle | Repaired command / road angle |
|---|---:|---:|
| Right drag +30 px, pending at simulation time .01 s | 1.570796327 / 0 | 1.570796327 / 0 |
| Render-only frame at timestamp 1012 ms | **0 / 0** | **1.570796327 / 0** |
| Additional render-only frames, 1013 and 1014 ms | Command already lost | 1.570796327 / 0 |
| Next applicable physics tick | 0 / 0 | 1.570796327 / **.104** |

The regression retains the exact mouse → render-only frame → next-physics sequence from Mission 5 and extends it to several frames. D/S/A stay held and a gear-2 request stays visible throughout.

| Render schedule after those render-only frames | Command survives all eight scheduled frames | First applicable tick road angle |
|---|---|---:|
| Approximately 60 Hz, 16.667 ms/frame | Yes | .104 |
| Approximately 120 Hz, 8.333 ms/frame | Yes | .104 |
| Approximately 240 Hz, 4.167 ms/frame | Yes | .104 |

A frame before the next 100 Hz tick correctly retains the previous physical angle of zero; it does not prematurely apply a pending command. These are deterministic scheduling tests, not claims about measured monitor refresh rates.

| Isolated re-grab from .2 rad, rightward 1 px | Before | After |
|---|---:|---:|
| Road angle after steering tick | .003466666667 | .203466666667 |
| Column angular velocity | −19.653333333333 | .346666666667 |
| Road angle after release and one free-column tick | −.112961520988 | .205423664198 |

Release itself changes neither angle nor velocity. The small subsequent motion is the existing free-column dynamics acting on the genuine one-pixel velocity; no damping or derivative reset was added. Additional cases cover −.52, −.2, 0, .2 and .52 rad, immediate re-grab after free motion, monotonic movement and clamping at both locks. Angle/velocity comparisons use 12 decimal places, rather than permissive handling tolerances.

## Browser shortcuts and starter

Actual headed Chromium on a dummy Xorg display received native XTest Ctrl+R and Ctrl+Shift+R. Each changed `performance.timeOrigin`, proving document reload. Both failed to reload with the preserved original input module: `defaultPrevented=true`, held R true, starter command `start`. With the repair both reload, with `defaultPrevented=false`, no held R and no starter command.

Playwright/CDP keyboard events alone did **not** execute native browser reload accelerators, even in headed mode. Therefore they were used only for handler assertions; the native test uses real X11 keys and observes navigation separately.

| Input/state | Verified result |
|---|---|
| Bare R, stopped/stalled | Queues `start`; existing input-reliability test also observes finite starter motion |
| Running/starting | No new starter command; no ignition toggle |
| Held/repeated R | No repeated start request |
| Ctrl+R / Ctrl+Shift+R | Native reload confirmed; no starter dispatch |
| Meta+R / Alt+R / Shift+R | Handler leaves default available, no starter dispatch or held-R mutation |
| R in search/text entry | Types normally, no starter action |
| Modified R, modifier release, repeated R, keyup, fresh R | No repeat start or stuck held key; fresh bare R works |

Native macOS Meta+R and OS-specific Alt bindings were not exercised; the handler assertions verify only non-interception on this Linux host.

## Validation and limits

- **24 new browser tests passed** across focused input (20), native refresh (1), physical parity (1) and render paths (2).
- **35 relevant existing browser tests:** 33 passed, 2 failed. Coverage includes input reliability, UI integration, suspension controls, braking/driving, fault detection, console guards and GPU diagnostics.
- The two failures also reproduce against a read-only archive of `3870cc9`: `wheel-braking`'s low-traction test directly changes engaged gear without reconciling the new requested-gear state, then assumes exact locked RPM/wheel agreement; its number-row test expects immediate engagement despite finite shift mechanics. Their live timing/numeric values vary. Neither test was edited.
- **Full unit suite before and after: 274 passed, 7 failed (281 total).** Four existing `drivetrain-operation` static-clutch heat failures at 50/100/200/400 Hz; three existing `wheel-omega-audit` expectations for exact idle, instantaneous over-rev synchronization and pre-contact creep torque. No assertions weakened or skipped.
- **Mechanical parity:** gentle launch, upshift, engine braking, hard braking, steering reversal, steering release and handbrake; **2,600 ticks**, every recorded mechanical value bit-identical to `3870cc9`, excluding `tickMs`. No solver anomalies. This covers engine/clutch, tire forces, chassis, suspension, shifts and stalls for those fixtures; it does not validate their physical realism.
- Canvas fallback and forced SwiftShader WebGPU paths both preserve pending steering. GPU test waits for actual readiness and checks a created render texture and no renderer error; the existing helper replaces swap-chain presentation only. Physical GPU/driver presentation and performance on the user's hardware remain untested.
- Blur and hidden-tab cleanup are synthetic DOM events; canvas exit and pointer re-entry are real mouse events. No claim of testing an actual desktop tab-visibility transition.

Representative commands (use the normal Playwright config with an installed browser):

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test steering-input-continuity steering-physics-parity steering-render-paths
node node_modules/@playwright/test/cli.js test input-reliability ui-integration wheel-braking suspension fault-detection console-guard gpu-diagnostics
DISPLAY=:96 node node_modules/@playwright/test/cli.js test steering-native-refresh
```

This cloud run used temporary configs selecting `/usr/bin/chromium`, one worker, and `/tmp` outputs. Canvas tests used `--disable-gpu`; GPU tests used `--enable-unsafe-webgpu --use-angle=swiftshader`. Native refresh needs a running X11 display, `xwininfo`, Python and `libXtst`; it skips before browser startup when no Linux DISPLAY is configured. Linux Rollup/esbuild optional binaries were installed locally for unit tests without changing dependency manifests.

Deliberately unchanged: all engine/gearbox/clutch equations and inertia; tires, grip and relaxation; SAT, column inertia/damping and steering sensitivity; suspension/load transfer, yaw damping, chassis/wheel integration, geometry, physics defaults, timestep/scheduling, rendering appearance and artwork. No Mission 02/03 physics or research coupled solver was integrated. Known contact-order yaw, tire/column instability and drivetrain work-accounting problems remain for later missions.
