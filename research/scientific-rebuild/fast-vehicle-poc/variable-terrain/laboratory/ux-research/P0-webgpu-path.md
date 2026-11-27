# WebGPU-specific path review

New owner evidence establishes WebGL near 240 FPS and WebGPU near 60–70 FPS on the same machine. Full applied-settings and adapter equivalence are still unverified.

The renderer factory previously omitted powerPreference, and vendored Three.js passes that undefined value directly to navigator.gpu.requestAdapter. It now requests high-performance explicitly. This removes an adapter-selection ambiguity; it is not proof that the previous run used an integrated GPU. Timestamp tracking is disabled at renderer construction and enabled by existing explicit diagnostic captures. No quality setting or physical parameter was reduced.

Renderer snapshots now export setSizeCalls, setPixelRatioCalls and requested power preference. Compare counter deltas over a steady capture. Buffer dimensions and pixel ratio are already included in the diagnostic settings. The earlier floor/round fix remains active in both paths.

The ordinary frame loop invokes renderer.render without awaiting a queue completion. The explicit onSubmittedWorkDone wait appears in diagnostic offscreen readback, not normal drawing. Asynchronous timestamp resolution is guarded and only requested for captures. These source observations do not establish the cause of presentation stalls.

A Chromium software-GPU smoke test initialized both backends, submitted an empty scene and disposed them. Both recorded one deliberate setSize call and zero setPixelRatio calls. WebGPU selected the real WebGPU backend. Software adapter details were sparse, so this test establishes no NVIDIA routing or speedup. All 44 laboratory regression tests pass.

Remaining work requires native paired captures: actual adapter identification, identical drawing buffer and shadows, empty/minimal/full/no-submission/native/offscreen comparisons, graphics-subsystem isolation and browser GPU/compositor trace. Neither the 3.7× disparity nor 240 Hz recovery is resolved. No direct public UX diagnostic deployment has been verified. The browser diagnostic entry remains laboratory/refresh-audit.html on PERFORMANCE_2_UX, and laboratory/index.html remains the simulator entry.
