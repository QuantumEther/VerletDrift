# Mission 15 — Aligning moments and complete energy accounting

## Finding

**The published analytic reduced model is not globally contact-passive, even with constant steering and zero drive.** The counterexample below lies inside the moving domain in [operating domain](reference-operating-domain.md). This is a negative analytical result, not a simulator result or a claim that every source trajectory gains energy. Preserve the aligning moments and report the limitation. The experiment is restricted to source reproduction, not certification of a passive physical foundation.

Source: attached Zhang–Takács–Orosz 51-page manuscript, SHA-256 `d90caa7ac9a70cb3b767c6475feb30b913989aa2bb64d921adbfbc182ac80479`; identical to Mission 14. Eq.(7),(8) p.9; Eq.(20) p.14; Appendix A pp.35–40; Appendix B pp.41–51. Appendix A uses **acceleration energy** for Appell's equations; it must not be mistaken for kinetic energy. The kinetic energy below is independently derived from its three rigid bodies and angular velocities A16/A22. SOURCE-EXACT facts and DERIVED results are distinguished explicitly.

## Kinetic energy and constant steering identity — DERIVED

Let R denote source radius r only in explanatory text; formulas otherwise use source notation. Body velocity is (v,sigma), rear center velocity (v,sigma-d omega), front center velocity (v,sigma+q omega), with front-frame rotation preserving magnitude. Sum body/axle translational and rotational energies:

```text
E = mv(v²+sigma²)/2 + JG omega²/2
  + mw[v²+(sigma-d omega)²]/2 + mw[v²+(sigma+q omega)²]/2
  + C omega²/2 + C(omega+gamma_dot)²/2
  + D(Omega_r²+Omega_f²)/2
  = E0 + C omega gamma_dot + C gamma_dot²/2
E0= m(v²+sigma²)/2 + p sigma omega + J omega²/2
   + D(Omega_r²+Omega_f²)/2.
```

Here m,p,J are source Eq.(8); p is kg m, not pressure. Delta=mJ-p²>0, so the lateral/yaw quadratic form is positive definite. G is body COM, not necessarily total-system COM. This is not the body-only energy used in a simpler bicycle model.

For constant gamma, multiply Eq.(7) by the gradients of E0:

```text
dE0/dt = m v v_dot + (m sigma+p omega) sigma_dot
        + (J omega+p sigma) omega_dot
        + D Omega_r Omega_r_dot+D Omega_f Omega_f_dot
        = Md Omega_r + Pforce_r + Pforce_f + omega(Mz,r+Mz,f),
Pforce_i=Fx,i(Vx,i-r Omega_i)+Fy,i Vy,i.
```

Coriolis/mass-coupling terms cancel; -r Fx Omega rotor work cancels the corresponding chassis contact term. No tire force is counted twice. This identity is independently checked by symbolic substitution; it is an accounting identity, not a sign theorem. With constant steering the actuator has zero angular work even if it must hold a nonzero reaction torque.

## Prescribed steering work — DERIVED, excluded from initial runs

For smooth steering set s=gamma_dot, t=gamma_ddot. Direct substitution yields

`E0_dot=Md Omega_r+sum(Pforce)+omega sum(Mz)-C omega t`.

Differentiating the extra kinetic terms gives

`E_dot=Md Omega_r+sum(Pforce)+omega sum(Mz)+C s(omega_dot+t)`.

The front axle yaw balance assigns steering actuator reaction `Tsteer=C(omega_dot+t)-Mz,f` in the prescribed-coordinate model. Thus the same identity reads

`E_dot=Md Omega_r+sum(Pforce)+Mz,r omega+Mz,f(omega+s)+Tsteer s`.

This exposes the front tire moment power and steering actuator work separately. It does not introduce a steering-column ODE or calibrated actuator. Gyroscopic/support reactions consistent with the source ideal constraints are not extra hidden power sources. Abrupt steering jumps have undefined/unbounded derivatives and cannot be entered as smooth source trajectories. Constant-steer runs have s=t=0 throughout; separate runs at different gamma are distinct initial-value problems, not one steering maneuver.

## Established force-only dissipation — DERIVED

For positive Omega, h=r Omega>0, c=(Vx-r Omega,Vy)=-h(Sx,Sy). Define B=sqrt(Sx²+Sy²), K=sqrt(kx² Sx²+ky² Sy²), lambda=2a-4a³K/(3mu0 Fz), W=(2a-lambda)²(a+lambda)/(4a³). In adhesion:

`Fx Sx+Fy Sy=lambda²(kx Sx²+ky Sy²)/2+W mu Fz B >=0`.

In total sliding it equals mu Fz B. Hence Pforce<=0 with positive stiffness/load and nonnegative friction. This also holds for nonzero negative Omega through the source's absolute denominator, but reverse is outside this experiment. Zero slip is the continuous zero-force/moment limit. No dynamic elastic storage state remains in the selected quasi-stationary law.

