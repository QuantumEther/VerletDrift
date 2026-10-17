# DMC-12 timestep investigation

Working draft: `verlet_gpt_v20_delorean_geometry`, based on `09a3e36`.
The investigation below records the pre-correction findings. The authorized
Option 1 follow-up now parameterizes the test harness's reversal time and tests
shared boundaries at 1.74, 1.76 and 1.78 s across all four original timesteps.
Every run asserts its actual steering event times and angles. Original numerical
tolerances remain unchanged. The complete unit suite now passes **147/147**;
the earlier 144-pass/one-failure record below is historical. Corrected refinement
measurements are saved in `validation/delorean/shared-event-refinement.json`.

The full Chromium browser suite was also rerun: **37 passed, zero failed or
skipped**. Coverage includes physical sprite anchors and steering, fallback
rendering, motion ghosts, camera/view/DPR scale, skids, throttle/braking/reverse,
clutch/gears, handbrake drift, suspension, UI controls, settings and fault
detection. Production hashes still match the preserved conversion draft; no
production changes accompanied the fixture correction. The original v19 branch
remains at `09a3e36`. The conversion and follow-up are committed together on the
dedicated v20 branch, without merge or push.

These checks validate the exercised simulator features, not every possible
parameter combination or hardware path. Remaining limitations include the
undistorted artwork's dimensional/arch mismatch, unverified independent factory
specifications, nonmonotonic fine-step sensitivity, and unavailable hardware
WebGPU raster/performance validation. Existing equal axle loading, common
mechanical rolling radius and symmetric track approximations are preserved.

This investigation preserves the conversion. It makes no additional production
changes, and does not alter the original numerical test, test tolerances,
handling settings, integration algorithms or simulator timestep.

## Finding

The existing 50 Hz refinement failure combines a definite test-input mismatch
with greater geometry-dependent numerical sensitivity. It is not, by itself,
evidence of a new solver defect. The probes found no structural constraint
failure or divergent/nonfinite run, but do not prove all numerical behavior is
correct or that the converted vehicle is ready for release.

`scripts/compare-suspension.mjs` evaluates steering at `t = i * dt` and reverses
when `t >= 1.75`. The 50 Hz grid cannot represent that event: it reverses at
1.76 s. The 100, 200 and 400 Hz runs reverse at 1.75 s. Over this three-second
maneuver, the coarse run therefore has 1.26 s of positive and 1.24 s of negative
steering; the reference has 1.25 s of each. The signed steering integral differs
by 0.0032 rad s. The test measures both changed input and numerical error.

Disposable copies of the test harness were run with common reversal boundaries.
All production mechanics were imported unchanged. The 1.76 s variant preserves
the original 50 Hz input and changes the finer runs to match it.

| Requested reversal | Baseline heading difference, 50 vs 400 Hz (rad) | Converted heading difference (rad) |
| --- | ---: | ---: |
| 1.75 s, original mismatched input | 0.010631 | 0.017965 |
| 1.74 s, common boundary | 0.001073 | 0.006416 |
| 1.76 s, common boundary | 0.001502 | 0.008127 |
| 1.78 s, common boundary | 0.006016 | 0.005514 |

The unchanged heading gate is strictly less than 0.015 rad. For all three
common-boundary probes, the converted 50, 100 and 200 Hz runs satisfy the
existing heading, speed and maximum-yaw limits against their 400 Hz reference.
For the 1.76 s converted 50 Hz run, speed difference is 0.7184% (limit 1%) and
maximum-yaw difference is 0.014510 rad/s (limit 0.025).

At 50 Hz the original converted heading difference decomposes, with signs, as:

```
0.0179650705443 = 0.0081267341627 + 0.0098383363816 rad
                   same-input       change in reference input timing
```

The timing term accounts for about 55% of the reported discrepancy for this
comparison. This is an arithmetic decomposition between these runs, not a claim
that the nonlinear response has independent, additive physical error sources.

## Residual sensitivity and limits

Wheelbase falls from 3.000 to 2.408 m (19.7%), and the existing geometry-derived
yaw inertia falls from 1156 to approximately 832.34 kg m² (28.0%). Longitudinal
load transfer for a given acceleration increases by about 24.6%. These changes
plausibly increase response and timestep sensitivity without an algorithm
change. They do not isolate which coupled subsystem causes the remaining error.

