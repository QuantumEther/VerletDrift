# Splash Laboratory

A standalone WebGPU/WGSL experiment for a large, translucent crimson balloon
splash and persistent wet ground. It uses shared launch momentum and analytical
GPU contact/deposition, not fluid simulation. It does not run or modify the
vehicle simulator. The original version is preserved on
`verlet_gpt_v23_splash_backup_c279110` (commit `c279110`).

From the repository root:

```sh
python3 serve.py
```

Open **http://localhost:8000/experiments/splash-lab/**. On Windows use
`py serve.py`. WebGPU needs a supported browser and a secure origin (localhost
works). Use the same PRIME/X11 NVIDIA browser setup already verified for the
simulator on hybrid Linux systems. `?gpuPower=low-power` is available as an
explicit adapter hint, but may select integrated graphics.

## Controls

- Impact speed: approach speed, outward pressure and transferred forward momentum.
- Liquid volume: visual extent and droplet size; nominal artistic litres,
  not a conserved fluid volume.
- Stretch & breakup: membrane perforation and filament fragmentation.
- Dye concentration: wavelength-inspired absorption/transmission and opacity.
- Replay impact / Pause / Play: replay the same seed or hold a precise instant.
- Timeline: scrub the full 8-second scene; impact is at 0.55 seconds. At 5–8
  seconds the airborne liquid has settled and the puddles remain.
- Playback: real time, half speed or quarter speed.
- Seed / New: deterministic surface, strand and droplet variation.
- Quality: fixed counts/resolution/detail budgets; no changes to animation time.

Reproducible links can specify `time`, `paused=1`, `seed`, `speed`, `volume`,
`breakup`, `concentration`, `quality`, and `gpuPower`, for example:

```
/experiments/splash-lab/?time=1.25&paused=1&seed=1337&quality=balanced
```

A paused scene does not continuously submit frames; adjusting a control,
scrubbing or resizing requests a redraw. Hidden tabs suspend the visual clock.

## Architecture and assets

- `scene.js`: pure settings/clock and immutable parameter meshes.
- `renderer.js`: resource ownership, pipelines, image upload, scene/deposition
  targets, cache and submission.
- `lab.js`: isolated controls/clock/diagnostics. No simulation state imports.
- `shaders/common.wgsl`: seeded noise, camera projection, shared launch/contact
  motion and secondary landing spray.
- `shaders/scene.wgsl`: asphalt, pooled dye/wet highlights, simplified car and balloon.
- `shaders/puddles.wgsl`: layered wet asphalt/water, Beer–Lambert transmission,
  Fresnel/GGX lighting, roughness-filtered emitter reflections and finite ripples.
- `shaders/liquid.wgsl`: airborne stages and additive world-space deposition.

The car uses a GPU copy cropped from the unchanged existing DeLorean artwork
using the existing crop metadata. Its display scale is for this laboratory;
these are not revised simulator dimensions or wheel geometry. Simple tire
silhouettes sit beneath the body. A procedural simplified car remains available
if the PNG cannot load. The original assets are never edited.

Existing reusable infrastructure: WebGPU resource/timing conventions, optional
`GPUTiming`, source crop metadata, and the repository's static development server.
The experiment has its own device and targets. It does not import `main.js`,
`state.js`, `balloon.js`, seeded physics RNG, inputs, audio or simulation systems.

The live timing readout separates CPU command encoding from GPU deposition,
scene and airborne pass timestamps when supported. GPU values are unavailable until enough frames
have rendered; pausing early may leave them blank. They exclude presentation and
are not estimates derived from JavaScript time.

Deposition is reconstructed from elapsed time into a fixed-size two-channel GPU
atlas: overlapping depth and wetness footprints accumulate spatially. It is
independent of frame history, so replay and backward seeks restore the correct
ground. After settlement the atlas is cached; no drying/fading removes the dye.
It is isolated from gameplay paint and does not alter grip.

Current technique notes, visual comparisons, measurements and limitations:
[puddle optics report](../../docs/rendering/PUDDLE_OPTICS.md) and
[momentum and deposition report](../../docs/rendering/SPLASH_MOMENTUM_AND_DEPOSITION.md).
The [original report](../../docs/rendering/PROCEDURAL_SPLASH_LAB.md) preserves the
first prototype's results and future integration outline.

Standing water is optically smoother than wetted asphalt. Thin films transmit
road markings and aggregate; deeper pools absorb more green/blue light. Pools
reflect a defined overhead rectangular light and a small distant source, rather
than a screen-space glow. Small pinned drops have curved contact normals. All
settling ripple motion is exactly zero three seconds after impact; settled water
does not continuously boil. The original airborne/deposition WGSL is unchanged.
