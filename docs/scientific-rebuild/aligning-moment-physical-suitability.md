# Aligning-moment physical suitability

## Independent work audit and attempted falsification

Source version/hash and execution record: [reproduction audit](independent-reference-reproduction-audit.md). Notation follows Zhang; r is radius, omega yaw rate. From source A16/A22 axle angular velocities and center velocities (10),(12), independently sum all three rigid-body energies:

`E0=m(v²+sigma²)/2+p sigma omega+J omega²/2+D(Omega_r²+Omega_f²)/2`.

For smooth prescribed steering, add `C omega gamma_dot+C gamma_dot²/2`. Source (8) gives m=1400 kg, p=-50 kg m, J=2830.54 kg m². G is body COM, not combined-system COM. Omitting the p cross term is incorrect. Using the coupled mass balance

```text
[m p; p J] [sigma_dot+v omega; omega_dot]
  =[Fy,r+Fx,f sin(gamma)+Fy,f cos(gamma);
    -d Fy,r+q(Fx,f sin(gamma)+Fy,f cos(gamma))+Mz,r+Mz,f-C gamma_ddot]
```

and rotor reactions proves, at constant gamma,

`E0_dot=Md Omega_r+sum[Fx(Vx-r Omega)+Fy Vy]+omega(Mz,r+Mz,f)`.

A fresh symbolic simplification returned zero residual. This is a derivation from the mass matrix, not acceptance of a stored diagnostic total. Front/rear moments are about their local vertical axes; constant steering makes both yaw rates omega. Axle-spin reaction is -r Fx; it cancels wheel/chassis transfer once, not twice. Normal/support and constrained pitch/roll forces do no work at zero constrained velocities. Holding steering may require torque but contributes zero power when gamma_dot=0. For varying steering the tire front moment uses omega+gamma_dot and actuator power is `[C(omega_dot+gamma_ddot)-Mz,f] gamma_dot`. No such input is present in the counterexample. No missing steering/support port was found that reverses its constant-steer kinetic-power result.

## Independent distributed-stress calculation

Use the exact Mission 15 construction with epsilon=0.005 m/s, omega=0.3 rad/s, gamma=pi/36, Md=0, Table 1 and g=9.81:

```text
sigma=d omega+epsilon
v=l omega cot(gamma)+epsilon(cos(gamma)-1)/sin(gamma)
Omega_r=v/r
Omega_f=[v cos(gamma)+(sigma+q omega)sin(gamma)]/r.
```

Both wheel-frame Vy=epsilon, both Sx=0, Sy=-epsilon/(r Omega). Fz,r=5689.8 N, Fz,f=8044.2 N. For each axle compute lambda from (16), e=a-lambda. Instead of evaluating closed Eq.(20), integrate published B13/B23/B31 stresses:

```text
fy,adh(x)=ky Sy(a-x),                 e<=x<=a
fy,slide(x)=-mu [3Fz/(4a)](1-x²/a²), -a<=x<=e
Fy=integral fy dx; Mz=integral x fy dx
P=integral fy(x)[epsilon+omega x] dx.
```

At 70-digit mpmath precision:

|Axle|Fy N|Mz Nm|Force power W|Moment power W|Net W|
|---|---:|---:|---:|---:|---:|
|Rear|-23.2836909065614901|0.772981436992145|-0.116418454532807|0.231894431097643|0.115475976564836|
|Front|-23.2077977339273470|0.771386607826321|-0.116038988669637|0.231415982347896|0.115376993678260|

Total **+0.23085297024309563249353739136327937 W**, agreeing with fresh JS output +0.2308529702430956 W. This falsifies the universal **instantaneous nonpositive mechanical contact-power** claim for the reduced equations. It does not show continuous energy growth on its uncontrolled trajectories.

Force-only work is still nonpositive: with h=|r Omega|, S=(Sx,Sy), Pforce=-h(Fx Sx+Fy Sy), with nonnegative quadratic/slide contributions. Near pure lateral rolling, Fy≈2a²ky Sy and Mz≈-(2/3)a³ky Sy. For positive omega and sufficiently small positive epsilon the moment work is first order in epsilon while force dissipation is second order. The counterexample is an open asymptotic family, not one floating-point anomaly.

## Physical meaning: narrower than “real tires create energy”

Source B5→B6 p.42 removes contact-frame spin omega_z and transient deformation; the resulting moment is then used in a yawing vehicle. At the counterexample `a|omega|/hypot(Vx-r Omega,Vy)=6` on both axles. The neglected spin-induced velocity across the patch is larger than the small translational slip. Although omega/Omega is only ~1%, that is not the relevant small parameter for the lateral contact approximation. The example is inside the declared five-state experiment domain, but not a controlled small-error test of the local-spin-neglect assumption. The source provides no quantitative spin-accuracy cutoff.

The material point stress field above can perform positive rigid-body moment work because it was calculated with the spin contribution to local slip omitted. This identifies a declared-approximation mismatch, not an implementation sign mistake. More complete pneumatic-tire contact can exchange stored elastic energy and advective flux; positive instantaneous mechanical power alone is not a general thermodynamic passivity test.

To challenge the earlier “no reservoir” interpretation, derive an **elastic-strain proxy** from the same source springs, rather than inventing a compensating state. At pure lateral slip,

