# Splash Laboratory

A standalone WebGPU/WGSL experiment for a large, translucent crimson balloon
splash. It uses analytical GPU animation, not fluid simulation. It does not run
or modify the vehicle simulator.

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

- Impact speed: approach speed and outward throw/extent.
- Liquid volume: visual extent and droplet size; nominal artistic litres,
  not a conserved fluid volume.
- Stretch & breakup: membrane perforation and filament fragmentation.
- Dye concentration: wavelength-inspired absorption/transmission and opacity.
- Replay impact / Pause / Play: replay the same seed or hold a precise instant.
- Timeline: scrub the full 4.8-second scene; impact is at 0.55 seconds.
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
- `renderer.js`: resource ownership, pipelines, image upload, targets, submission.
- `lab.js`: isolated controls/clock/diagnostics. No simulation state imports.
- `shaders/common.wgsl`: seeded noise, camera projection and shared rim motion.
- `shaders/scene.wgsl`: asphalt, simplified car presentation and balloon.
- `shaders/liquid.wgsl`: membrane, filament, droplet, shadow and composite stages.

The car uses a GPU copy cropped from the unchanged existing DeLorean artwork
using the existing crop metadata. Its display scale is for this laboratory;
these are not revised simulator dimensions or wheel geometry. Simple tire
silhouettes sit beneath the body. A procedural simplified car remains available
if the PNG cannot load. The original assets are never edited.

Existing reusable infrastructure: WebGPU resource/timing conventions, optional
`GPUTiming`, source crop metadata, and the repository's static development server.
The experiment has its own device and targets. It does not import `main.js`,
`state.js`, `balloon.js`, seeded physics RNG, inputs, audio or simulation systems.

The live timing readout separates CPU command encoding from GPU scene and liquid
pass timestamps when supported. GPU values are unavailable until enough frames
have rendered; pausing early may leave them blank. They exclude presentation and
are not estimates derived from JavaScript time.

Full technique notes, visual comparisons, measurements and integration outline:
[procedural splash report](../../docs/rendering/PROCEDURAL_SPLASH_LAB.md).
