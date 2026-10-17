# GPU presentation failure and compatibility diagnostic

The reported `ImportMemory` error (allocation smaller than required image) was
reproduced by the user on a separate gauge-guide page using only a fixed-size
WebGPU canvas clear. No simulator, smoke shader or resize loop is necessary to
trigger it. Subsequent invalid texture/view/command errors are downstream of
that failed import. Lower resolution and an XWayland session did not solve it.
Disabling Vulkan made WebGPU adapters unavailable in the reported Brave setup.

The browser report identifies Intel as the active ANGLE graphics adapter; the
machine also has NVIDIA hardware. WebGPU's identity fields are empty. A
cross-adapter import problem is plausible, but the WebGPU adapter identity and
responsible browser/driver component remain unconfirmed. An allocation mismatch
is not evidence of VRAM exhaustion. No production shader/physics changes are
justified by that error alone.

## One-page diagnostic

Open `gpu-diagnostics.html` on the same server as the simulator and press **Run
diagnostic**. Keep the tab visible. This page imports only its own test module;
it never starts or removes the simulator. It performs ten bounded tests:

- A plain render-attachment texture for each of two adapter preferences.
- A visible canvas for each preference, each alpha mode, and each of two sizes.

The preferences are `high-performance` and `low-power`. The alpha modes are
`premultiplied` and `opaque`; sizes are 960×720 and 1024×768. There are no WGSL
shaders, readbacks, simulation state, or resizing within a test. Only a solid
color clear is submitted. Completion waits are diagnostic-only. Each run owns
and releases its device, context and texture. Errors are recorded verbatim and
cleanup-induced device loss is not counted as failure.

Use **Download report** to retain the exact outcomes, user agent, image sizes,
format and available adapter information. Empty identity fields are permitted.
Twelve successful frames constitute a passed *clear probe*, not long-run or
full-scene qualification. The page offers simulator links only when a
non-software adapter passes both canvas sizes for a given configuration.

If textures work but canvases fail, the browser's image-import/presentation path
is implicated. If all canvas variants fail, no tested compatibility configuration
has succeeded: preserve Canvas fallback and use the standalone reproduction in a
browser/driver report. Do not claim that adding these options fixed the host.

## Explicit simulator options

- `?gpuPower=low-power`: request the browser's low-power adapter preference.
- `?gpuAlpha=opaque`: request an opaque presentation surface.
- Both can be combined. Remove them to restore the existing defaults.

These are hints/settings, not a guarantee of selecting Intel or NVIDIA. The
normal defaults remain high-performance/premultiplied. No automatic GPU retry
loop, forced software acceleration, driver flags or physics changes were added.
The GPU background fills the canvas with alpha 1; opaque presentation therefore
does not remove transparent blending between the GPU's internal layers. The
separate Canvas vehicle overlay still composites above the GPU canvas.

Renderer statistics now include selected settings and available adapter fields,
and retain the fallback reason. GPU errors include their message directly in the
console instead of hiding it inside a collapsed object.

## Separate instrument error

The uploaded `instruments.js:28` error occurs if `.redline-marker` is absent.
The production template contains that decorative marker; why it was absent in
the user's session is unconfirmed. Its update now tolerates its absence without
interrupting live gauges. A regression test removes that marker and verifies
that RPM telemetry still updates. This is not a fix for Vulkan image import.

## Validation limits

This cloud environment provides software WebGPU. Its ordinary texture clears
work, but live canvas presentation fails with a different external-instance
error. Neither opaque presentation nor a different power preference resolved
that cloud limitation. It cannot establish which configuration, if any, will
work on the user's Intel/NVIDIA machine.

Automated validation: **151 unit tests passed; 42 ordinary browser tests passed
with seven adapter skips; 12 isolated GPU/diagnostic tests passed**, exercising
all seven skipped GPU cases. The real WGSL test verifies that low-power/opaque
options reach adapter selection and canvas configuration while rendering the
existing scene correctly into an offscreen target. The standalone diagnostic
regression verifies ten explicit outcomes and that neither main.js nor state.js
loads. These are correctness checks, not a successful native presentation claim.

[Cloud diagnostic output](validation/presentation-diagnostic-software.json) ·
[Diagnostic screenshot](validation/presentation-diagnostic.png).


## User-verified NVIDIA setup

Follow-up PRIME **plus X11** testing identifies NVIDIA/Blackwell explicitly and
passes all high-performance presentation probes; Intel texture tests pass but
Intel canvas probes fail in that configuration. The user subsequently reports
smoother full-simulator driving. This establishes a practical browser launch
workaround, not a quantitative renderer performance benchmark. See
[performance investigation](GPU_PERFORMANCE_AUDIT.md) for the new opt-in recorder.
