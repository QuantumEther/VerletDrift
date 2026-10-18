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
- Timeline: scrub the full 72-second scene; impact is at 0.55 seconds. Puddles
  begin drying six seconds after impact and progress through damp asphalt to
  dry residue. The final timeline segment shows the finished surface.
- Playback: quarter/half speed, real time or 2×, 4× and 8× speed.
- Seed / New: deterministic surface, strand and droplet variation.
- Quality: fixed counts/resolution/detail budgets; no changes to animation time.
- Liquid appearance: expand the section for the reference, thin-film and
  deep-pool presets, or tune membrane thickness, filament length, droplet size,
  surface roughness, specular strength and puddle depth. Reset controls restores
  the original material defaults.
- Vehicle–liquid interaction: expand the section to compare the original dry-car
  path with the prototype, or tune body wetness, streaking/runoff, hood deflection,
  body drying duration and optional body dye residue. Desktop controls scroll
  independently so the timeline stays accessible.
- Puddle drying: disable drying or tune its duration, stable spatial irregularity,
  asphalt absorption and optional crimson dye residue. The 72-second clock
  includes the supported drying range through the final moisture-free stained
  surface.

Reproducible links can specify `time`, `paused=1`, `seed`, `speed`, `volume`,
`breakup`, `concentration`, advanced settings by their camelCase names,
`quality`, and `gpuPower`, for example:

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
  Fresnel/GGX lighting, roughness-filtered emitter reflections, finite ripples
  and time-derived drying/absorption/residue.
- `shaders/vehicle.wgsl`: shared hood/windshield contact wave, local splash
  deflection, analytic body film/beads/rivulets, optical shading and drying.
- `shaders/material.wgsl`: shared linear-light water transmission, Fresnel,
  reflections and dyed-medium response.
- `shaders/liquid.wgsl`: airborne stages, material controls and additive
  world-space deposition.

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
ground. After settlement the atlas is cached. Drying derives remaining film
thickness, pore moisture and residue from the atlas plus absolute simulation
time and seeded world-space surface variation. It needs no frame history, CPU
particles, extra texture or GPU allocation, so backward seeks reconstruct the
same wet, dry or stained surface. It is isolated from gameplay paint and does
not alter grip.

Current technique notes, visual comparisons, measurements and limitations:
[puddle optics report](../../docs/rendering/PUDDLE_OPTICS.md),
[unified airborne/puddle material](../../docs/rendering/SPLASH_MATERIAL.md), and
[momentum and deposition report](../../docs/rendering/SPLASH_MOMENTUM_AND_DEPOSITION.md).
The [deterministic drying report](../../docs/rendering/SPLASH_DRYING.md) includes
the full lifecycle captures and validation results.
The [original report](../../docs/rendering/PROCEDURAL_SPLASH_LAB.md) preserves the
first prototype's results and future integration outline.

Standing water is optically smoother than wetted asphalt. Thin films transmit
road markings and aggregate; deeper pools absorb more green/blue light. Pools
reflect a defined overhead rectangular light and a small distant source, rather
than a screen-space glow. Small pinned drops have curved contact normals. All
settling ripple motion is exactly zero three seconds after impact; settled water
does not continuously boil. Appearance and drying controls adjust existing uniform
data only. Drying is evaluated per fragment from pooled thickness, asphalt capacity,
and fixed world-space noise; it does not allocate another texture or update
particles on the CPU. No solver or vehicle/gameplay state is involved.

The [vehicle–liquid interaction report](../../docs/rendering/VEHICLE_LIQUID.md)
describes the car-local prototype, comparisons, validation and limitations.
The original drying version is preserved at `7a4838a` on
`verlet_gpt_v23_liquid_splash`; this work uses `verlet_gpt_v24_vehicle_liquid`.
