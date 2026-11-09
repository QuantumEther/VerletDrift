# Schweinemotorwerke engine audio integration

PERFORMANCE, based on `f02ab53`. The current custom vehicle is the user's original
**Schweinemotorwerke**. Historical `mustang-1969`, Foundation 8.2 GLB filenames,
physical definitions and regression fixtures retain their identifiers. Naming
changes are presentation-only; the inherited engine, six-speed ratios, inertia,
clutch, brakes, suspension, tires and 1 ms mechanical step are unchanged.

## Launch and controls

Serve the repository with `python3 -m http.server 8000` and open
`http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/`.
Select Schweinemotorwerke, **Enable Audio**, wait for ready, and hold **R** to start
the actual engine. Audio enabling does not start the engine. Click the 3D view to
return to driving keys after editing forms. Keys inside audio controls belong to
those forms; key releases still reach the driver to avoid sticking controls.

Recorded Engine is the default. Hybrid adds a restrained procedural contribution;
Procedural uses the v5 refined firing-event synthesizer as an experimental reference.
Muted fades to zero and skips unnecessary sample rendering, while Disable closes
the AudioContext. Switching modes does not reset the physical engine or vehicle.
Master, engine, sample and hybrid-procedural gains are independently adjustable.
The optional starter/spin-down sound is **procedural approximation**, not an authentic
recording. Resume suspended audio is an explicit user gesture. Record 5 seconds
captures the output bus as WebM/Opus, not a microphone, for listening comparisons.

REC194/REC25 and either 2000-RPM take can be selected for the next audio enable.
The reference car has no lifecycle in the fixed-ratio mode and is deliberately
silent: the integration does not invent one. Errors never call the physics fault
handler; missing samples remain reported and Procedural can be selected explicitly.

## Architecture and authority

- `audio-telemetry.js`: read-only scalar mapping of the latest **accepted** `lab.state`
  and `lab.lastInput`. No renderer, DOM, solver or production imports.
- `engine-audio.js`: user-gesture context lifecycle, one-time decode/loop preparation,
  transfer of PCM to the worklet, controls, monitoring and loopback capture.
- `engine-audio-worklet.js`: continuous PCM playback, v5 acoustic DSP and bounded
  telemetry requests. No independent engine, clutch, gearbox or vehicle dynamics.
- `audio-samples.js`: provisional recording anchors, circular loop preparation and
  complementary adjacent-anchor weights.

Worklet filter/noise/firing-event components were extracted from the local v5 page;
the v4 and v5 embedded worklet sources were inspected and are identical. The former
`updateEngine`, `updateTransmission`, `updateVehicle`, automatic gear selection,
shift timers, rev matching, RPM floors/caps and drivetrain constants are absent.
There are no gear clunks or scripted shift-rev excerpts in this first integration.
The historical standalone pages and WAV files remain untouched.

Engine angular velocity is `lab.state.y[24]`; RPM is exactly `omega * 30 / PI`.
The actual lifecycle is `state.engine.mode`. Combustion, starter, loss and pre-clutch
source torque come from the accepted engine diagnostics. `engineTorque` means
combustion + starter − internal loss **before clutch reaction**, not the net torque
on the constrained rotor. Requested gear comes from accepted driver input; engaged
gear is reported only when the actual gearbox mode is engaged. Clutch state comes
from the constraint result, engagement from the accepted driver input. Vehicle
speed is the norm of actual world horizontal velocity. Pause, hidden/focus state,
fault, simulation time and reset epoch are explicit transport metadata.

No true engine-load measurement exists. `engineLoad` remains null. The separately
labelled `loadProxy` is combustion torque divided by the maximum configured brake
curve torque, bounded to [0,1] for acoustic gain. This is not measured load or an
energy-conserving acoustic model. Throttle/effective opening shape the procedural
intake; sample gain uses a restrained torque-dependent level approximation. Zero
combustion at closed throttle is distinguished from the physical overspeed fuel cut.

The worklet requests a packet at up to 50 Hz with **one request outstanding**.
The main thread replies from the latest accepted state, rather than stepping a
second model. There is no per-physics-tick audio scheduling or additional RAF loop.
The previous acknowledged physical packet is exposed alongside current telemetry
so the DSP target can be checked exactly. Pitch uses that RPM magnitude (frequency
has no sign); signed physical RPM remains available. A 15 ms acoustic smoothing
constant is not a physical engine trajectory. No gear event changes pitch itself.

