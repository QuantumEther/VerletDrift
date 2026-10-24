# Mission 20 — isolated numerical verification

**Original method slices executed; no complete Chrono vehicle executed.** Gate Zero: CONDITIONALLY READY under [source audit](tmeasy-source-and-license-audit.md). No source-law patch or parameter tuning. This report distinguishes successful reproduction checks from failed candidate requirements.

## Reproduce

From repository root:

```bash
python3 research/scientific-rebuild/tmeasy-evaluation/verify.py /tmp/tmeasy-m20-repeat --benchmark
```

Needs Python standard library, g++ supporting C++17 and a writable output directory. No internet, CMake, Eigen, browser or production imports are needed. Build uses `-std=c++17 -O2 -Wall -Wextra -Wno-unused-parameter`, without fast-math. It verifies [upstream hashes](../../research/scientific-rebuild/tmeasy-evaluation/source-manifest.json) before extracting unchanged method bodies into temporary includes. The adapter supplies prescribed flat contact/identity transforms; original collision, world-frame transport, spindle integration and JSON parsing are outside executed coverage.

Branch `scientific-rebuild/07-tmeasy-evaluation`, input repository base `9f60a9931c6c9dc08f5b4095aa901193b6ed5a9b`; upstream `9a5072b5324e012a66d9fb7eaac0c679b8465e73`. [verification.json](../../research/scientific-rebuild/tmeasy-evaluation/results/verification.json) includes exact harness-file hashes, compiler/runtime, all assertions, distinct candidate failures and trace SHA-256. This identifies the tested content before the documentation commit without inventing a future commit ID. Trace SHA-256: `28680496d8f91ce3c595f86ea770daee81960e1ad397351d68f4f98baa170340`.

## Frozen bounded case matrix

The case set is encoded explicitly in harness.cpp before the saved run, not a parameter search. It contains 54 output records:

- Longitudinal, lateral and combined slips at ±.02 and ±.2, pure zero slip, plus ±1e-7 slope probes. Positive rolling speed R_eff*Omega=10 m/s; denominator includes .01 regularization.
- Nine signed speeds {-10,-3,-1,-.01,0,.01,1,3,10} m/s with small fixed slip velocities; six points within 1e-6 m/s of force/moment thresholds 1 and 3.
- Two mirrored forward/reverse states; loads {.5,1,2,4}*pn (handling q capped at 3.5).
- Three bristle preloads {-1,0,+1} mm; scalar history at dt {.01,.005,.0025,.00125} s over matched .1 s.
- Geometric no-contact, damping-induced negative normal force, exactly zero normal force, two unequal Advance arguments with equal configured dt, and one stored-bristle-release state.

All use source generic parameter guessing: pn=8562.8266094525 N, R0=.4699 m, width=.3175 m, rim radius=.20955 m, d1=411120.924210318 N/m, dz=3931.68497597505 Ns/m, rr=.015. Nominal depth=.020828 m, R_eff=.462957333333333 m. Road friction is the original float .8 divided by reference double .8: actual ratio 1.0000000149011612 is retained, not rounded out. No Hoosier, DeLorean or Zhang calibration is claimed.

## Actual results

**38 reproduction/identity assertions passed; zero unexpected assertion failures. Four candidate defects/contract failures remain FAIL.** The script exit code describes reproduction, not tire approval. [Raw CSV](../../research/scientific-rebuild/tmeasy-evaluation/results/cases.csv) retains NaNs; it is not a successful-only dataset.

|Check|Actual finding|
|---|---|
|Determinism|Two complete runs gave byte-identical CSV.|
|Fixture SI checks|Independent size/load conversion and stiffness formula agreed within 2e-12 relative/absolute tolerance.|
|Force signs and symmetry|Forward positive/negative pure and combined probes reflected correctly; combined response differs from adding independently saturated pure forces.|
|Initial slope|Longitudinal 152216.211666 versus analytical limit 152216.230940 N; lateral 63376.024981 versus 63376.048585 N. Relative tolerance 1e-5 covers the finite 1e-7 probe's rational-curve correction; errors are much smaller.|
|Load|Fn tracks input load; q caps at 3.5 for 4*pn. Normal load is not silently capped in output.|
|History|Different preloads change output; exact scalar Dahl solution independently verifies matched-time convergence.|
|Wrench/rotor power|12 independent cross-product accounting checks close within 2e-10 W absolute plus 2e-12 relative. This does not certify constitutive passivity.|
|Zero-force boundary|**FAIL:** Fn=0 leaves contact active; Fx/Fy/bristles become NaN. Other 53 records are finite.|
|Moment continuity|**FAIL:** Mz jumps by 13.3947998 Nm at forward 1 m/s.|
|Forward/reverse symmetry|**FAIL:** mirrored Fx=-1049.376815/+500 N and Mz=36.268482/0 Nm. Signed-speed law selection explains it.|
|Advance time contract|**FAIL:** changing only Advance argument .001→.01 leaves brx identical. SetStepsize governs the actual update.|
|Contact reset|Geometric separation clears memory; damping-induced deactivation preserves the 1 mm preload in that call.|
|Full storage/thermodynamic balance|**UNRESOLVED**, not counted as a pass.|

### Independent transient convergence

For constant v=.1 m/s, z0=0, sigma0=100000 N/m and constant fc, exact solution is `z(t)=fc/sigma0*(1-exp(-sigma0*abs(v)*t/fc))`. At t=.1 s it gives .009438163017790536 m.

|dt s|State absolute error m|Refinement ratio|
|---:|---:|---:|
|.01|1.0112870584e-7|—|
|.005|2.5281801127e-8|4.000059|
|.0025|6.3204268295e-9|4.000015|
|.00125|1.5801052394e-9|4.000004|

This is an independent closed-form ODE check, not RK4-against-RK4 or proof that a coupled vehicle converges. State integration and force time level are different: Advance returns force computed from old bristles. Contact switching, variable load, varying frames and global energy quadrature remain unvalidated.

[Performance](tmeasy-computational-assessment.md) is separately measured. No empirical tire validation, four-wheel driving, full Chrono integration, standstill vehicle stability, or browser performance was established.
