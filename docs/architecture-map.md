# Architecture Map

## Module boundaries

### `js/main.js` (orchestrator)
- Owns startup wiring, fixed-step loop, and render loop coordination.
- Calls explicit module APIs in deterministic order.
- Does not own core physics/render algorithms.

### Physics (`js/physics/*`)
- `kinematics.js`: body state derivation + Verlet integration + angle helpers.
- `engine.js`: steering, engine/clutch/camera, sleep, audio bridge.
- `tires.js`: load transfer, tire/drag/brake force computation.
- `constraints.js`: rigid-body distance constraints + displacement clamping.
- `collision.js`: map boundary collision resolution.
- `legacy.js`: implementation source used by the responsibility modules.

### Renderer (`js/renderer/*`)
- `world.js`: world-space pass (camera transform domain).
- `hud.js`: screen-space HUD.
- `gauges.js`: dedicated gauge rendering functions.
- `effects.js`: spark/effects updates + draw calls.
- `debug.js`: debug overlays.
- `legacy.js`: implementation source used by the responsibility modules.

## Update order contract (per physics sub-step)
1. Steering/engine updates (`engine`).
2. Load transfer + tire/drag/brake forces (`tires`).
3. Integration (`kinematics`).
4. Constraints (`constraints`).
5. Collisions (`collision`).
6. Constraints again (`constraints`).
7. Recompute derived body state (`kinematics`).
8. Sleep/camera/audio + gameplay hooks (`engine` + orchestrator-owned systems).

This keeps submodule side effects explicit: state mutations are expected only through exported API calls from each module.
