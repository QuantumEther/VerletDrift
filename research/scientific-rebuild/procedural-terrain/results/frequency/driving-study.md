# One-second driving frequency comparison

All 42 actual production-adapter runs completed without bypassing work checks. Seven scenarios × six frequencies, including 2000 Hz as a refinement reference. This is a short convergence/performance screening, not certification of lower-rate driving. State traces at matching 0.1 s intervals include pose, velocity, wheel speeds, engine/clutch/gear modes, loads, slip/utilization, suspension coordinates, heat and ledger. Timings include warmup and shared-machine variability. No internal subdivision is added.

| Case | Hz | Max velocity error vs 2000 Hz (m/s, rad/s mixed norm) | Max suspension coordinate error (m/rad mixed max) | Max wheel-load error (N) | Mean step ms | Peak ledger residual J |
|---|---:|---:|---:|---:|---:|---:|
| starter | 1000 | 1.388e-09 | 8.167e-10 | 2.745e-06 | 0.415 | 5.12e-13 |
| starter | 500 | 4.148e-09 | 2.431e-09 | 8.061e-06 | 0.531 | 5.52e-13 |
| starter | 250 | 9.563e-09 | 5.571e-09 | 1.811e-05 | 0.590 | 5.01e-13 |
| starter | 200 | 1.221e-08 | 7.092e-09 | 2.289e-05 | 0.636 | 4.23e-13 |
| starter | 100 | 2.484e-08 | 1.425e-08 | 4.501e-05 | 1.048 | 5.29e-13 |
| acceleration | 1000 | 2.48e-05 | 1.059e-05 | 0.04013 | 1.053 | 1.46e-12 |
| acceleration | 500 | 7.379e-05 | 3.149e-05 | 0.1165 | 1.634 | 2.66e-12 |
| acceleration | 250 | 0.0001693 | 7.218e-05 | 0.2569 | 2.555 | 5.59e-12 |
| acceleration | 200 | 0.0002159 | 9.198e-05 | 0.3221 | 2.546 | 6.55e-12 |
| acceleration | 100 | 0.0004376 | 0.0001857 | 0.6152 | 6.242 | 1.12e-11 |
| steering | 1000 | 2.481e-05 | 1.059e-05 | 0.04026 | 0.945 | 1.5e-11 |
| steering | 500 | 7.381e-05 | 3.149e-05 | 0.1169 | 1.395 | 3e-11 |
| steering | 250 | 0.0001694 | 7.218e-05 | 0.2577 | 2.116 | 5.88e-11 |
| steering | 200 | 0.000216 | 9.198e-05 | 0.3232 | 2.438 | 7.42e-11 |
| steering | 100 | 0.0004377 | 0.0001857 | 0.6173 | 5.389 | 1.48e-10 |
| braking | 1000 | 4.82e-06 | 2.146e-06 | 0.005973 | 0.876 | 5.84e-13 |
| braking | 500 | 1.431e-05 | 6.384e-06 | 0.0175 | 1.473 | 8.09e-13 |
| braking | 250 | 3.275e-05 | 1.465e-05 | 0.03915 | 2.020 | 8.38e-13 |
| braking | 200 | 4.171e-05 | 1.869e-05 | 0.04941 | 2.460 | 1.39e-12 |
| braking | 100 | 8.416e-05 | 3.784e-05 | 0.09689 | 5.152 | 2.25e-12 |
| handbrake | 1000 | 3.081e-06 | 1.315e-06 | 0.004974 | 0.872 | 6.25e-13 |
| handbrake | 500 | 9.166e-06 | 3.91e-06 | 0.01445 | 1.293 | 6.26e-13 |
| handbrake | 250 | 2.103e-05 | 8.963e-06 | 0.03184 | 1.817 | 8.86e-13 |
| handbrake | 200 | 2.682e-05 | 1.142e-05 | 0.03992 | 2.257 | 8.97e-13 |
| handbrake | 100 | 5.435e-05 | 2.306e-05 | 0.07626 | 4.675 | 1.45e-12 |
| clutch | 1000 | 4.133e-05 | 1.765e-05 | 0.06688 | 0.773 | 2.35e-12 |
| clutch | 500 | 0.000123 | 5.249e-05 | 0.1942 | 1.057 | 5.14e-12 |
| clutch | 250 | 0.0002822 | 0.0001203 | 0.4281 | 1.909 | 9.31e-12 |
| clutch | 200 | 0.0003599 | 0.0001533 | 0.5368 | 2.179 | 1.05e-11 |
| clutch | 100 | 0.0007292 | 0.0003095 | 1.025 | 4.661 | 2.12e-11 |
| recontact | 1000 | 0.0003153 | 0.0001559 | 7.247 | 1.218 | 1.09e-11 |
| recontact | 500 | 0.0008922 | 0.0004368 | 21.32 | 1.717 | 1.33e-11 |
| recontact | 250 | 0.001621 | 0.001056 | 47.64 | 2.773 | 1.18e-11 |
| recontact | 200 | 0.001921 | 0.001365 | 59.81 | 3.243 | 3.67e-11 |
| recontact | 100 | 0.002931 | 0.002815 | 111.8 | 7.659 | 2.48e-11 |

These mixed-unit error norms are diagnostic summaries, not acceptance tolerances. Use component traces for physical acceptance. Event timing resolution in the stored samples is 0.1 s; this cannot establish selector/clutch event integrity at coarse rates. No lower default is recommended yet. Remaining: independently justified component error gates, full driving durations, finer-step verification beyond 2000 Hz, incline/bump/cornering scenarios, event-resolution tests, browser/per-frequency profiling, sustained runs, E10 rerun and GPU/worker assessment.
