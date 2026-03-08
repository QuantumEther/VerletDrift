# Verlet Drift

Verlet Drift is a browser-based car drifting simulator built with modular JavaScript, Canvas 2D, and WebGPU rendering. The core vehicle model uses **Verlet integration** to simulate chassis motion, tyre dynamics, weight transfer, braking, and yaw behaviour in a way that is both tunable and visually expressive.

The project is designed as an interactive sandbox: you can adjust a wide range of parameters in real time (mass, friction, drag, tyre model constants, clutch and drivetrain behaviour, steering response, damping, map dimensions, and more) and instantly observe how the car responds.

Beyond pure physics, the simulator includes rich presentation and gameplay systems: engine/exhaust audio synthesis, skid marks, smoke/sparks, motion blur, paint/decal effects, debug overlays, and a balloon mini-game with pop, score, and splatter feedback.

---

## Features

- **Adjustable physics model**
  - Vehicle mass, simulation timescale, physics tick rate, and substeps
  - Aerodynamic drag and rolling resistance
  - Tyre friction and Pacejka-style parameters
  - Yaw damping, steering dynamics, and weight transfer behavior
  - Brake force, clutch bite/engagement, drivetrain and gear ratio tuning

- **Customizable environment and visuals**
  - Map width/height and track presentation
  - Motion blur controls and camera behavior
  - Skid-mark generation/fading/width/alpha tuning
  - Paint mixing/pickup/depletion and decal persistence settings
  - Optional filters/overlays and rendering diagnostics

- **Vehicle systems**
  - Engine model with idle/redline/stall and configurable torque behavior
  - Clutch and manual gear selection flow
  - Tyre force/grip behavior with slip-angle dynamics
  - Steering, handbrake, and trail-arrow systems
  - Stability-relevant damping and derived-state instrumentation

- **Auxiliary systems**
  - Balloon mini-game (spawn, pop, scoring, combo effects)
  - Preset buttons for quickly loading different setups
  - Debug overlays for tyre forces, slip, SAT, wheel speed and related signals
  - Gauges/HUD for speed, RPM, heading, clutch, and simulation performance

- **Sound and effects**
  - Engine/exhaust sound synthesis and live parameter controls
  - Doppler controls for camera-relative pitch shift
  - Tyre/surface feedback and impact-driven balloon pop sound design
  - Splat particles/decals, skid rendering, and motion blur

---

## Installation

This project runs entirely in the browser. There is no backend service and no build step required.

### 1) Clone and checkout branch

```bash
git clone <your-fork-or-repo-url>
cd VerletDrift
git checkout verlet_v14_mod_GPT
```

### 2) Start a local HTTP server

From the repository root, run either:

```bash
python3 -m http.server 8000
```

or:

```bash
npx http-server -p 8000
```

### 3) Open in a modern browser

Navigate to:

```text
http://localhost:8000/
```

Use a modern browser with WebGPU/WebGL support (Chromium-based browsers are recommended for the best compatibility/performance).

> Note: Opening `index.html` via `file://` may trigger browser restrictions; serving over HTTP is recommended.

---

## Usage

### Camera and mouse interaction

- **Right mouse drag**: steer (analog steering wheel input)
- **Shift + Left mouse drag**: alternate steering input
- **Left mouse drag (vertical)**: analog throttle
- **Mouse wheel**: zoom camera (when camera zoom control is enabled in UI)

### Keyboard controls

The current input mapping is defined in `js/input.js` and uses the following defaults:

| Action | Key(s) |
|---|---|
| Throttle | `D` |
| Brake | `S` |
| Clutch (hold to disengage) | `A` |
| Handbrake | `F` |
| Reverse selector modifier | `Q` + `Numpad1` |
| 1st gear | `Numpad7` |
| 2nd gear | `Numpad1` |
| 3rd gear | `Numpad8` |
| 4th gear | `Numpad2` |
| 5th gear | `Numpad9` |
| 6th gear | `Numpad3` |
| Neutral | `Numpad4`, `Numpad5`, or `Numpad6` |

