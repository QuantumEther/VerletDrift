# Intermediate live UX review

Reviewed from PERFORMANCE_2_UX at b83555a, plus the focus fixes in this checkpoint. Development pauses here for owner review.

## Current capability

| Status | Delivered |
|---|---|
| Implemented and browser exercised | Actual laboratory entry, real Three.js scene, workspace visibility switching, immersive mode, live readouts, engine startup, gear request, camera controls, terrain and graphics changes, audio enable and diagnostic download from prior browser run |
| Verified in this checkpoint | Live startup, paused runtime captures, workspace click returns viewport focus, held throttle clears on editor focus, pointer throttle presses and releases, 44 Node regression tests |
| Implemented with limited validation | Tachometer with selected engine limit, critically damped needle, precision range editors/default buttons, inspector collapse, fault placement, hidden-panel skipping |
| Transitional | Runtime DOM relocation, retained element IDs, original HTML and procedural-terrain stylesheet underneath scoped Studio CSS, original dashboard/controller and old gauges in Telemetry, layout=legacy |
| Unfinished | Coherent complete component library, workspace-specific workflow redesign, production hosting, hardware performance acceptance, comprehensive accessibility/keyboard matrix, broad backend/asset combinations and mobile evaluation |

The latest work is a review checkpoint and narrowly scoped focus correction. The unrelated local balloon edit and untracked audio HTML are excluded.

## Visual review

These are actual paused simulator captures, with real values and a 1440×900 browser. They are not mockups. Drive, Vehicle, Terrain, Audio, Graphics, Telemetry and Immersive JPEG files accompany this report. Prior 1920×1080 and 2560×1440 captures predate the latest instrument refinement. New target-resolution captures have not been claimed.

## Performance interpretation

The old 19.41/8.36/0.286 ms comparison consisted of single sequential paused runs. Visibility, layout, GPU canvas synchronization and capture order can affect these samples. Its dashboard timer covers rendering calls that may wait on software graphics execution. It is not pure JavaScript arithmetic time or GPU execution timing.

The repeated checkpoint script fixes the browser at 1440×900 and the real canvas at 800×500 and selects Telemetry. Three runs each compare Studio, Studio with the new tachometer draw disabled, and legacy. Only the diagnostic variant disables an effect. The normal interface keeps its rendering and physics settings. Measurements include full-frame interval and dashboard distributions. Dashboard samples include zero-cost frames between the 200 ms updates, so median zero is expected. Warmup and machine contention are limitations of these captures. The raw real-time ratio during a paused capture does not establish driving throughput.

Specific source inspection findings follow.
- The new tachometer redraws its full ticks, arcs, text and canvas shadow at dashboard updates and during its finite needle-animation loop. Disabling its callback isolates that contribution at steady paused RPM, but does not measure animated driving.
- Legacy SVG/canvas instruments still render in Telemetry. Hidden gauges and contact tables skip their rendering. Scientific capture continues independently.
- Visibility reads now precede presentation writes. Each visible dashboard pass still formats performance text and reconstructs contact table rows. Per-update arrays, sorting and snapshot allocations remain.
- CSS shadows, gradients, range controls and larger text can contribute to paint and compositing. No browser rendering trace has established their individual cost.
- Sequential software-rendered captures have considerable variability. They cannot establish RTX 5090 or Mac behavior. GPU execution and presentation costs are not separately timed here.

## Focus strategy

Mouse workspace selection clears held inputs and focuses the viewport. Keyboard activation retains button focus for continued accessible navigation. Editing fields clears held driving inputs. Global driving keydown ignores interactive form controls. Pointer-driving buttons retain their pointer capture and held input through focus. Blur, visibility change and release clear held state.

This checkpoint directly asserts the workspace, editor-focus and pointer cases. A full Space/Backspace/R/N/numpad/arrow-key matrix and screen-reader testing remain outstanding. Requested gear and numeric controls retain their original runtime semantics.

## Architecture recommendation

Keep DOM relocation transitional. It preserves IDs, event listeners and tests with a small migration surface, but leaves historical presentation and runtime reads coupled. Replace one workspace at a time only after capturing its control/command contracts. Separate runtime sampling and exports from display formatting and reusable components. Risks include resetting state accidentally, duplicate handlers, altered key routing, hidden canvas sizing and losing advanced controls. A wholesale rewrite is unnecessary for this review.

## Entry and access

The primary path is research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/index.html on PERFORMANCE_2_UX. Preserve backend=webgpu, backend=webgl and layout=legacy.

The cloud environment reports zero configured HTTP preview portals. GitHub Pages configuration discovery through the API returned Forbidden. No accessible public UX deployment can be verified here, and a source branch URL does not execute the application. To expose the running checkout, the environment owner must add an HTTP Preview for port 8784 and apply it to this chat. The repository-root server is bound to that port for this checkpoint. Production deployment was not modified.

## Recommended next review

Review the actual captured composition and choose whether the instrument cluster and inspector density meet the visual direction. Then authorize a bounded workspace-component cleanup and a browser rendering trace on target hardware. The outstanding performance gap and hosting access should remain explicit acceptance items.

## Repeated measured results

All values below are per-frame samples in milliseconds. Zero dashboard medians include frames between dashboard updates.

| Run | Variant | Dashboard mean | Dashboard P95 | Dashboard P99 | Frame mean | Frame P95 | Frame P99 |
|---|---|---:|---:|---:|---:|---:|---:|
| 1 | studio | 18.737 | 81.100 | 333.800 | 61.075 | 133.300 | 350.000 |
| 1 | no-tachometer | 9.726 | 52.400 | 74.200 | 46.805 | 83.400 | 116.700 |
| 1 | legacy | 0.258 | 1.400 | 2.800 | 37.069 | 149.900 | 216.600 |
| 2 | studio | 8.415 | 51.000 | 72.300 | 44.393 | 66.700 | 166.700 |
| 2 | no-tachometer | 6.673 | 46.600 | 53.000 | 42.988 | 66.700 | 116.700 |
| 2 | legacy | 0.284 | 1.300 | 2.300 | 36.521 | 133.400 | 200.000 |
| 3 | studio | 9.151 | 49.200 | 70.200 | 44.004 | 66.700 | 166.700 |
| 3 | no-tachometer | 8.433 | 51.000 | 58.000 | 46.433 | 83.300 | 133.300 |
| 3 | legacy | 2.158 | 1.500 | 102.500 | 38.525 | 150.000 | 199.900 |

The tachometer-disabled case remains slower than legacy in all three runs. The tachometer is a contributor, with large run-to-run variability. Remaining layout, canvas synchronization, old instrument rendering and contact table cost require a browser trace for reliable attribution. No stage-level proof establishes a sole bottleneck. Simulation is paused, so a meaningful driving real-time ratio was not measured.
