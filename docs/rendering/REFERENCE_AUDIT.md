# v30 reference audit — regression investigation checkpoint

Historical checkpoint at `546eb61`. The user subsequently authorized continuing
the visual upgrade without identifying the trigger. See
[the implementation report](REFERENCE_RENDERING.md) for the subsequent work.

Branch: `verlet_gpt_v30_reference_rendering`.
Starting commit: `745ca62630eb1b2446e881fc774e5a0995709ce8` (v29).
The v28 and v29 branches remain unchanged. No production code, physics,
artwork, handling, interface, shader or test tolerance has been changed here.
This checkpoint is an investigation, **not the requested completed overhaul**.

## Reference observations and proposed work

The reference supplied in this turn shows illuminated mineral asphalt, narrow
irregular rubber tracks, sharply distinct wet reflections, dark contact shadows,
and spatially connected crimson sheets and puddles. One reference image was
visible in the message, although the brief mentions two.

Matched current-renderer baseline captures:

- [Dry scene](reference-audit/dry.png)
- [Airborne splash at 0.7 s](reference-audit/impact.png)
- [Deposited liquid at 5 s](reference-audit/wet.png)
- [Frame diagnostics](reference-audit/measurements.json)

These use the actual simulator shaders and fixed state in the existing offscreen
capture harness, not a photograph or a new mockup. They are not real-driving
screenshots. They expose several actionable discrepancies:

1. Asphalt appears almost smooth at normal zoom. Its 42/m and 115/m grain is
   largely filtered away: at 58 px/m the derivative footprint of the 42/m octave
   approaches the current filter's cutoff. Add resolvable intermediate aggregate
   scales, mineral variation and subtle normal response before adding finer noise.
2. Rubber is a dark capsule stroke. Add longitudinal tread/density variation
   while preserving physical wheel paths, width, segment optical-density weighting,
   and overlap. Do not make every short segment into a visible bead.
3. Wet tire tracks should use existing captured pigment/contact information,
   not turn all rubber glossy. Any new render-only wetness history must remain
   bounded and deterministic and must not change gameplay paint depletion.
4. Strengthen compact contact grounding and soften extended cast shadows
   coherently, retaining the original vehicle artwork and wheel geometry.
5. Preserve the airborne/deposited liquid optical model. The current broad sheet
   is much more continuous than the reference, but this is not justification to
   replace the successful liquid system during a regression investigation.

No aesthetic changes were implemented because the brief explicitly requires
repairing the settings-related disappearance first.

## Regression investigation

### Offscreen renderer

Swept both endpoints of all **88 Rendering range controls** (176 changes) at a
fixed 0.7-second impact age. Restored each setting between controls. No GPU errors,
liquid initialization errors, or missing airborne-event status were reported.
This verifies retained event selection and validation, **not** perceptual visibility
for every endpoint. Deliberately disabled liquid and extremely low dye/lighting can
legitimately reduce visibility and must not be interpreted as corruption.

Reproducer: `node docs/rendering/reference-audit/offscreen-sweep.mjs`, with an
existing development server at port 8000. Override `AUDIT_URL` for another server.
It uses Playwright and `/usr/bin/chromium` with explicitly forced SwiftShader.

The three baseline captures report no GPU errors and successful liquid initialization.
They show both airborne and deposited liquid.

### Full simulator and live controls

Started the actual page, explicitly waited for `isGPUReady()` synchronously after
importing the renderer, exercised throttle/gear/brake keys, placed balloons at the
current front wheel, called the existing collision handler, and changed native UI
inputs with `input` events. Event timestamps used current simulation time.

The isolated full-page run lost its software GPU **before the first settings-change
result**, with:

> Device lost: A valid external Instance reference no longer exists.

The application then selected Canvas and retained visual event history (seven
collision events by the end of the run). Canvas cannot show the advanced WGSL
liquid. See [raw observations](reference-audit/software-presentation.log).
An earlier run lost its device near a resolution change, so that coincidence alone
is not evidence that resolution changes caused the loss.

This environment exposes Google SwiftShader, not the user's RTX 5090. These failures
cannot establish a native NVIDIA regression, and removing fallback or suppressing
the error would hide the failure rather than repair it. The specific v29 setting
reported by the user has **not** been identified or its root cause fixed.

## Validation and limitations

- Unit suite: **169 passed, 20 files**.
- Targeted browser suite: **9 passed** (lighting, palette, controls, quality,
  drying, residue replay, cached deposition and extent coverage).
- No production performance comparison: no production change was made.
- No native GPU execution measurement or RTX 5090 performance claim.
- No after screenshots: current captures are an explicit preserved baseline.

To continue the mandated repair-first sequence, obtain the exact slider/toggle or
preset, value before and after, whether new balloon collisions also disappear,
and the renderer's device-loss/validation diagnostics from that reproduction.
The already-sent clarification asks for those details. Do not silently label the
software presentation failure as the user's bug.
