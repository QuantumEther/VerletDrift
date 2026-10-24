# Source equilibrium discrepancy review

## What was checked

The actual attached Zhang PDF Table 2 p.18 prints ordinary-cornering `[v,sigma,omega,Omega_r,Omega_f]=[14.96,-0.84,0.29,50.56,49.75]`, gamma=5 degrees, Md=200 Nm. Both supplied copies of `Drifting_Paper_final.pdf` have SHA-256 `d90caa7ac9a70cb3b767c6475feb30b913989aa2bb64d921adbfbc182ac80479`; they are not two independent manuscript versions. Mission 16's image check and this audit's primary equation/table inspection agree. No author data/code, erratum or different publisher version was obtained; no author was contacted.

Fresh offline refinement reproduced the saved equation root exactly:

`[14.959551725963632,-0.8550304834498416,0.2904059047049009,50.50053398836876,49.51138613566645]`.

All five residuals pass the frozen scaled tolerance <=1e-3, the Newton search stays within its preauthorized windows, and local eigenvalues are stable. The largest raw residual is approximately 3.71e-11 rad/s². The front-rotor difference is -0.2386138643 rad/s. This is not a failure to find a nearby source-equation equilibrium.

## Check independent of integration and root finding

At source equilibrium Eq.(7)/(27), D Omega_f_dot=-r Fx,f=0, so Fx,f=0. For positive load/stiffness/friction, Eq.(20) implies Sx,f=0. Thus Eq.(13) requires

`r Omega_f=v cos(gamma)+(sigma+q omega)sin(gamma)`.

With q=1 m and r=0.3 m from Table 1, the printed state gives Vxf=14.855137024941302 m/s, while the listed rotor implies 14.925 m/s. Allowing nearest-0.01 rounding of v,sigma,omega yields Vxf in [14.8492844940,14.8609895559]; nearest-0.01 Omega_f yields r Omega_f in [14.9235,14.9265]. Intervals do not overlap. This argument requires neither the numerical force implementation, inertial coefficients, gravity nor the equilibrium solver. `source-table-audit.mjs` was rerun unchanged and agrees.

## Hypotheses and limits of exclusion

|Explanation|Assessment|
|---|---|
|Two supplied versions differ|Ruled out for these uploads by identical hashes. A different publisher/author revision remains NOT TESTED.|
|Nearest-two-decimal state rounding alone|Ruled out for fixed published gamma/q/r by the interval calculation. It is not a proof against hidden precision in the parameter table.|
|Wrong coordinate/sign convention|Source frame transformation (12),(13) explicitly contains sigma+q omega. No alternative convention is supplied for Table 2. Flipping signs or using rear arm would change the source model, not explain it.|
|Radius mistaken for diameter|Source labels r effective radius and uses r Omega in (9),(13); a factor of two cannot explain a ~0.47% discrepancy.|
|Unpublished effective radius or other parameter precision|Possible. Holding the other printed entries fixed would require radius ~0.298596 m; this is not evidence that the authors used it. Table 1's low printed precision means this possibility cannot be ruled out. No value was fitted or substituted.|
|Different gravity g|Cannot resolve this direct zero-front-slip kinematic check with the printed state fixed. It could affect a separately recomputed root; g=9.81 remains our declared assumption.|
|Wrong equilibrium condition|Checked directly from Eq.(7)/(20)/(27), no rotor acceleration and no front drive torque; zero Fx/f is required in this model.|
|Transcription/implementation mistake|Core signs, dimensions and formula dependencies inspected, fixtures/reruns passed; the direct relation is independent of both code paths. No explaining mistake was found. This is not a proof every program line is bug-free.|
|Typographical/table-generation error|Plausible but UNRESOLVED attribution. Do not label it a proven typo.|

The drifting row is not contradicted by this particular rounding/rolling interval test; that does not certify all of its values are an exact equilibrium. The refined drifting root also reproduced exactly. The appropriate scientific claim remains reproduction of the published **equations with the declared parameter set**, not exact recovery of every printed number.

## Exact evidence needed next, without contacting anyone now

Request, only if separately authorized: the unrounded five-state ordinary/drift Table 2 solutions; the exact parameter file including effective radius, q/d, g and units; manuscript/version identifier used to generate Table 2; the equilibrium residual definition and table-generation code/output, including the meanings of any wheel-speed columns. An erratum or corrected row would also resolve attribution. Do not alter Table 1 or widen root windows to manufacture agreement.

Status: **DISCREPANT printed ordinary-row consistency under the declared coefficients; UNRESOLVED cause; REPRODUCED nearby governing-equation root.** This does not undermine the independent kinetic-power finding, which uses a separately constructed state, nor justify rejecting the executable reference.
