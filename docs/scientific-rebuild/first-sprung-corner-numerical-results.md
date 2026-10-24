# Mission 23 — numerical results

Experiment `M23-CORNER-001`, base `e75a0650cd0001f13192aead8a416fca7189dd4d`, is recorded in [verification.json](../../research/scientific-rebuild/first-sprung-corner/results/verification.json). Per-case traces and parameter snapshots are under [results/](../../research/scientific-rebuild/first-sprung-corner/results/). CSVs distinguish the frozen force-evaluation time from the post-step state time.

## Mechanical checks

| Measurement | Result |
| --- | ---: |
| Settled static tire load | 3409.956000000004 N |
| Expected total fixture weight | 3409.956000000001 N |
| Settled suspension spring support | 2746.800000000 N |
| Maximum static vertical guide reaction | 7.17e-24 N |
| Free-wheel applied torque impulse | 30.000000000 N·m·s |
| Free-wheel angular momentum change | 30.000000003 N·m·s |
| Free-wheel energy change / drive work | 61.52331733725384 / 61.52331733727077 J |
| Free-spin energy residual | -1.69e-11 J |
| Peak driven tire force / guide reaction | 577.316 / 577.316 N |
| Wrench translation maximum error | 6.49e-11 N·m |

The drive result confirms force transmission into its constrained support. It makes no claim of free chassis acceleration. The boundary test reaches raw support `-4.5474735088646412e-13 N`, applies zero normal load, and retains finite preexisting bristle history. The separate unloading case records 8 negative-support samples, 390 separated samples, and one recontact. All state and native step checks were accepted.

## Timestep refinement

The same 0.5 s shaft-torque case ran at 1.0, 0.5, and 0.25 ms. Compared with the 0.25 ms trace at common times:

| Step | Wheel relative-speed RMS error | Peak absolute error | Tire Fx RMS error | Peak absolute error |
| ---: | ---: | ---: | ---: | ---: |
| 1.0 ms | 7.96875e-4 rad/s | 0.0034822 rad/s | 3.7180 N | 37.0616 N |
| 0.5 ms | 2.59641e-4 rad/s | 0.0011242 rad/s | 1.2277 N | 12.1976 N |
| 0.25 ms | reference | reference | reference | reference |

Normal-load differences stay around 1e-9 N RMS in these mechanically guided cases. This local convergence study does not establish a global order for TMeasy's stateful contact update.

## Vertical suspension response

Using the native local tire stiffness 411120.924 N/m and damping 3931.685 N·s/m, the declared two-mass heave linearization predicts slow frequency 1.526243 Hz and decay 3.183333 s⁻¹. The measured response gives 1.526718 Hz and 3.188734 s⁻¹: relative differences 0.0311% and 0.1697%, respectively. This is agreement for one isolated vertical mode, not validation of a complete suspension or vehicle model.

## Performance

On the recorded AMD EPYC 9V74 Linux x86_64 host, with GCC 14.2.0, the benchmark warmed 1000 steps then timed 5000 1 ms steps. The process and CSV-inclusive run completed 28,790 physics steps per wall second. Per-step cost was:

| Work | Mean | Median | p95 | p99 | Worst |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native tire update | 0.468 µs | 0.441 µs | 0.531 µs | 0.981 µs | 68.040 µs |
| Native mechanical step | 12.063 µs | 11.236 µs | 12.289 µs | 30.184 µs | 367.641 µs |
| Total instrumented step | 12.703 µs | 11.798 µs | 12.919 µs | 31.746 µs | 368.472 µs |

This is a single constrained corner benchmark including its native Chrono assembly and instrumentation. It is not comparable to a browser frame or four-wheel vehicle tick, and the observed worst cases include runtime scheduling variability. No speedup claim is made.

## Energy-accounting caveat

The free-spin and brake tests close the explicit shaft work ledger tightly. Final mechanical-energy ledger residuals are `-48.936 J` for the sprung disturbance, `+0.290 J` for unloading, and `-1.087 J` for the boundary-history case. The ledger omits a separately measured tire bristle-energy state, and unloading includes external fixture work; neither fact has been shown to explain the large disturbance residual. That residual remains an open accounting problem. These tests validate selected torque and impulse identities but do not establish tire passivity or full transient contact-energy closure.