Audio runs at the device sample rate independently of render intervals. During
ordinary main-thread delay it holds the latest accepted RPM, with no prediction or
invented intermediate mechanical states. If no reply arrives for two seconds it
fades safely; this watchdog is reported separately from processor errors. Audio
clock suspension and telemetry stalls are not concealed as successful playback.

## Recordings and loop treatment

The default bank uses REC194 at provisional 775 RPM and the supplied 2000-RPM take 2,
3000, 4000, 5000, 6000 and 7000 recordings. REC25 and the quieter first 2000 take are
optional alternatives. Filename RPMs and engine origins are unverified calibration
references, not independently measured metadata. The physical engine's current
6000-RPM limit was not raised to audition the 7000 anchor; that recording remains
available for legitimate overrev or future configurations.

Reuse from v5: 0.6 s / 0.3 s anchor trims, REC194 0.760–4.780 s and REC25
0.760–4.102 s windows, DC removal and 120 ms circular raised-cosine overlap.
No per-file RMS normalization is applied. Original level differences are retained,
including the much quieter 2000 take 1. The low-RPM anchor has a disclosed fixed 4×
gain inherited from the earlier low-recording gain budget; others use 1×. The
common sample-gain control remains available. See runtime recording diagnostics
for resulting RMS, peak, seam delta, trim and gain.

All loaded loops retain continuous phase, even when inaudible. Two adjacent RPMs
have target weights summing to one; actual weights smooth over 40 ms during rapid
changes. More than two fading voices can therefore briefly contribute. PCM uses
linear interpolation and modest rate shifts around native anchors. Below the bank
it extrapolates the low anchor; above 7000 it keeps the highest anchor audible.
No samples restart at anchor crossings. Complementary weights limit summed peak
amplitude, but **do not establish phase alignment or eliminate beating**. Loop
phase/periodicity is not verified from filename labels. No complex new synthesis
method is presented as solving that unresolved acoustic question.

Mode/volume transitions fade over 25 ms. Running overrun is quieter rather than
incorrectly treated as silence. Physical fuel cuts reduce the recorded layer to a
quiet residual; stopped/stalled states fade the running loop out. These are spectral
source approximations: recordings cannot separate combustion and mechanical sound
exactly. The optional rotating mechanical sound follows real angular speed after
shutdown. Procedural pops are disabled and hybrid synthesis defaults to 12%.
A last-resort ±0.98 output guard counts every limited sample; default test runs had
zero hits. This safety guard is not a claim of acoustic fidelity.

## Reproduction commands

From repository root, with the existing Playwright/Chromium installation:

```sh
node --test research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/*.test.mjs
node --test research/scientific-rebuild/fast-vehicle-poc/{engine-lifecycle/test.mjs,coupled-drivetrain/test.mjs,vehicles/vehicles.test.mjs}
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/engine-audio-browser.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/audio-browser-benchmark.mjs
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/engine-sim-multirpm-test.mjs
```

Optional Node VM DSP timing using NumPy/SciPy only for offline PCM preparation:

```sh
python3 research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/audio-benchmark-prepare.py /tmp/engine-audio-bench
node research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/audio-benchmark.mjs /tmp/engine-audio-bench/recordings.json
```

No browser runtime dependency was added. Keep temporary PCM outside the repository.
The standalone reference still runs independently at `../engine-sim-hybrid-v5.html`;
it intentionally retains its own historical engine/automatic-shift experiment.
Those dynamics are not imported by the driving laboratory.

## Evidence and limits

Results are in `results/engine-audio-*.json` and `results/schweinemotorwerke-audio.webm`.
The loopback sample is actual browser output from the physical engine-braking
scenario, not a fabricated RPM sweep. It is supplied for listening, **not as a human
listening verdict**. Signal tests do not prove pleasantness, authenticity, lack of
all clicks, phase coherence, alias-free resampling or real-world load realism.

Browser functional tests disable WebGL submission during the long audio scenarios
to avoid the cloud's SwiftShader stalls; physics, controls and scene data remain
active. This is not a hardware-GPU performance test. The previous renderer remains
intact, and graphics/appearance controls are exercised without resetting audio.
The 60-second test is not an hours-long soak. Browser focus-event handling is tested;
OS-specific device changes and every browser's background-suspension policy are
not independently verified. Web Audio exposes no dependable underrun counter;
reported stale packets and processor errors are not renamed as underruns.

