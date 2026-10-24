# Frozen reference operating domain

Source version and equations: [manifest](reference-experiment-manifest.md). This is an **engineering experiment envelope**, not a measured tire validity range. Preserve five states [v,sigma,omega,Omega_r,Omega_f], SI units, source forward/left/up coordinates, positive forward rotor motion and source radius r=0.3 m. No standstill, brake lock, reverse crossing, changing steering or driver controller is included.

## Three different restrictions

1. SOURCE-IMPOSED: Omega_i=0 makes Eq.(9)/(11)/(13) undefined; Fz<=0 invalidates Eq.(16) and supported-contact assumptions; Delta=mJ-p² must be positive. Both zero-slip components make beta undefined but have an exact removable force/moment limit. Neither a denominator floor nor a state clamp is supplied by the paper.
2. MODEL ASSUMPTIONS: planar three-body/no roll or pitch, low body COM, quasi-stationary line brush with local spin neglected in its derivation, constant radius/stiffness/friction; no calibrated high-speed, thermal or free-column validity. The positive-power counterexample means the model cannot be called globally contact-passive even inside these assumptions.
3. EXPERIMENT SAFEGUARDS (ASSUMED): the bounded state/input box below is selected for reproducible comparison of Table 2 examples and conditioning. It is not a physical limit of a real vehicle. Report results only in this box.

|Variable|Frozen allowed range, inclusive|Justification|
|---|---|---|
|v|5–25 m/s|Contains source cornering/drift seeds ~13.6–15 m/s; excludes stopping and unstudied high-speed extrapolation. Not a tire calibration bound.|
|sigma|-8 to +8 m/s|Contains source drift 4.02 m/s with perturbation margin; limits the tested lateral envelope, not friction.|
|omega|-2 to +2 rad/s|Contains source cornering/donut/drift; chosen tested yaw envelope, no yaw limiter.|
|Omega_r,Omega_f|20–200 rad/s|Minimum peripheral speed 6 m/s bounds slip denominators; source seeds ~46–55 rad/s remain well separated. Upper peripheral speed 60 m/s allows wheelspin without unbounded conditioning.|
|gamma|-15 to +15 degrees, constant per run|Source bifurcation examples use 5/10/15 degrees; no claim beyond that sampled range. Zero is allowed.|
|Md|-500 to +800 Nm, constant per run|Includes Table 2 and the energy counterexample; signed torque is not a new brake law.|
|sqrt(Sx²+Sy²), each axle|0–2|Declared combined-slip investigation envelope includes the source seed slips and both branches. Not a force clamp or a singularity threshold.|

Conditioning rationale for Omega_min: h_i=r Omega_i>=6 m/s, so direct slip numerator sensitivity has |dSy/dVy|<=1/6 s/m. Near rolling the frozen-chassis longitudinal decay scale is approximately 1600/v per second; at peripheral speed 6 m/s it is ~267/s. At candidate h=1/800 s, h*267≈0.333, versus classical RK4's ~2.785 negative-real-axis stability endpoint. This motivates the cutoff and finest candidate step, **not a proof** for the coupled nonlinear system. The looser 100 Hz point is intentionally a convergence/stability probe, not an assumed valid operating rate. Source/table coverage, a finite conditioning bound and substantial fine-step margin justify the engineering cutoff; do not describe 20 rad/s as a tire constant.

The state box ensures front wheel-frame Vx remains positive: Vxf=v cos(gamma)+(sigma+q omega)sin(gamma)>=5 cos(15°)-10 sin(15°)>2.24 m/s. Rear Vxr=v>=5. Slips can nevertheless grow through rotor mismatch; the extra slip-envelope check remains necessary.

## Loads and branches

SOURCE-EXACT Eq.(17), p.13:

`Fz,f=mw g+(mv g d-Md)/l`, `Fz,r=mw g+(mv g q+Md)/l`.

DERIVED strictly positive-support input interval with Table 1 and g=9.81:

`-14224.5 < Md < 20110.5 Nm`.

The narrower experimental torque interval yields Fz,f>=7724.2 N and Fz,r>=5489.8 N. Do not replace these equations by static loads or normalize negative loads to zero. Sum loads is mg=13734 N. m=1400 kg, p=-50 kg m, J=2830.54 kg m², Delta=3960256 kg² m².

For each tire let K=sqrt(kx² Sx²+ky² Sy²) and Kcrit=3mu0 Fz/(2a²). Adhesion uses K<Kcrit and 0<lambda<=2a. Total sliding uses K>=Kcrit; Eq.(20) gives saturated forces and zero moment. At equality both branch limits agree. Keep lambda's formula out of the saturated force branch; do not use negative adhesion length. Branch crossings are allowed within the declared slip box and are logged, not treated as errors by themselves.

At Sx=Sy=0 return Fx=Fy=Mz=0 exactly, lambda=2a. This is the DERIVED continuous limit of Eq.(20), not a finite dead zone. For nonzero slips compute t=4a³K/(3mu0Fz), lambda=2a-t, W=t²(a+lambda)/(4a³): algebraically source-equivalent and avoids subtracting nearly equal 2a/lambda to recover t. No user-chosen epsilon changes the law.

At Omega→0 and nonzero center velocity, the total-sliding force has a finite directional limit, but the source slips/derivatives are singular; at simultaneous zero motion the limit is path dependent. These facts do not authorize evaluating a stationary vehicle. The experiment terminates at Omega=20 rad/s, long before the singularity. Final VerletDrift must separately solve standstill, lock and reverse.

## Deterministic failure/reporting policy

Check initial configuration, every derivative-evaluation stage and every accepted endpoint. No stage may silently evaluate outside the box. For a violation, terminate that run with **OUT OF DOMAIN**, recording case/configuration hash, input, last valid state/time, trial stage/time, first failing field/bound and attempted step. Do not commit the invalid endpoint, clamp/reflect/reset values, drop time or switch constitutive models. If multiple violations occur, report all and choose the first by fixed manifest field order. This is a step-dependent detection bracket, not an exact continuous exit time; compare the bracket under refinement. An offline diagnostic may locate exit more finely but may not silently turn a failed run into a successful one.

Nonfinite values or contradictory formulas at a mathematically interior, finite state are **FAIL**, not automatically OUT OF DOMAIN. No new tolerance widens the domain to rescue a run. A positive full contact-power sample is logged under the known source-passivity defect, not relabeled a domain exit. Successful numerical reproduction must not hide that defect.