Additional refinement used 800, 1600 and 3200 Hz, plus 6400 Hz for the original
and 1.76 s schedules. With matched 1.76 s input, converted 50 Hz heading differs
from 3200 Hz by 0.002214 rad and from 6400 Hz by 0.007640 rad. The 3200 and
6400 Hz references themselves differ by 0.005426 rad. Refinement is
nonmonotonic; the finest run must not be described as an exact solution or used
to infer a proven convergence order. The baseline also shows phase-dependent
finite-step error.

Constraint residuals in these short probes are around 2e-14 m. Matched-input
converted runs retain positive loads (minimum roughly 780–916 N across the
tested timesteps), with maximum roll about 2.3 degrees. These observations
argue against a broken rectangular constraint geometry or wheel-lift event as
the immediate explanation; they cannot exclude every numerical defect.

A diagnostic variant with 100 ms smooth steering ramps exceeds the heading
gate even on the old geometry (0.019293 rad versus 0.015600 on the conversion).
Changing steering smoothing is therefore neither a demonstrated cure nor an
appropriate workaround. It was applied only in disposable diagnostic harnesses.

## Fixture fixes and validation

- `tests/weight-transfer.test.js` uses imported `CAR_HALF_WIDTH` instead of the
  old hardcoded 0.8 m divisor. Its assertion tolerance is unchanged.
- `tests/visual-geometry.test.js` checks computed front tire length with
  `toBeCloseTo(0.5896, 12)`, allowing binary roundoff from the dimension formula;
  the exact width check remains. This does not relax a numerical physics gate.
- Full unit suite after those fixes: **144 passed, 1 failed**, out of 145.
  The sole failure is the unchanged 50 Hz heading assertion in
  `tests/suspension-handling.test.js`, at 0.017965070544291972 rad.
- Production JS and original vehicle PNG hashes match the snapshot taken at
  the start of this investigation. The numerical test and original comparison
  harness are unchanged from the baseline commit.
- The earlier conversion's 37 browser checks passed before this investigation;
  they were not rerun here because production code did not change.

The initial draft was backed up outside the checkout under
`/workspace/scratch/delorean-investigation-start/` as a tracked patch, untracked
archive and production hash manifest. No reset, discard, stash or branch switch
was performed. The draft remains uncommitted and unpushed.

## Safest options

1. **Recommended next change: correct the refinement fixture's forcing.** Use
   an explicitly shared event boundary, such as 1.76 s, and assert actual input
   transition times agree across the grids. Keep all existing timesteps,
   tolerances and production code. Test additional shared phases (1.74 and
   1.78 s) to avoid relying on one favorable event phase. The diagnostics already
   satisfy all three existing gates at those phases. Consequence: the benchmark
   now compares the same maneuver; finer reference runs reverse 10 ms later
   than in the original test when using 1.76 s. This is a test-contract correction,
   not proof of universal numerical accuracy. **Applied in the authorized
   follow-up**, including all three shared phases and event assertions.
2. **Retain the current failing gate and investigate further.** Preserve this
   draft while isolating remaining force/load/constraint coupling and refinement
   behavior with matched control histories. Consequence: no simulator behavior
   changes, but the conversion remains a draft with a known failing unit gate.
3. **If exact 1.75 s timing is essential, design an event-aware benchmark.**
   A reference can split integration at that event, but the coarse run must also
   represent the same control history for a fair comparison. Consequence: a more
   complex benchmark and a different integration schedule in the test; this is
   not a drop-in fix for a fixed 50 Hz transition test. It must not silently
   change live simulator stepping.

Only pursue a production numerical correction if fair, controlled comparisons
establish a defect and identify its mechanism. That would be a separate change
with behavior risk and its own baseline validation. Raising tolerances, changing
live timestep, damping, friction, steering or inertia merely to clear this gate
would conceal the cause and is not recommended.

## Reproduction

`scripts/investigate-geometry-sensitivity.mjs` generates disposable harness
copies under the system temporary directory and imports each source tree's
unmodified mechanics. It checks source replacement anchors to fail clearly if
the harness changes. Extract baseline `js` and `scripts` directories into a
separate temporary directory using `git archive 09a3e36 js scripts`, then run:

```sh
node scripts/investigate-geometry-sensitivity.mjs --baseline-root /tmp/verlet-delorean-baseline
```

The recorded output, including actual event times, constraint residuals,
reference headings and source harness hashes, is in
`validation/delorean/timestep-sensitivity-investigation.json`. The temporary
baseline extraction is diagnostic only; the working branch remains in place.
