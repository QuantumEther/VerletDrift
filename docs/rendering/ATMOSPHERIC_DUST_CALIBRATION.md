# Atmospheric dust: perceptual calibration (v33)

Branch: `verlet_gpt_v33_dust_calibration`, based on preserved `verlet_gpt_v32_atmospheric_dust` (`d4409a7`). No stable branch merge. [Interactive comparisons and moving sequences](dust-calibration/index.html).

## Result and inspection

The v32 field was dominated by centimetre-scale motes. Its broad patches were sparsely placed on a 6 m lattice, multiplied by ambient density and a small opacity coefficient, then masked by noisy coverage and a relatively high energy threshold. These factors compounded: the analytical disturbance existed, but normal-zoom motion was difficult to read.

The calibrated version uses overlapping 3 m world cells within the active wake footprint. Soft elongated wisps follow analytical flow direction, rather than screen axes or the car sprite. Stable multiscale world-space variation breaks up their interiors. Less jitter reduces isolated blobs. Their footprint follows body and unexpired history bounds, clipped to the viewport with a conservative guard. The fine distribution remains world anchored and seed stable.

Wake opacity now has its own visibility control, independent of ambient density and physical airflow strength. The energy gate falls from .015 to .006 with a smooth onset. The wake coefficient is .40 × visibility × energy (instead of .22 × density × energy), with a final local alpha cap .32. Ambient motes grow from .018–.048 m to .030–.075 m without raising their count. Mineral scattering changes from linear RGB (.24,.225,.20) to (.46,.40,.30), modulated by the existing coherent lighting. This is premultiplied scattering/extinction, not additive light.

I inspected successive full-scene frames and the contact sheet, including straight acceleration, fast drifting, stopping and late dissipation. At normal zoom the new wake is readily visible behind straight driving and spreads asymmetrically around the sliding car. Immediately after stopping, older disturbance remains down the driven path while the region around the car clears. The broad wisps disappear after settling; stationary surroundings retain sparse ambient motes. The first isolated-blob draft was rejected in favor of denser, overlapping but lower-opacity patches. Daylight, overcast and warm sunset previews were inspected, with Subtle visibly quieter than Cinematic.

These are 2D procedural approximations with soft volume cues, not reconstructed 3D volumes or a fluid solver. Cinematic is deliberately more pronounced and may benefit from personal visibility adjustment when tire smoke and liquid are simultaneously busy. Native Mac and RTX 5090 appearance/performance still need confirmation on those machines.

## Controls

Rendering → Atmospheric Dust:

| Appearance | Ambient density | Wake visibility |
|---|---:|---:|
| Subtle | .30 | .45 |
| Cinematic (new startup default) | .48 | 1.15 |

Both sliders remain independently adjustable; changes mark the appearance Custom. Presets change only these two values, preserving enablement, disturbance strength, wind and persistence. Reset appearance restores Cinematic. The existing persistence, settings export/import and full reset paths include the new setting. Existing saved density preferences are preserved, so users upgrading from v32 can explicitly select Cinematic to obtain the exact new appearance.

Zero ambient density can still show a wake. Zero wake visibility can still show motes. Zero values skip the corresponding lattice entirely. `?dust=0` remains the explicit comparison switch. Canvas behavior is unchanged.

## Cost and architecture

The analytical compute stage remains useful: it evaluates airflow once per element rather than four times in the quad vertex shader. The 96-event ring remains bounded and retains scrubbing/long-persistence support. Searches now run newest-to-oldest and stop as soon as history is older than persistence; future observations are skipped on backward seeks. At the default .1 s sample interval and 4 s persistence, at most approximately 41 events need evaluation rather than scanning all 96 retained samples. Eight-second persistence needs approximately 81. Ring writes and sampling are unchanged.

Broad patches are limited to the active local footprint instead of scheduling empty cells across the entire view. In the recorded normal-zoom drift, v32 scheduled 168 coarse cells and v33 160, despite the denser useful lattice. Mote candidates remain 2736 in both. There is still one compute dispatch and one instanced draw in an existing world pass, no fullscreen transparency pass, no per-mote CPU update, and no added textures. Stronger wisps do cause more local blending than faint v32 patches; improved appearance is not free.