## Counterexample: full contact power can be positive

SOURCE-EXACT Eq.(20) at small pure lateral slip gives, to leading order,

`Fy=2a² ky Sy+O(Sy|Sy|)`, `Mz=-(2/3)a³ ky Sy+O(Sy|Sy|)`.

Construct a family with constant gamma>0, omega>0, Md=0, both wheel-frame lateral center velocities equal epsilon>0 and longitudinal slip zero:

```text
sigma=d omega+epsilon
v=l omega cot(gamma)+epsilon(cos(gamma)-1)/sin(gamma)
Omega_r=v/r
Omega_f=[v cos(gamma)+(sigma+q omega)sin(gamma)]/r.
```

These relations follow directly from source (10)–(13), not a modified tire law. Then Sy,i=-epsilon/Vx,i and

`Pcontact_i = (2a² ky/Vx,i)[(a omega/3)epsilon-epsilon²]+O(epsilon²)`

where the leading positive term is linear in epsilon and the leading force dissipation is quadratic. More precisely the moment correction is O(omega epsilon²); therefore for sufficiently small positive epsilon the exact contact power is positive. This is an existence proof, not a claim that the truncated expression determines the sign for every epsilon<a omega/3.

A finite check using exact Eq.(20), source Table 1, g=9.81, gamma=5 degrees, omega=0.3 rad/s, epsilon=0.005 m/s, Md=0:

```text
[v,sigma,omega,Omega_r,Omega_f]
=[8.5723209223564647401, 0.455, 0.3,
  28.574403074521549134, 28.685010796556446357]
Fz,r=5689.8 N; Fz,f=8044.2 N; Sx,r=Sx,f=0.
```

|Quantity|Rear|Front|
|---|---:|---:|
|Sy|-0.000583272610216923|-0.000581023545184353|
|lambda (m)|0.199696260827905|0.199785988507870|
|Fy (N)|-23.2836909065615|-23.2077977339273|
|Mz (Nm)|0.772981436992145|0.771386607826321|
|Pforce (W)|-0.116418454532807|-0.116038988669637|
|omega Mz (W)|0.231894431097643|0.231415982347896|
|Pcontact (W)|0.115475976564836|0.115376993678260|

Sum = **+0.230852970243096 W**. With Md=0 and constant gamma this is E_dot>0, not work supplied by steering or propulsion. Both rotors are positive, both loads positive, slips tiny, and both branches adhesive. Arbitrary precision (60 decimal digit arithmetic) was used for this static equation check; no trajectory, integrator, or simulator was implemented. The sign is far larger than numerical rounding. It cannot be excused as an RK4 error.

## Interpretation and bounded-domain statements

Appendix B p.42, B5→B6 sets local contact-frame spin omega_z=0 and neglects transient deformation. The resulting forces/moments are then used in a vehicle with omega_z=omega (constant steer). Near kinematic rolling, force dissipation tends to zero quadratically while the omitted-spin moment contribution can do positive work linearly. The anisotropic approximate sliding direction (pp.13,48–51) is another source limitation, but the counterexample is near adhesion: it cannot be attributed solely to large sliding-angle errors.

A spatially consistent bristle model would account for local spin/deformation/transport and associated work. That does not authorize adding those equations here. No hidden stored-energy reservoir is defined by the source's reduced ODE, so none is invented to make E_dot positive “physical.” This is a passivity failure of the selected reduced mechanical interpretation, not proof that friction at real contact creates energy or that every transient brush model must be memoryless/passive in that same sense.

For each adhesive branch write Fy=A_f+B_f with both terms having sign Sy. The moment/force ratios of the two terms are `(3a-2lambda)/3` and `-3lambda²/[4(a+lambda)]`; each has magnitude <=a for 0<=lambda<=2a. Thus **|Mz|<=a |Fy|**. Total sliding Mz=0. Consequently

`Pcontact <= -Dforce+a |omega| sum|Fy|`, where Dforce=-sum(Pforce)>=0.

The statewise condition `Dforce>=a |omega| sum|Fy|` is a sufficient passivity certificate, not an invariant domain proof. On the specified |omega|<=2 and positive supports, |Fy|<=mu0 Fz and sum Fz=mg=13734 N give `Pcontact<=2472.12 W`. This loose upper bound is not an acceptable error tolerance or a claim that every trajectory attains it. Log the actual signed moment and force work. Do not discard positive-power states to manufacture a global theorem.

## Decision consequence

Full contact passivity is **FAIL as a universal model property**; force-work dissipation and exact power identity remain established. A source-reproduction experiment is legitimate with a prominently recorded defect, retaining all source terms and treating physical accuracy as limited. It can verify equations, source equilibria and numerical convergence, not certify a passive drivetrain-ready physical core. Mission 14's unresolved moment-passivity question is superseded by this negative result. No damping, moment removal, parameter tuning, hidden energy or alternative source is introduced.
