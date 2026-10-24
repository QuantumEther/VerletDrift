# Mission 19 — geometry recovery

Sources/revisions and rights: [inventory](stocco-source-recovery-inventory.md). J means the journal; T the attached thesis; E/A the pinned ENVE/ACME sources. **General geometry support is recovered; the Hoosier LCO geometry is not.**

## What the new sources actually define

T pp.161,184 leaves `R(y)` arbitrary. Appendix B pp.164–170, E `shape.cc:225–235` and `shell.cc:61–95` now provide an inspectable implementation family:

```text
R(y) = Rx [1 - (|y|/Ry)^my]^(1/mx),    |y| <= Ly
w = 2 Ly/n
yi = -Ly + (i+1/2) w,                 i=0,...,n-1
ri = R(yi)
```

`Ly` is a **half-width** in the implementation, even though the accessor is named `surfaceWidth`. `Rx,Ry,Ly` are metres; exponents dimensionless. The caller must choose a profile whose radius remains real/positive over the tread. The equations are recovered from code inspection; no library run or footprint convergence test is claimed. Crown curvature follows from the selected profile, but no LCO values of its coefficients are supplied.

E `tests/enve_test_00.cc:61–68` gives `n=10, Rx=.327, mx=4, Ry=.195, my=4, Ly=.188`. Test 05 supplies a different example `Rx=.313, mx=4, Ry=.11, my=4, Ly=.1025`. Neither is identified there as Hoosier 18×6-10 LCO. Their dimensions must not be relabeled as the author's calibration. T Appendix B pp.171–175 explicitly uses **205/60R15 at 2.2 bar**, with Magic Formula 6.2 in the vehicle example (p.173); it is another tire and another constitutive model. J's 325/660R13 timing fixture and 225 kPa example likewise are not the LCO fixture.

T B.3, E `rib::envelopGeometric` and A's plane/disk intersection explain how supplied geometry and pose produce a contact point, normal and depth. For an upright rib above a flat plane, let `d` be hub height, `rho_i=R(yi)-d` for a contacting rib. E returns geometric chord length

`ell_geom,i = 2 sqrt(rho_i [2 R(yi)-rho_i])`.

This follows directly from circle/line intersection. E's reported area is chord length times rib width, while its mesh algorithm also weights points/normals by intersected volume. T B.(8)–(13), pp.166–167 gives the corresponding area/volume/contact averaging and quadrature. A supplies intersection primitives, not a fitted tire.

**This is not J Eq.(6)/T Eq.(C.2):**

`ell_model,i = 2 sqrt(rho_i [2 (R(yi)-Rell)-rho_i])`.

The additional belt/contact transition radius `Rell` is still an external physical parameter. Matching the ENVE geometric chord by setting `Rell=0` would select a value that the sources do not establish for Hoosier. No accessor, test value or author calibration resolving it was found in the relevant inspected sources.

J Eq.(23)/T p.193 defines `Rr(y)=R(y)-rho(y)/3`; this is the effective rolling-radius convention, **not** the belt transition radius or the loaded hub height `Rz=n·(H-O)` (T p.188). A fixed load and zero camber do not uniquely specify any of these radii without the actual profile, pressure and vertical compliance solution.

## Recovery disposition

|Dependency|Evidence, conclusion and classification|
|---|---|
|General profile class and rib construction|E shape/shell functions above; T B.(6), B algorithms. **RESOLVED — PRIMARY-SOURCE** as a generic implementation family, not an LCO calibration.|
|Half-width and midpoint rib coordinates|E resize explicitly uses `2*surfaceWidth/n`; equations above. **RESOLVED — DERIVED** interpretation of its naming.|
|Geometry/pose to flat-road deflection and geometric area|E rib lines 329–364 and A intersection; T B.3. **RESOLVED — PRIMARY-SOURCE** for the enveloping geometry, not the belt-corrected constitutive patch.|
|LCO profile, tread bounds, crown and individual radii|J arbitrary R, T arbitrary R and unrelated E examples. **UNRESOLVED** numerical fixture. No image fitting or guessed torus/cylinder.|
|Belt transition radius|J (6), T (C.2), p.186 repeats its definition but no identified LCO value. **UNRESOLVED**.|
|Rolling-radius definition|J (23), T p.193 agree. **RESOLVED — PRIMARY-SOURCE** relationship; numerical LCO radius **UNRESOLVED**.|
|Hub placement/deflection|T (C.1), p.185 and E give the mapping once inputs exist. **PARTIALLY RESOLVED**: load alone does not provide missing inflation/profile.|
|Constitutive contact length/area/pressure|T (C.2)–(C.4), pp.186–187 repeat J. **PARTIALLY RESOLVED** definitions; numerical values require missing geometry and Rell.|
|Hoosier inflation and exact footprint/output|T C.4.2 / Figs.C.6–C.8 identifies LCO and load series but supplies no complete geometry/inflation/output fixture. **UNRESOLVED**.|

For steady sub-bottoming vertical load, the source would allow `rho=667/kz` once the correct pressure, wheel speed, camber and units are frozen; this conditional derivation cannot infer those missing inputs. Contacting rib selection, positive square-root arguments and pressure positivity must be checked, not repaired by a force clamp.

No source-provided unrounded LCO footprint (`yi,ri,rho_i,ell_i,AP`) or combined-slip/spin wrench with residual was recovered. T's figures are empirical fit plots, not a numerical contact reference. The general equations' reproducibility and the specific tire's reproducibility remain separate questions; [fixture completeness](stocco-fixture-completeness.md) also identifies equation blockers independent of geometry.