Three GPU buffers total **208016 bytes** (16 bytes more than v32): 144 B uniform, 3072 B history, 204800 B element storage. Fixed capacities, no per-frame GPU allocation. Shader URL version changes to v3. All WGSL writes remain whole-vector assignments for the stricter Mac compiler.

### Measured software-adapter comparison

`benchmark-atmospheric-dust.mjs`, same real drift fixture, 926×696, 595 dry tire marks, normal base scale20, ABBA on/off order, 8 warmup frames, 40 measured frames per version. Density .48 in both measured versions; the v32 visual-reference captures separately use its original .42 default. No simultaneous browser benchmark work. The software adapter has no useful native GPU timings here.

| Version | JS encode median off/on (ms) | Queue completion median off/on (ms) | Queue completion p95 off/on (ms) |
|---|---:|---:|---:|
| Preserved v32 | .20 / .20 | 331.40 / 375.55 | 875.00 / 764.30 |
| Calibrated v33 | .30 / .35 | 273.10 / 324.80 | 528.70 / 778.30 |

Queue completion is **CPU-observed submission-to-completion on SwiftShader**, not GPU execution time, presentation time or total application frame time. Different off baselines and noisy tails prevent a reliable native performance or speedup claim. The observed enabled-minus-disabled median differences are 44.15 ms and 51.70 ms respectively; these short noisy runs cannot isolate a 7.55 ms change reliably. The important supported result is materially stronger visible airflow at essentially the same candidate/dispatch count and fixed allocation budget. Native 5090 profiling, actual dust GPU timestamps, high-refresh presentation and dense combined-effects scenes remain unmeasured.

## Validation and reproducibility

All six native-main-loop stage pairs match simulation time, speed, velocity, heading and zoom exactly. The complete saved final fixture (including wheel state, tire marks and dust history) and frozen drift fixture are also identical between both versions. Base scale20 and normal speed-dependent zoom are retained; only follow-position damping is stabilized for repeatability. Smoke, balloon impacts and diagnostic arrows are disabled to isolate the effect; no production defaults for those features were changed. Straight/fast/drift/stopped/settled and initially stationary captures are available with v32, dust disabled and Cinematic. Four moving sequences compare v32 and Cinematic; loops sample every ten ticks (6 fps inspection playback, not a performance claim).

The lighting/preset captures use the recorded native driving pose with the normal world renderer and real car sprite drawing; HUD is omitted there. Shader validation errors are checked during capture.

Commands (with project Playwright dependencies and Chromium installed):

```sh
node scripts/capture-atmospheric-dust.mjs --output /tmp/dust-new
node scripts/capture-atmospheric-dust.mjs --ref d4409a7 --output /tmp/dust-old --skip-timing
node scripts/capture-dust-calibration.mjs --fixture /tmp/dust-new/fixture.json
node scripts/benchmark-atmospheric-dust.mjs --fixture /tmp/dust-new/fixture.json
node scripts/benchmark-atmospheric-dust.mjs --fixture /tmp/dust-new/fixture.json --ref d4409a7
```

These default to software WebGPU for reproducible cloud checks. The main capture/benchmark scripts support `--native` and `CHROMIUM_EXECUTABLE` for hardware runs; verify actual adapter identity before interpreting those results. CPU completion timings are still not GPU timestamps in native mode.

Validation completed on the final implementation:

- **176 unit tests passed in 22 files.** [Unit log](dust-calibration/unit.log).
- **109 browser tests passed in one complete run (9.9 minutes).** [Browser log](dust-calibration/browser.log).
- Dust coverage includes deterministic replay, settling, camera/zoom return, bounded history/resources, shader failure fallback, real main-loop sampling, settings persistence/export/import, Subtle/Cinematic/custom synchronization, and visible wakes at zero ambient density with a clean settled field.
- The full suite also covers numerical physics, braking/gears, input isolation, liquid lifecycle, body wetness, dye trails, geometry/scale alignment, resize and device-loss handling. Control-count fixtures increase by exactly one range input; existing numerical tolerances remain unchanged.
- The comparison viewer was exercised through every stage, all four moving sequences, all nine lighting/preset combinations and the divider, with valid decoded images and zero browser JavaScript errors.

Vehicle physics, geometry, artwork, input handling, existing liquid and gameplay systems are unchanged. V32 remains at `d4409a7`.
