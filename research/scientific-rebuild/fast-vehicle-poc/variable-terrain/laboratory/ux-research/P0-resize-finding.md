# P0 resize allocation finding

The draw path compared canvas dimensions with Math.round(CSS size × renderer pixel ratio). Both vendored Three.js r180 backends use Math.floor in setSize. A fractional result rounding upward therefore failed the size check forever. Repeated calls rewrite the canvas drawing-buffer dimensions, potentially reallocating backend presentation resources. The correction uses the renderer's existing floor convention. Drawing resolution, preset, physics and audio settings are unchanged.

Source inspection found the same round comparison at 515c452, 90b9498, 03763bf, 03e0be7 and pre-fix HEAD. The issue predates the UX changes. New layouts, DPR and resolution combinations can expose it, but no native evidence currently links it to the owner's 60–80 FPS report.

A real Chromium WebGL/SwiftShader reproduction held the same 1440×900 window, DPR 1.25, 75% render scale and paused state. During a three-second observation, writes to the perspective canvas width/height totaled 14 before and 0 after. Both drawing buffers remained 911×487. Raw snapshots are in resize-regression.json. This demonstrates removal of redundant allocations, not an FPS recovery. The end-of-capture FPS counters were about 2 and 1.18 respectively under severe cloud software-rendering load and establish no speedup. All 44 laboratory regression tests pass.

Reproduce from the repository root with a local server on 8789 and run ux-research/resize-regression.mjs using Node. The script intercepts the pre-fix view source from commit 12d4188 while keeping the rest of the page identical. It writes results to /tmp/resize-regression.json. The width/height setters are counted directly rather than inferring allocations from frame rate.

Full matched historical driving comparisons, RTX GPU/compositor traces, active audio comparisons, matched P95/P99 distributions and the 240 Hz acceptance test remain outstanding. Existing refresh-audit.html is the browser diagnostic entry. A public branch deployment is still unverified. Hardware resolution of this release blocker has not been claimed.
