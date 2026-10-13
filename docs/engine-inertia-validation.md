# Engine inertia and clutch validation

The engine now changes speed from a crankshaft torque balance instead of
blending directly toward a target RPM. The default effective engine and
flywheel inertia is `0.25 kg·m²` (`engineInertiaKgM2` in `state.params`). In
neutral or with the clutch disengaged, RPM follows combustion, an idle
governor, and engine friction:

```text
I_engine × dω_engine/dt = T_combustion + T_idle + T_rev-match - T_clutch - T_friction
```

In the clutch bite zone, transmitted torque follows crankshaft-to-gearbox
speed difference and is limited by clutch engagement. With the clutch fully
engaged, the engine is mechanically tied to rear-wheel speed and its inertia
is reflected through the gear and final-drive ratios into the rear-wheel
rotor solve. RPM is synchronized after that solve. This keeps the initial
model compact while making free revving, clutch loading, and stalls depend on
rotational inertia.

The model still assumes equal rear-wheel coupling and uses a simple slip-based
clutch law; it does not model individual clutch plates, gearbox inertia, gear
losses, or a calibrated engine torque map. The inertia value is a starting
estimate and can be tuned against measured RPM rise and clutch-drop behavior.
Upshift and downshift classification compares the magnitude of forward and
reverse gear ratios; signed ratios still determine wheel torque direction.
For clean shifts, hold `A` until the clutch is fully disengaged before selecting
the next gear.

Focused validation:

```bash
node /workspace/verlet-tools/node_modules/vitest/vitest.mjs run --root /workspace/VerletDrift --config /workspace/verlet-tools/vitest.config.js tests/engine-inertia.test.js
node node_modules/playwright/cli.js test --config /workspace/verlet-tools/playwright.config.js
```

The engine tests check free-rev acceleration, RPM loading through a slipping
clutch, stalling under clutch load at rest, and locked-engine RPM tracking.
The browser launch test uses the manual launch sequence: hold `A`, select first
with `Numpad7`, hold `D`, then release `A` gradually. A second browser case
checks clutch-assisted upshifting and reverse travel with `Q` + `Numpad1`.
