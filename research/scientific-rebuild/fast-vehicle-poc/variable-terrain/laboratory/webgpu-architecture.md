# Adaptive WebGPU rendering

The laboratory selects a full-quality HDR path when motion, transparency,
or another output constraint requires it. In eligible opaque scenes with
a textured environment, direct rendering applies the same ACES exposure
and output transfer per fragment and presents to the canvas. Shader cache
keys include the color transformation stage. The direct path retains
scene MSAA and skips allocation of the intermediate HDR target for that
draw. This eliminates a full-screen output pass and the HDR color resolve,
while the canvas still requires its own MSAA resolve. The visible Mustang
scene normally contains blended glass and overlays and therefore retains
HDR composition. Compositing those fragments after individual tone
mapping would change their appearance.

The cinematic path keeps the combined motion sampling, tone mapping and
sRGB output pass. It discards resolved multisample color storage when the
next scene pass clears the attachment. The single-sample textures are
retained for composition. Adaptive blur bounds the number of taps by
projected pixel motion and the quality ceiling. Below 0.65 pixels the
gather is skipped. Short spans use two or four taps, and longer spans can
use the selected ceiling. The full-resolution motion and linear-depth MRT
is retained because r180 does not expose per-attachment MSAA or dimensions.
A separate low-resolution velocity geometry pass was not added.

When explicitly paused with identical scene time, camera and projection,
the frame skips the motion attachment and gathers. It retains the previous
pose and refreshes the history timestamp. An orbit or resumed simulation
activates motion again. The check is limited to paused operation because
particles and vehicle pose can move while the chassis is stationary.
The 2048-pixel shadow path, terrain tiling, Studio, physics and clock remain
in use. Wheel display transforms reuse scratch vectors on both backends.

## Verification

[Matched direct and HDR screenshots](results/webgpu-architecture-comparison.jpg)
come from the actual flight-map laboratory with the vehicle and overlays
hidden for the opaque diagnostic. The 267×213 image pair differs by a
mean 0.21 of 255 per RGB channel. Across the image, 237 pixels differed
by more than 3 in any channel. The maximum was 29, so the paths are
visually close but not pixel-identical. The full paused Mustang's five
sampled canvas pixels matched reference HDR with and without stationary
motion bypass. Chromium also passed the WebGL and WebGPU output smoke
checks and the adaptive motion fixture. All 79 laboratory and lifecycle
tests passed.

[Actual laboratory captures](results/webgpu-architecture-captures.json)
include two four-second windows per case and contain callback intervals,
CPU submission timing, available GPU batches, selected strategy, and
coasting simulation debt. The SwiftShader opaque diagnostic returned
11.19 and 11.55 callback FPS with HDR versus 11.14 and 12.86 direct.
The full motion coast returned 1.02 and 1.61 callback FPS in reference
mode versus 2.03 and 3.64 optimized, with substantial physics debt in both.
Other validation shared the host and full HDR repeats varied substantially.
The results verify work elimination, rendering and clock operation but
do not establish a repeatable throughput gain. In the coasting trace,
three passes per submitted frame were observed in both motion routes.
The optimized route discarded both multisampled color stores while
preserving their resolves. These captures do not measure presented frames
and do not establish native RTX or Mac timings. There is no matched native
good/bad historical pair in this environment for a useful bisect.

## Reproduce

Serve the checkout root with `python -m http.server 8792`. The default
laboratory URL selects automatically. Add `?gpu-architecture=reference`
for the fixed-tap, always-MRT baseline with motion enabled. Add
`?gpu-architecture=cinematic` to keep HDR composition for eligible opaque
scenes, or `?gpu-architecture=direct&motion=off` to request the guarded
direct route. On the flight map, use the incremental diagnostic with
terrain and lighting enabled and vehicle, tracks, smoke and other scene
components disabled for the opaque comparison.

On the RTX, compare the default and reference pages at identical scale
and quality using **Frame diagnostics**, with motion enabled. Capture two
paused runs, then two runs with the same coast or rolling-launch start.
Export JSON. The report records the selected path, and raw intervals give
FPS and percentiles. Optionally take a separate capture with GPU timing
enabled. Timestamp batches and screen presentation are separate measures.

Software browser reproduction from this directory uses
`node webgpu-architecture-browser.mjs`. Pass `--drive` for active coasting,
or `--visual` for the matched opaque pair. Set `VERLETDRIFT_URL` if the
checkout is served on a different port.