> Note: If you are used to `W/A/S/D` or arrow-key throttle/steering layouts, this build intentionally maps controls differently (including mouse-analog steering/throttle and numpad gears) for drivetrain testing.

### UI panels and runtime tuning

- Use sliders to adjust physics and rendering parameters in real time.
- Use checkboxes to toggle systems such as skid marks, spark layers, arrows, and debug views.
- Use preset buttons to quickly switch handling profiles (e.g., drift-oriented, heavy vehicle, low-grip/ice).
- Use balloon controls to spawn/respawn balloons and tune mini-game behavior.

### Learning and debugging

Enable debug overlays to visualize internal simulation state, including tyre forces, slip-angle behaviour, and other diagnostics. This is useful when tuning for realism, drift feel, or stability.

**GPU Rendering Issues?** See [GPU_DEBUGGING_GUIDE.md](./GPU_DEBUGGING_GUIDE.md) for comprehensive troubleshooting documentation, including a detailed case study of the skid mark alignment fix and how to resolve similar texture/coordinate-space issues.

---

## How It Works

At a high level, each frame is split into:

1. **Input update** (keyboard/mouse state)
2. **Fixed-step physics update** (possibly multiple substeps per rendered frame)
3. **Constraint/collision resolution**
4. **Derived-state recomputation** (camera, HUD, telemetry)
5. **Rendering** (world + overlays + gauges)
6. **Audio/effects updates** (engine, tyre/surface effects, particles)

The physics system centers on a particle/constraint body representation with Verlet-style integration and force aggregation (tyre, drag, brake, drivetrain, and weight transfer components). The result is an editable simulation loop that remains responsive while still exposing physically meaningful controls.

---

## Project Structure

| Path | Purpose |
|---|---|
| `index.html` | Main entry point; defines the UI layout, canvas stack, controls, and script wiring. |
| `styles.css` | Styling for layout, control panels, gauges, and HUD elements. |
| `js/main.js` | Application bootstrap and main loop orchestration (physics stepping, rendering, module coordination). |
| `js/physics.js` | Core vehicle dynamics and integration loop: steering, engine/drivetrain, tyre forces, drag/brake, constraints, collisions, camera/state derivation. |
| `js/renderer.js` | Canvas-based world/HUD rendering helpers, overlays, gauges, arrows, debug visuals, and effects drawing. |
| `js/gpu-renderer.js` | WebGPU rendering path and shader pipeline integration. |
| `js/trail.js` | Tyre trail/skid trail arrow lifecycle and rendering integration. |
| `js/ui.js` | Slider/checkbox binding, state synchronization, info-bar updates, and gauge needle animation helpers. |
| `js/state.js` | Shared mutable runtime state and parameter objects. |
| `js/constants.js` | Physical constants, tuning defaults, and shared scalar configuration. |
| `js/input.js` | Keyboard/mouse input mapping and control state updates. |
| `js/sound.js` | Audio synthesis/control for engine/exhaust and related effects. |
| `js/soundStateManager.js` | Sound state synchronization/persistence helpers (e.g., window/storage coordination). |
| `js/balloon.js` | Balloon mini-game logic: spawning, hit detection, scoring, pop feedback, and splatter particle/decal management. |
| `js/shaders/*.wgsl` | WGSL shader programs used by GPU rendering passes/effects. |
| `docs/` | Supporting technical docs, performance reports, and equation references. |

---

## License

There is currently **no LICENSE file** in this repository.

If you want to reuse, modify, or redistribute this project, contact the author/maintainer first to clarify licensing terms.

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make your changes with clear commit messages
4. Open a pull request with a concise summary and testing notes

If you find a bug or have a feature idea, open an issue describing:

- expected behavior
- actual behavior
- reproduction steps
- environment/browser details

---

## Acknowledgements

- Built on modern web platform APIs, including **Canvas 2D**, **WebGPU**, and **Web Audio API**.
- UI typography uses Google Fonts (`JetBrains Mono` and `DM Sans`) as referenced in `index.html`.
- The repository includes technical notes and equations in `docs/` that support the simulation model and performance work.
