# RTX 5090 profiling workflow

Use a checkout of PERFORMANCE_2 containing this workflow and the terrain instrumentation. From the repository root run:

```sh
git status --short
git rev-parse HEAD
python3 -m http.server 8000
```

Open `http://localhost:8000/research/scientific-rebuild/fast-vehicle-poc/variable-terrain/laboratory/` in the desktop browser on the 240 Hz display. Select the backend explicitly. Verify the custom vehicle and environment show ready and allow shader/asset warmup. In Frame Diagnostics enter the `git rev-parse HEAD` result and GPU/driver details; record any dirty working-tree files separately. These fields are user-supplied and unverified: a static page cannot independently determine the checkout commit. Browser/user agent, requested/active backend, presentation mode, renderer-reported identifier, canvas resolution, quality and other capture settings are included automatically. A GitHub Pages deployment can lag a branch; do not assume its commit matches the branch tip.

## Paused rendering audit

Set the desired camera, terrain and graphics, then choose **Run paused A/B audit**. Keep the camera/tab unchanged and download its JSON when complete. It freezes and restores the physical state and settings. Smoke submission can be disabled without clearing its particles. The suite isolates component submissions approximately; direct-light-off does not disable HDR and a paused pose cannot measure physics or terrain transitions. Repeat and interleave baseline captures to account for shader warmup, probe overhead and thermal drift. Do not interpret component deltas as additive GPU costs.

## Moving terrain capture

Select Full laboratory and the desired GPU-timing checkbox. Choose 10, 20 or 30 seconds under Moving capture duration, press **Start moving / manual capture**, click the scene to restore keyboard focus, and drive a repeatable route that crosses yard tile boundaries. Download the JSON. Repeat the same route with GPU timing disabled to assess instrumentation overhead and record a second route/capture for before/after comparisons. The four terrain fields appear per frame and in summaries: geometry preparation, normal recomputation, texture preparation and upload marking. They are CPU wall times within scene time, not additive scene costs or GPU transfer timings. `terrainUploadMark` covers the terrain-detail attribute flags; position/color flags are included with normal preparation and the texture dirty flag is included with texture preparation. Record simulation steps and physics time alongside intervals. Do not suppress clock debt or change the 1 ms physics timestep.

## Browser trace

Open Chrome DevTools > Performance. Enable memory and screenshots if available, start recording, drive the same route for 10–20 seconds, stop, and save the trace. Inspect Main/Frames and available GPU/compositor tracks for long tasks, GC, submissions, GPU work and presentation intervals. Chrome versions expose different GPU categories; do not assume missing tracks mean zero GPU work. Treat timing-query results as asynchronous render-pass batches, not individual frame completion or presentation latency. Correlate by approximate time and compare repeatable patterns; collect additional tracing where event alignment or compositor detail is unavailable. Traces can contain sensitive browsing data: inspect before sharing.

Keep the tab foreground; reject captures marked hidden or settings-changed. The A/B runner and manual trace are complementary: one provides frozen-state component comparisons, the other exposes real driving, terrain recentering, catch-up and scheduling. GPU timestamp on/off comparisons reveal probe overhead. Save raw JSON and trace with browser/driver, OS, display refresh and backend. Without new target-hardware captures, no before/after optimization or 240 Hz claim is justified.
