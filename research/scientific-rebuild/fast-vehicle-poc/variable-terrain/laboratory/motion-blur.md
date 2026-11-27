# Motion blur

Open **Graphics → Motion blur**. The WebGPU default uses Fast, a 7 ms
virtual exposure and a 16 px maximum sample span. The graphics controls
set shutter duration, intensity, camera and body contribution, wheel spin,
peripheral enhancement and depth rejection. Fast, Balanced, Cinematic and
Ultra use 4, 8, 16 and 24 directional samples respectively. The master switch
or `?motion=off` skips the MRT and runs the ordinary renderer. WebGL and
offscreen readback mode use the ordinary renderer.

The scene pass resolves HDR color plus a single RGBA16F attachment containing
screen-plane motion and linear eye depth. The output shader gathers color
along the physically projected direction and rejects incompatible depth and
motion. It performs the existing ACES and sRGB conversion in the same
full-screen pass. The 3D MSAA and shadow settings remain active. The shader
skips the gather below 0.65 px. The ordinary pipeline is restored without a
page reload when the effect is disabled.

Object history follows each visible mesh, including the imported body and
wheel hierarchy. Camera-relative coordinates account for the laboratory's
floating origin. Terrain, roadside and vegetation are reprojected in world
space even when the display window is rebuilt. High rotor displacements use
a signed angular-velocity approximation that preserves the previous carrier
pose. Shutter scaling uses render elapsed time. Camera presets, resize,
visibility changes, scene replacement and long gaps invalidate history.
The artistic control only scales the screen-space vectors toward the edges.
Transparent geometry keeps its original HDR blending and cannot overwrite the
opaque motion/depth buffer. Smoke, liquid and sky lack independent per-pixel
motion histories, so a transparent effect may inherit underlying blur.

The implementation follows the color/velocity MRT approach in the [Three.js
r180 example](https://github.com/mrdoob/three.js/blob/r180/examples/webgpu_postprocessing_motion_blur.html).
The vendored renderer includes a targeted MRT shader-cache key fix, an
attachment write mask for transparent materials, and an alternate output
quad. The vehicle solver and simulation clock have no blur dependency.

## Verification

The [laboratory orbit comparison](results/motion-blur-orbit-comparison.jpg)
shows the actual Cinematic alpine scene at the same camera pose. The capture
harness used a fixed virtual 60 Hz render interval to isolate the effect
under software rendering. The real release path uses elapsed wall time.

Serve the checkout root with `python -m http.server 8792`, then run
`node motion-blur-browser.mjs` from the laboratory directory. The GPU fixture
checks scene-relative camera and object motion, exact pixel equivalence on
a cut, and switching MRT on and off. The mathematical tests cover 60, 120
and 240 Hz exposure scaling. [Software timing data](results/motion-blur-software.json)
records six Chromium/SwiftShader render-batch measurements per mode at
640×360. Median times were 28.1 ms Off, 62.8 ms Fast, 67.5 ms Balanced. The software
regression establishes a real cost but does not predict the RTX or Mac
cost. The native 0.5 ms goal and the full driving scenario matrix remain
unverified. The normal runtime samples GPU timestamps only when the
existing diagnostics request them and performs no pixel readback.