Future recordings: replace/add entries in `audio-samples.js` with explicit RPM,
file and trim metadata, preserving common units. Use controlled loaded/overrun,
idle and starter recordings before claiming those missing acoustic conditions are
authentic. Recheck seams, relative level, crossfade interference and clipping after
substitution. Do not change vehicle torque or RPM to accommodate an audio source.

Starter/shutdown recordings should be separate transient layers triggered from real
mode/torque events, not inserted into the constant-RPM anchor bank. No new mechanical
model is needed to substitute improved recordings.

## Final executed results

Node v24.19.0, Chromium 154.0.8037.57, Linux x64 on the cloud Xeon Platinum 8573C host. **26 laboratory tests passed**, **44 existing engine/drivetrain/vehicle tests passed**, and the unchanged standalone v5 browser regression passed. JavaScript syntax and whitespace checks passed. No physics or historical audio-source file was modified.

The actual laboratory browser suite passed:

- Stopped silence, cold start/idle, neutral rev/lift, first-gear propulsion, high-RPM manual second-gear shift, clutch opening and engine braking.
- Reverse propulsion, a low-speed fully coupled clutch shift request, clutch-induced stall, neutral restart, and service braking. Requests and actual engagements remain distinct.
- All audio modes, including switches while moving, exact paused-state invariance, audio-form keyboard isolation, repeated enable/disable, reset, focus-event mute/restore and missing/corrupted recording handling. Explicit procedural fallback remained audible with no recordings.
- Nonzero audio with actual 3D rendering enabled, 250 ms main-thread blocking with continued audio blocks, and 60 seconds continuous playback without processor errors, stale telemetry or output-guard hits.
- Every acknowledged DSP target matched its physical packet RPM magnitude to <1e-9 RPM. Smoothed acoustic RPM is deliberately separate. Model observation also preserved a paired 500-step physical trajectory bit-for-bit.

Loopback: 1.98 s, RMS 0.007852, decoded peak 0.033059. All observed output-guard counts were zero. The browser uses Opus for this preview; source playback itself uses decoded PCM. The clip was signal-analyzed, not human-auditioned.

### Performance

Browser offline rendering used seven actual loops, 48 kHz stereo, six seconds per mode, with laboratory physics/scene updates paused. Download, decode and module load are excluded; initialization, JIT, scheduling and rendering are included. This is **elapsed offline throughput, not live audio-thread CPU utilization or deadline proof**.

| Mode | Offline elapsed ms per audio second | Output RMS | Peak |
|---|---:|---:|---:|
| recorded | 69.03 | 0.021823 | 0.113926 |
| hybrid | 202.63 | 0.021795 | 0.113959 |
| procedural | 171.80 | 0.003612 | 0.090668 |
| muted | 2.90 | 0.000000 | 0.000000 |

Live main-thread handoff averaged 0.0557 ms/request over 4169 requests (timer-resolution and scheduling noise apply). No audio work is called from the 1000 Hz physical step. Recordings are decoded once per enable; PCM is transferred once, not copied per frame. Quantities invariant within an audio quantum are cached outside the sample loop; Muted skips inactive rendering while preserving telemetry. No historical-native-synth speedup is claimed.

Separate Node VM results include VM overhead and exclude browser scheduling; work units must not be compared as equivalent to live audio CPU:

| Mode | VM ms/audio second | Median / p95 / p99 block ms | Worst block ms |
|---|---:|---|---:|
| recorded | 88.69 | 0.2256 / 0.2766 / 0.3865 | 1.5652 |
| hybrid | 450.70 | 1.1598 / 1.3836 / 1.8000 | 3.9995 |
| procedural | 448.84 | 1.1604 / 1.3763 / 1.6705 | 2.3550 |
| muted | 0.43 | 0.0008 / 0.0019 / 0.0024 | 0.2628 |

Coverage limits: overspeed/fuel-cut behavior is checked by existing physical tests and controlled DSP packets (including 6500 RPM without an audio limiter), not a new live forced-overrev maneuver. Real OS audio-device loss/background policies, Firefox/Safari playback, hours-long stability, end-to-end speaker latency and perceptual naturalness remain unverified. No underrun-free certification follows from zero reported errors.
