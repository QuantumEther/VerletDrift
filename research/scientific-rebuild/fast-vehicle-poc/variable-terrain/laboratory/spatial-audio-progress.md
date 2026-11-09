# Spatial audio: partial implementation

This is a partial implementation on PERFORMANCE, based on `7a69123`. It does not
complete the requested spatial-audio mission. The default is Off, preserving the
original stereo output. Stereo and HRTF modes connect the existing engine worklet
through a separate gain, high-shelf, cockpit-filter and PannerNode path. The panner
uses no built-in distance rolloff, so distance is applied only once. The Web Audio
panner downmixes the mixed stereo recording in spatial modes; the Off and dry-capture
paths retain its original stereo. Dry and final capture routes are selectable.

The source is a provisional 0.8 m forward, 0.15 m above-COM point transformed by
the existing chassis orientation. Camera coordinates and listener orientation are
read after the existing camera update. Both scene positions are translated by the
physical vehicle x/y for world-position diagnostics; relative displacement is
unchanged by this recentering. The listener uses the camera transform, not its FOV.
Updates run at most 20 times per second and audio parameters use short smoothing.

Beyond a 1 m default reference, amplitude follows reference/distance, with a smooth
fade between 80% and 100% of the chosen maximum distance. A modest directional gain
and high-frequency shelf favor the rear; they are approximations applied to the
mixed recording, not separated intake/exhaust stems. A 4 kHz high-shelf provides an
empirical temperature/humidity-dependent loss. It is **not** a validated atmospheric
absorption model or an ISO 9613-1 implementation. Cockpit gain and low-pass treatment
are explicitly approximate. Spatial-node failures fall back to the dry path and do
not fault physics.

`node --test .../laboratory/*.test.mjs` passed 28 tests. The browser smoke test
`node .../laboratory/spatial-browser.mjs` passed mode switching with frozen physics
state and detected nonzero signal in both capture routes. It ran in Chromium with
SwiftShader, not on the user's audio hardware. The standalone mathematical Doppler
function was unit-tested for signs; it is **not connected to the audio graph**.

Still required: a validated downstream Doppler processor and physical listener-motion
policy; actual approaching/receding tests; a source-backed atmospheric absorption
model; directional and binaural listening checks; requested scenario captures;
performance measurements; and robust mode-transition/near-field validation. No
perceptual listening assessment was performed. The current work must not be treated
as satisfying the full mission.
