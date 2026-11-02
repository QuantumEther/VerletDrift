# Hybrid Engine Audio — Experiment 01

Launch from the repository root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/engine-sim-hybrid.html
and press **START ENGINE**. Switch Procedural / Sample / Hybrid while it runs;
use the original throttle, transmission, profiles, tachometer and volume controls.
The Recorded slider sets the hybrid blend. Recording reference settings are under
an expandable section. HTTP/HTTPS is recommended; a WAV picker is provided for
file:// or unavailable fetches. Keep `REC194.wav` beside the page. No new dependencies.

## Recording analysis

REC194 is 5.015510 s, 44,100 Hz, mono, 16-bit PCM. Peak .267914 (−11.44 dBFS),
RMS .062202 (−24.12 dBFS), mean 9.47e−6. One-second Welch spectra show strong
components near 51, 77–78 and 102–105 Hz, with a roughly 25–26 Hz harmonic family.
The clip is approximately stationary with small frequency/amplitude variation;
it does not supply identifiable startup, shutdown or full-load RPM sweeps.
Engine identity, cylinder count, recorded RPM and microphone conditions are unknown.
**775 reference RPM is a provisional V8 interpretation, not measured metadata.**
It is adjustable from 400–3,000 rpm. Changing profiles does not manufacture a
profile-specific recording or a different recorded firing order.

The selected source interval is .760–4.780 s. A .120 s complementary raised-cosine
crossfade overlaps its tail with its head, producing a 3.900 s circular buffer.
At the supplied sample rate the selected overlapping waveforms have about .838
normalized correlation. The wrap follows adjacent samples from the original
head, rather than forcing the waveform to zero. The remaining approximately
.0058 raw adjacent-sample change is natural waveform slope, not a zero-valued seam.
A loop is prepared once, DC-centered and fixed-level normalized to .010 RMS.
This is a rough V8-idle level match, not a perceived-loudness standard or AGC.
Normalization was reduced from the first .120 RMS trial because that trial made
the sample much louder than the procedural idle and would bias A/B comparisons.
There is no time-varying normalization, noise gate, random pitch wobble or compressor
added specifically to disguise missing recording coverage.

## Audio architecture

The original `apex-engine` AudioWorklet text is **byte-for-byte identical**. It
continues to generate combustion, intake, exhaust, mechanical, starter and other
original effects and supplies the authoritative RPM/load telemetry for this page.
No vehicle physics or original synthesizer file was modified.

A native looping AudioBufferSourceNode plays the prepared buffer. Its playback
rate follows telemetry RPM / reference RPM with a 55 ms AudioParam time constant;
no source is restarted for throttle, mode or profile changes. Gain transitions
use 45 ms targets. Explicit file replacement crossfades two native sources over
roughly 250 ms and cleans up the old graph. The recording has a fixed 18 Hz
high-pass for DC/rumble. There is no granular processor or JavaScript sample loop
on the live audio thread.

- **Procedural:** original full-band worklet signal, sample muted.
- **Sample:** recording only, following the RPM ratio even at large transpositions.
  Startup is silent until ignition because no recorded starter exists; this is
  declared behavior, not a missing audio graph. Stopping fades with RPM to zero.
- **Hybrid:** equal-power blend controls, with a conservative sample quality band.
  Sample contribution is full-quality at .75–1.7× rate, tapering over .4–.75×
  and 1.7–2.7×. At large shifts the original procedural engine takes over.
  As the recording enters, the remaining procedural contribution increasingly
  uses a 180 Hz high-pass detail path, reducing doubled bass/slow beating while
  retaining combustion harmonics, intake/exhaust and mechanical detail. The
  original full-band starter remains audible before ignition. Recorded level
  responds gently to the original load telemetry; that is not a recorded load sweep.

Both layers use the original shared dry/convolution/compressor/master chain. A
post-master soft safety curve is linear below .8 and bounded below full scale;
2× oversampling reduces nonlinear aliasing. It is not a guarantee about arbitrary
future source levels or browser/hardware reconstruction peaks. The scope and test
meter observe the final output. Mode changes do not change the engine's RPM model.

## Validation

Reproduce with:

```sh
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/engine-sim-hybrid-test.mjs
```

The script uses the installed Playwright/Chromium and serves the actual page.
A separate AudioWorklet tap measures rendered output, not oscillator settings.
It checks all three modes, more than one idle loop, acceleration/deceleration,
stop/restart, mix extremes, five profiles, finite/unclipped output and expected
shutdown silence. It also starts the untouched original page and checks literal
procedural-worklet equality. Raw measured windows and file hashes are saved in
`engine-sim-hybrid-results.json`. These are browser-signal tests, not a claim of
superior perceived realism. The final measurements are summarized in that file.

## Limitations and Experiment 02

A single idle-like recording cannot support convincing full-range sample playback.
At 6,900 rpm its roughly 8.9× resampling changes formants drastically; Sample mode
warns about this instead of claiming realism. Hybrid intentionally becomes the
original synthesis there. Mono recording, repeated 3.9 s texture, imperfect source
RPM calibration and absent load/start/stop recordings remain. The same sample is
not faithful to every selectable engine. Crossfades reduce boundary artifacts but
automated continuity checks cannot prove inaudibility on headphones.

**Naturalness verdict: listening A/B still required.** This experiment adds actual
recorded texture without assuming louder means better. No human listening panel or
hardware listening assessment was available in this execution environment.

For Experiment 02, acquire a small, RPM-labeled set for one verified engine:
steady idle plus a few loaded mid/high-RPM recordings, with matching microphone
position, and separate start/stop transients. Level-match a blinded A/B comparison
before adding complexity. That would test whether multi-band sample crossfading
actually improves the high-RPM sound; it is not implemented here.

Final Chromium 154 verification: **23 cases passed**, including per-mode
stop/restart and full-master-volume acceleration. The independent WAV wrap
fixture passed. The measured maximum post-master output peak was **0.434296**;
all 332 measured 100 ms windows had zero nonfinite/clipped samples. Expected
shutdown silence was checked separately from running-state gap checks. The
original HTML and WAV hashes match committed upload revision `5b40699`.

- procedural idle: mean window RMS 0.004822.
- sample idle: mean window RMS 0.006009.
- hybrid idle: mean window RMS 0.005684.

These measured idle RMS values help expose loudness bias; they are not a
perceptual naturalness score. Hardware output/underrun and headphone listening
assessment remain unverified.
