# Corrected GPU benchmark checkpoint

The old Three.js tests used base THREE.Camera, which has no updateProjectionMatrix method. The corrected scene uses OrthographicCamera, spanning −1 to +1, placed one unit in front of the native-equivalent triangle. Production simulator files are unchanged.

Each Three case must pass an untimed orange center-pixel readback before its timing is recorded. The probe is disposed and the selected target is restored. Queue completion waits occur during cleanup only. Renderer size/pixel-ratio calls are counted. GPU duration measurement remains unimplemented; timestamp toggles compare tracking overhead only.

## Executed verification

verified-three-cases.json records 96 passed output checks, 48 each for r180 and r187, including 640×360, 1280×720 and 1920×1080, antialiasing, presentation, adapter preference and tracking combinations. Chromium 154 used SwiftShader. The short windows validate execution, not RTX performance. Native GPU-instance warnings occurred but no case errors were recorded. Historical resize fields in this report describe setup calls. Current counters instrument actual renderer calls.

CDN loading originally failed. The r187 build modules and MIT license are now isolated locally under vendor-r187, copied from the official npm three-0.187.0.tgz release. Production Three modules remain unchanged.

verified-application-cases.json records four FAILED application tests at 1920×1080. Native minimal/full scenes initialized but failed canvas-pixel validation. Offscreen cases hit external-instance/mapAsync errors. No timings were accepted. The cloud environment therefore has not passed the complete verification gate. Another owner capture is not requested as though it had passed.

## Entry

Serve the repository root and open laboratory/gpu-isolation/index.html. Run Benchmark executes the matrix, and Export JSON retains errors, settings and validations. Set the two buffer fields to the actual simulator drawing buffer. The 1920×1080 default is configurable, not an observed owner setting. Independent pixel ratio is 1 with explicit buffer dimensions. Application comparisons reject buffer mismatches.

The last four cases load the actual simulator, pause physics and compare minimal/full modes in native and offscreen rendering. They require model and environment readiness and include application snapshots. Pixel validation precedes timing. Native presentation still needs screenshot review.

Run verify-three.mjs and verify-application.mjs from repository root with a server on port 8792 for short verification. They export to /tmp. The full matrix uses longer timing windows.

## Interpretation and access

The supplied owner figures establish near-240 Hz native WebGPU on NVIDIA Blackwell for the minimal workload. No complete hardware JSON was attached in this turn for independent inspection. The prior Three results were invalid because of the camera defect. No corrected RTX Three measurements exist yet, so neither a revision-specific issue nor application-level cause is established.

The remaining release blocker is unresolved. Hardware FPS gains are not claimed. All 44 laboratory regression tests pass. Public branch hosting remains unavailable/unverified; the last environment lookup showed no HTTP preview portal, and GitHub Pages API access returned Forbidden. A source URL is not an executing benchmark.