`U=sum_i [ky Sy_i² lambda_i³/6 + integral_-a^(a-lambda_i) fy,slide(x)²/(2ky) dx]`.

It has units J and follows from strain energy of distributed linear bristles. Fresh high-precision directional differentiation along the source RHS at the counterexample gives U≈0.001801478619315682 J, U_dot≈-1.875227806512839 W, so E0_dot+U_dot≈-1.644374836269743 W. Longitudinal strain contributes zero to this first derivative at Sx=0. These are **DERIVED pointwise diagnostics**, not a new storage state, force law or modification of the reference.

This shows that the single kinetic-power counterexample does **not** exclude a physically permissible instantaneous elastic-release interpretation of the underlying brush. Conversely, this proxy does not prove passivity of the source reduction: it is an algebraic steady deformation field, omits a full time-dependent storage/transport balance, and has not been shown to satisfy a global supply inequality for all admissible inputs. Simply adding it to the ledger would change the claimed mechanical interpretation without establishing closure. No full-model passivity theorem is obtained in this audit.

Consequently, distinguish: (1) equation reproduction REPRODUCED; (2) mechanical kinetic-power accounting REPRODUCED; (3) universal nonpositive reduced contact power DISPROVED; (4) thermodynamic passivity with complete tire storage/transport UNRESOLVED; (5) realism of actual pneumatic tires NOT ESTABLISHED. Prior Missions 15–16's broader shorthand “global passivity failure” must be read with this distinction; their historical records are not rewritten.

## Practical significance: fixed, narrow sample

No new driving family or parameters. Load/input/state checks use the unchanged reference. For each refined equilibrium, evaluate all 32 sign corners `x*+s h`, h=[0.01,0.01,0.001,0.01,0.01], s_i independently +/-1, at amplitude scales 1 and 0.5. That is **128 static samples**, none excluded. Scale reduction is radius sensitivity, not proof of dense state-space coverage. Separately evaluate every accepted endpoint on all 11 existing trajectories/family at 400 and 800 Hz; these are correlated temporal observations, not independent statistical draws. Positive threshold 1e-8 W distinguishes rounding, vastly smaller than the observed negative margins.

|Sample|Count|Positive net contact|Total contact range W|Force-power range W|Moment-power range W|
|---|---:|---:|---:|---:|---:|
|Cornering corners, half amplitude|32|0|-10155.199 to -10045.345|-10129.024 to -10019.150|-26.285 to -26.085|
|Cornering corners, full amplitude|32|0|-10210.617 to -9990.916|-10184.454 to -9964.714|-26.383 to -25.983|
|Drifting corners, half amplitude|32|0|-29839.522 to -29712.963|-29826.225 to -29699.495|-13.468 to -13.297|
|Drifting corners, full amplitude|32|0|-29902.876 to -29649.760|-29889.665 to -29636.207|-13.553 to -13.212|
|Cornering trajectories, 400 Hz|10011|0|-10200.965 to -9999.534|-10174.848 to -9973.283|-26.275 to -26.095|
|Cornering trajectories, 800 Hz|20011|0|same to shown precision|same to shown precision|same to shown precision|
|Drifting trajectories, 400 Hz|1411|0|-29876.740 to -29675.724|-29863.434 to -29662.266|-13.492 to -13.273|
|Drifting trajectories, 800 Hz|2811|0|same to shown precision|same to shown precision|same to shown precision|

Maximum observed positive net power is 0 W in these samples; all 44 family/rate trajectories have zero positive sampled endpoints. Cornering stays adhesion/adhesion, yaw 0.289406–0.291406 rad/s; drifting sliding/adhesion, yaw approximately -0.387766 to -0.385687. Maximum axle slip magnitude ranges ~0.125–0.1265 and ~0.3275–0.3294 respectively. Neglected-spin/slip ratio stays <=0.02252 for static cornering and <=0.01588 for static drifting; temporal limits are similar. Moment work is negative and small relative to the several-kilowatt force losses here. Doubling temporal resolution did not reveal positive endpoints. No continuous-time sign guarantee or global prevalence estimate follows.

The practical energy-gain concern is **not observed in the authorized neighborhoods**. Low-slip yawing, steering feedback, standstill and extension beyond these neighborhoods remain unresolved. Retaining the model as a research reference is justified; adopting it as the definitive four-wheel/manual-drivetrain tire foundation is not yet justified. That conclusion does not require asserting a large or frequent defect in ordinary drift.

### Reconstructing the bounded diagnostic without a model change

The temporary Node diagnostic imports only `derivative`/`checkDomain` from the clean snapshot. For each scale/family it enumerates integer masks 0–31, with component i incremented by `scale*h[i]*((mask>>i&1)?1:-1)`. Reject through `checkDomain`, then accumulate `sum(d.force)`, `sum(d.moment)`, `d.contact`, maximum axle B, and maximum `a*abs(omega)/hypot(Vx-r*Omega,Vy)`. For temporal sampling, decompress `results/rk4-traces.json.gz`, select exactly hz=400/800 and the two family prefixes, and evaluate each row's state columns 1–5 with the family's constant gamma/Md. Count positive contact only above 1e-8 W; report branch pairs, sample count, min/max and positive fraction separately. No roots, coefficients, events or trajectory horizons are changed. “Maximum positive power 0” means max(P,0)=0 across an entirely negative sample, not an observed zero-power state.
