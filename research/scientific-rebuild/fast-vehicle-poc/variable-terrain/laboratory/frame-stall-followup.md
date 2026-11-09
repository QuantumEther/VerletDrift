# Frame-stall follow-up

Source: user RTX 5090 `frame-diagnostics_webGPU.json`, 1,960 raw intervals. At frame 1712, the interval was 37.5 ms, followed by 38 fixed steps taking 7.9 ms of physics and a 10.9 ms callback. Frame 1713 had a 25 ms interval, 25 steps, 5.2 ms physics and a 6.9 ms callback. Frame 1714 had an 8.4 ms interval and eight steps; frame 1715 returned to 4.2 ms. These observations are consistent with catch-up contributing to subsequent missed refreshes, but they do not establish what caused the original 37.5 ms delay or prove the later delays were caused solely by catch-up.

Across this capture, frames with 4–5 steps (n=1,643) spent a mean 0.843 ms in physics; 15.0% were followed by an interval >6.25 ms. Frames with at least 10 steps (n=81) spent a mean 2.946 ms in physics; 25.9% were followed by such an interval. This observational comparison is confounded by workload and prior stalls, not a causal experiment. The existing fixed timestep and accumulated debt remain unchanged.

The old capture predates the terrainGeometry, terrainNormals, terrainTexture and terrainUploadMark fields introduced in 5e4fca1. It cannot establish which terrain operation caused the correlated scene spikes. Upload marking measures only JavaScript work, not the GPU upload. GPU timestamp batches cannot be aligned reliably to individual presentation intervals, and this JSON has no GC events or browser presentation trace. The remaining time is therefore unresolved: CPU callback, GPU execution and screen presentation must not be added together or treated as interchangeable.

## Reproduction on the RTX

1. Run the laboratory from a checkout including 5e4fca1 or later. Use the same yard, Cinematic, 100% resolution, top camera and smoke settings recorded in the earlier capture; wait for the asset and HDR status to be ready. Keep the browser foreground on the 240 Hz display.
2. In Chrome DevTools Performance, enable screenshots and memory, start recording, and perform a repeatable yard route crossing tile boundaries. Stop after 10–20 seconds and save the trace. Include GPU tracks where the browser provides them; retain the trace locally if it contains private information.
3. Separately use Frame Diagnostics to capture a matching route with GPU timestamps enabled and download the JSON. Repeat with timestamps disabled to assess measurement overhead. Record browser version, OS, GPU routing and refresh settings.
4. Run the paused A/B audit to isolate visible scene components at a fixed state. Use separate repeatable driving runs for physics-on/off or terrain transitions; do not compare a paused vehicle to a moving one as though only one variable changed.
5. Compare frame indices/times where available: terrain CPU subfields, preceding and subsequent frame interval, step count and physics wall time. Inspect the trace for GC, render submissions, GPU work, compositor and VSync/presentation events. Asynchronous timestamp batches are not frame-aligned GPU or presentation latency.

No candidate optimization is justified by this capture alone. A repeatable terrain transition with the new timing fields and trace, followed by matched before/after tests, is required before claiming an improvement.
