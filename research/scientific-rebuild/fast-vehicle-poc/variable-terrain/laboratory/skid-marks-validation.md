# Skid-mark rendering validation

The existing tire observatory records deposited work only at supported slipping contacts. Its per-wheel records are converted to bounded, world-positioned terrain-conforming strips by `track-view.js`; the same dynamic geometry is consumed by the WebGL shader or the WebGPU TSL overlay. No vehicle or tire equations were changed.

## Root cause and repair

Three.js r180's WebGPU index upload promotes a 16-bit index attribute by replacing its backing array with a 32-bit array. The track renderer retained and updated the original array after that replacement. Consequently, indices for subsequently deposited strips stayed zero in the actual GPU-bound attribute. The renderer now allocates 32-bit indices from the outset and writes through the current attribute array. A regression test simulates an array replacement and checks subsequent indices. In an offscreen browser test using accepted physical steps, newly deposited marks changed **0 pixels before** the fix and **6,524 pixels after** it; the post-fix CPU and GPU index values match. See `results/skid-incremental-comparison.json` and `results/skid-webgpu-probe.json`.

The shaders now apply a deterministic world-space grain, varying edge feather and six subtle longitudinal bands to the existing physically determined opacity. Marks share the existing terrain placement, transparent depth test, render order and bounded geometry pool. No per-frame texture is generated. This is an inexpensive visual approximation, not a tire-tread measurement or a demonstrated photographic match; at distance fine detail can alias. Road clipping and fixed-capacity history remain as before.

## Reproduction

From the repository root, with Node, Playwright and Chromium installed:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/skid-webgpu-probe.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/skid-scenarios-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/skid-scenarios-browser.mjs webgl
```

The probe explicitly asserts native WebGPU backend selection and reads the offscreen render target. The scenarios step the real isolated vehicle physics and record real tire contacts: braking, a steering/handbrake arc, driven rear-wheel burnout, and two separately simulated overlapping braking passes. Both WebGPU and WebGL show pixels attributable to marks in all four cases. The overlap darkens 3,798 near-view pixels by more than two RGB levels compared with one pass. Scenario records and near/far PNGs are in `results/skid-*`; they depict a flat gray diagnostic ground, not a full-laboratory car scene. Rendering was checked not to mutate the physical state.

## Limits and performance

These captures used headless Chromium and SwiftShader offscreen readback, not hardware presentation on the RTX 5090. Full interactive driving, actual tire-smoke overlap, terrain-contact visual quality under varying lighting, and performance on that GPU remain unverified. The diagnostic captures do not establish that the results closely match the supplied photographs. No claims about 240 Hz or GPU frame-time regression are supported by this environment.

The existing one-mesh, dirty-range update and 4,096-primitive bound remain. A 32-bit index buffer uses 49,152 more bytes than a 16-bit buffer in WebGL at the default capacity; WebGPU already promoted the buffer to 32-bit and previously retained both arrays. The shader does additional fragment calculations, whose hardware cost has not been measured. Ground offset, sampled terrain geometry, 20 m visibility clipping and fixed history capacity remain potential visual limitations.
