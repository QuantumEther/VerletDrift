# Independent presentation benchmark checkpoint

Serve the repository root and open laboratory/gpu-isolation/index.html. Run Benchmark executes the independent matrix sequentially and Export JSON preserves settings, raw intervals and CPU samples. Cases contain a triangle only. Each renderer is disposed before the next. The loop submits without queue completion waits or CPU texture readbacks.

Native cases use WebGL2 and WebGPU. Three cases use existing r180 modules and pinned npm Three 0.187.0, the latest stable returned by registry.npmjs.org/three/latest during implementation. The newer module loads from jsDelivr and may fail under content/network policy. Such failures are recorded per case. No production Three files are upgraded.

Variants cover 640×360 and 1280×720 buffers at renderer pixel ratio 1, antialiasing, native/offscreen WebGPU, default/high-performance preference and Three timestamp tracking toggles. Raw GPU duration queries are not implemented. Three tracking variants do not resolve GPU timestamps, so only overhead is compared. No GPU duration is fabricated. CPU timing includes command encoding/submission, not presentation. Adapter identity is reported where available and missing information remains null. WebGL antialiasing is browser controlled and actual context attributes are recorded.

The entry was smoke-tested in Chromium/SwiftShader with empty-page cadence and four native WebGL cases, all completing without page errors. The software environment runs near 60 Hz and establishes no RTX behavior or performance correction. The complete multi-minute matrix, CDN Three revision, native hardware routing and performance remain unverified.

The requested embedded VerletDrift minimal/full cases, GPU duration measurements and direct public deployment remain unfinished. Existing refresh-audit.html provides separate application captures. The new page is an intermediate test instrument, not a completed release recovery. The failing layer has not been identified and no quality reduction or new speculative optimization is included.
