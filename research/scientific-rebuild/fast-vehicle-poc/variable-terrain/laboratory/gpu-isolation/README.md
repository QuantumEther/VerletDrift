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

## Run the RTX comparison independently

Select **RTX comparison · r180 versus r187** (the default), enter the simulator's drawing-buffer width and height, and press **Run Benchmark**, then **Export JSON**. The pair uses native presentation, antialiasing, high-performance preference, and timestamp tracking off for both revisions. The page reports browser cadence, adapter details, pixel validation, frame intervals and CPU submission times. Validation checks an untimed offscreen probe. Native presentation timing is inferred from animation intervals.

Native WebGL/WebGPU, r180, r187, and the application can also be run separately. Complete suite includes all groups and reports their status independently. Application output-check failures remain visible and do not change the status of the Three groups. Cloud application failures previously included uniform canvas captures and explicit GPU instance loss during offscreen readback. Those observations do not establish whether the target machine has a rendering failure.

From a clean directory:

    git clone --single-branch --branch PERFORMANCE_2_UX https://github.com/QuantumEther/VerletDrift.git
    cd VerletDrift
    python3 -m http.server 8792 --bind 127.0.0.1

Open http://127.0.0.1:8792/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/gpu-isolation/ in Chrome on the RTX laptop. The independent groups need only the benchmark directory and its sibling vendor/three-r180 modules. The application group needs the full checkout.

## Short presentation comparison (current default)

The standalone ZIP now serves both revisions underneath its own index. Extract **all** files together, then run the following command in the directory containing index.html.

    python -m http.server 8792 --bind 127.0.0.1

Open http://127.0.0.1:8792/ on the target display. Use the simulator's drawing-buffer dimensions, leave the short presentation comparison selected, press Run Benchmark and export the JSON. The checkout URL above also includes the actual paused laboratory minimal and complete cases. Use the checkout for a single run covering all twelve cases.

The short run measures cadence and three paths for each of native WebGPU, r180 and r187. Direct renders into the visible canvas. Offscreen uses a persistent GPU target. Native composition copies the resolved image to the canvas in the same command buffer. Three composition draws the target with a fullscreen quad. All three paths use the same triangle, dimensions, requested four-sample AA and high-performance adapter preference. Two application cases add the loaded laboratory and its own diagnostic capture, with timestamp instrumentation off. The embedded page and dashboard retain their own layout and compositor layers.

Required Three modules are imported and revision-checked before timing. Each draw path must then pass an untimed pixel check. Visible WebGPU paths read the submitted canvas texture prior to compositor handoff. Readback and synchronization run outside sampling. Rebuild with `python package.py`, then run `node verify-package.mjs` to test an extracted archive, including a deliberately unavailable r180 module.

For scheduling evidence, first run once without profiling. On a second run record Chrome DevTools Performance (screenshots off, browser and GPU tracks where exposed), save the trace and JSON. Find the matching “VD” user timing marks. Compare renderer-main callbacks, GPU-task spans, compositor frames, dropped/partially presented frames and presentation feedback where available. A command submission can finish before GPU execution or compositor latch. The reported FPS measures callback cadence. Neither this counter nor a successful canvas-texture read proves scanout. Compare within the same display, browser, zoom and power configuration.

### Presentation verification and current hardware evidence

The owner reported median configuration throughput of 184.88 FPS (native visible) and 194.31 FPS (r187 visible) at 1920×1080. Both reached 239.97 FPS offscreen. Reported visible P99 intervals were 18.8 and 16.7 ms respectively, rising from 4.3 ms offscreen. The three original RTX exports were unavailable in this checkout. These aggregate results associate visible presentation with slower cadence but do not identify driver, compositor, GPU queue or application cost individually. They also leave the laboratory's roughly 60 FPS unexplained.

Chromium 154 with SwiftShader and Vulkan compositing verified the three paths for each of native, r180 and r187 at 1920×1080. A freshly extracted distribution separately passed all nine output checks at 640×360 and the intentionally broken import test. Actual paused Cinematic laboratory minimal and full visible targets passed at both sizes. Full laboratory offscreen readback lost its Dawn instance at both sizes. See presentation-validation.json for pixel evidence, errors and sample counts. The 1080p full visible cloud capture produced only one interval. Its percentiles cannot characterize sustained performance.

The distributed package and its two Three revisions are independently usable without application assets. For the decisive RTX run including the application, use the checkout instructions and the default short group. Compare r180 direct against r187 direct first, then r180 direct against laboratory minimal, then laboratory minimal against full. Compare composed against direct within each implementation before considering any simulator change. The application capture pauses physics and includes instrumentation, so an eventual production fix still requires a normal active-driving test.
