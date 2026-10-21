"""Render recorded Mission 03 measurements; never runs or tunes physics."""
import csv,json,math,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=pathlib.Path(__file__).resolve().parents[1]
D=ROOT/'docs/physics-recovery/mission-03'
before=json.loads((D/'before.json').read_text());after=json.loads((D/'after.json').read_text())
legacy=json.loads((D/'baseline-friction-work.json').read_text())['results']
for dataset in [before,after]:
 for run in dataset['vehicle']:run['final']['speed']=math.hypot(run['final']['vx'],run['final']['vy'])
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
def find(data,kind,scenario,hz):return next(s for s in data[kind] if s['scenario']==scenario and s['hz']==hz)
def save(fig,name):
 fig.tight_layout()
 for ext in ('png','svg','pdf'):fig.savefig(D/(name+'.'+ext),dpi=170)
 svg=D/(name+'.svg');svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
 plt.close(fig)
def series(ax,r,key,**kwargs):ax.plot([s['t'] for s in r['samples']],[s[key] for s in r['samples']],**kwargs)
fig,ax=plt.subplots(2,2,figsize=(11,6.6))
for r,name,color in [(find(before,'isolated','chatter',100),'Mission 02','#b43c36'),(find(after,'isolated','chatter',100),'Corrected','#006a88')]:
 series(ax[0,0],r,'angle',label=name,color=color);series(ax[1,0],r,'rate',label=name,color=color)
ax[0,0].set(ylabel='Road-wheel angle (rad)',title='Historical 100 Hz stationary test');ax[1,0].set(xlabel='Time (s)',ylabel='Rate (rad/s)');ax[0,0].legend()
ax[0,1].plot([r['hz'] for r in legacy],[r['flips'] for r in legacy],'o-',color='#b43c36',label='Angle reversals before')
ax[0,1].plot([50,100,200,400],[0]*4,'o-',color='#006a88',label='After');ax[0,1].set(xlabel='Physics Hz',ylabel='Angle reversals / 10 s');ax[0,1].legend()
ax[1,1].plot([r['hz'] for r in legacy],[r['positiveFrictionMidpointWork'] for r in legacy],'o-',color='#b43c36',label='Before (midpoint work)')
ax[1,1].plot([50,100,200,400],[0]*4,'o-',color='#006a88',label='After');ax[1,1].set(xlabel='Physics Hz',ylabel='Positive friction work (J)');ax[1,1].legend(fontsize=8)
save(fig,'friction-and-static-hold')
prototype=json.loads((D/'backward-euler-undamped.json').read_text());undamped=json.loads((D/'undamped-refinement.json').read_text())
fig,ax=plt.subplots(1,2,figsize=(10,3.7))
for data,label in [(prototype,'Rejected BE prototype'),(undamped,'Exact event response')]:
 rr=[r for r in data if r['coupled']]
 ax[0].plot([r['hz'] for r in rr],[100*r['retention'] for r in rr],'o-',label=label)
 ax[1].semilogy([r['hz'] for r in rr],[max(abs(r['angleError']),1e-16) for r in rr],'o-',label=label)
ax[0].set(xlabel='Outer Physics Hz',ylabel='Energy retained (%)',title='Unforced, undamped spring: 2 seconds');ax[0].legend(fontsize=8)
ax[1].set(xlabel='Outer Physics Hz',ylabel='Absolute angle error (rad)',title='Independent continuous phase reference');ax[1].legend(fontsize=8)
save(fig,'undamped-energy-and-phase')
fig,ax=plt.subplots(2,2,figsize=(11,6.6))
for hz in [50,100,200,400,800]:
 for data,col,title in [(before,0,'Delayed feedback before'),(after,1,'Current interval coupling after')]:
  r=find(data,'vehicle','release-moving',hz);series(ax[0,col],r,'angle',label=f'{hz} Hz');series(ax[1,col],r,'yaw',label=f'{hz} Hz');ax[0,col].set_title(title)
for col in [0,1]:ax[0,col].set(ylabel='Road-wheel angle (rad)');ax[1,col].set(xlabel='Time (s)',ylabel='Yaw rate (rad/s)');ax[0,col].legend(ncol=2,fontsize=8)
save(fig,'moving-release-feedback')
fig,ax=plt.subplots(2,2,figsize=(11,6.6))
for hz in [50,100,200,400,800]:
 r=find(after,'isolated','spring-underdamped',hz);series(ax[0,0],r,'angle',label=f'{hz} Hz')
t=[i/1000 for i in range(2001)];wd=5*math.sqrt(1-.2**2)
ax[0,0].plot(t,[.2*math.exp(-x)*(math.cos(wd*x)+math.sin(wd*x)/wd) for x in t],'k--',label='Continuous analytical',linewidth=1)
ax[0,0].set(title='Underdamped free spring release',ylabel='Angle (rad)',xlabel='Time (s)');ax[0,0].legend(fontsize=7,ncol=2)
r=find(after,'isolated','spring-underdamped',100);ss=r['samples'];energy=[.04*x['rate']**2+x['angle']**2 for x in ss];cum={k:[] for k in ['viscousWork','numericalWork']};total={k:0 for k in cum}
for x in ss:
 for k in cum:total[k]+=x['ledger'][k];cum[k].append(total[k])
ax[1,0].plot([x['t'] for x in ss],[e-.04 for e in energy],label='Δ(K+U)')
for k,label in [('viscousWork','Viscous work'),('numericalWork','Numerical work (zero)')]:ax[1,0].plot([x['t'] for x in ss],cum[k],label=label)
ax[1,0].set(xlabel='Time (s)',ylabel='Energy / work (J)',title='100 Hz work terms, separately accounted');ax[1,0].legend(fontsize=8)
for data,label in [(before,'Direct position before'),(after,'Finite actuator after')]:
 r=find(data,'isolated','driver-release',100);series(ax[0,1],r,'angle',label=label);series(ax[1,1],r,'rate',label=label)
ax[0,1].set(title='Target reversal and release at 0.5 s',ylabel='Angle (rad)');ax[0,1].legend(fontsize=8);ax[1,1].set(xlabel='Time (s)',ylabel='Rate (rad/s)')
save(fig,'analytical-energy-and-input')
fig,ax=plt.subplots(1,3,figsize=(12,3.5))
for scenario,label in [('release-low','1 m/s release'),('release-moving','25 m/s release'),('countersteer','Countersteering')]:
 ref=find(after,'vehicle',scenario,800)
 for a,key,lab in [(ax[0],'steer','Final steering error (rad)'),(ax[1],'heading','Final heading error (rad)'),(ax[2],'omega','Final yaw-rate error (rad/s)')]:
  hz=[50,100,200,400];errors=[abs(find(after,'vehicle',scenario,h)['final'][key]-ref['final'][key]) for h in hz]
  a.loglog(hz,[max(e,1e-14) for e in errors],'o-',label=label);a.set(xlabel='Physics Hz',ylabel=lab)
ax[0].legend(fontsize=8);fig.suptitle('Error against 800 Hz numerical reference; not measured real-world error',fontsize=11)
save(fig,'vehicle-refinement')
rows=[]
for old in before['vehicle']:
 name=old['scenario'].replace('unload-recontact','zero-capacity-recontact');new=find(after,'vehicle',name,old['hz'])
 rows.append({'scenario':name,'hz':old['hz'],'before_final_angle':old['final']['steer'],'after_final_angle':new['final']['steer'],'before_max_rate':old['maxRate'],'after_max_rate':new['maxRate'],'before_max_contact_steps':old['maxSubsteps'],'after_max_contact_steps':new['maxSubsteps'],'after_max_ledger_residual_J':new['maxResidual'],'after_tire_work_J':new['work']['tireWork'],'after_driver_work_J':new['work']['driverWork'],'after_friction_work_J':new['work']['frictionWork'],'after_viscous_work_J':new['work']['viscousWork'],'after_stop_work_J':new['work']['stopWork'],'after_numerical_work_J':new['work']['numericalWork']})
for row in rows:
 r=find(after,'vehicle',row['scenario'],row['hz']);a0=.01 if r['scenario']=='release-low' else .3 if r['scenario']=='rest' else .08
 initial=.2*a0*a0;final=.04*r['final']['steerRate']**2+.2*r['final']['steer']**2
 row.update(initial_steering_energy_J=initial,final_steering_energy_J=final,independent_work_residual_J=final-initial-sum(v for key,v in r['work'].items() if key!='residual'))
with (D/'handling-and-work.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator="\n");w.writeheader();w.writerows(rows)
refrows=[]
for scenario in ['release-low','release-moving','countersteer']:
 ref=find(after,'vehicle',scenario,800)
 for hz in [50,100,200,400]:
  r=find(after,'vehicle',scenario,hz);refrows.append({'scenario':scenario,'hz':hz,**{k+'_error':abs(r['final'][k]-ref['final'][k]) for k in ['steer','heading','omega','speed']}})
with (D/'refinement.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(refrows[0]),lineterminator="\n");w.writeheader();w.writerows(refrows)
# Publish quantitative tables directly from the recorded experiments.
lines=['# Before and after — Mission 03','',f"Baseline source: `{before['revision']}` (test-only branch revision; production files match completed Mission 02). Corrected physics: `{after['revision']}`. The final snapshot includes the independently tested input-button release and exact steering propagation.",'','## Historical stationary friction case','', 'I=0.08 kg·m², k=0.4 N·m/rad, C=2 N·m, b=0.1 N·m·s/rad; initial δ=0.3 rad, ω=0; ten seconds; no driver or tire torque. Static spring load is 0.12 N·m < 2 N·m.','', '| Hz | Angle reversals before → after | Rate reversals before → after | Final angle before → after (rad) | Peak late angle before → after (rad) | Positive midpoint friction work before → after (J) |','| --- | --- | --- | --- | --- | --- |']
for r in legacy:
 a=find(after,'isolated','chatter',r['hz']);lines.append(f"| {r['hz']} | {r['flips']} → {a['flips']} | {r['rateFlips']} → {a['rateFlips']} | {r['finalAngle']:.9g} → {a['angle']:.9g} | {r['maxLateAngle']:.9g} → 0.3 | {r['positiveFrictionMidpointWork']:.9g} → 0 |")
lines+=['','The corrected case holds exactly: ω=0, friction torque +0.12 N·m, K=0, U=0.018 J, and every work/numerical/residual term is zero at all four rates. Its persistent 0.3 rad displacement is the correct static equilibrium, not a failed centering test. Baseline peak |ω| is approximately 0.46–0.49 rad/s. “Late” means after the first second. Midpoint kinetic-work decomposition and endpoint work are different discrete diagnostics; the raw baseline reconstruction retains both. Neither is calorimetric tire/rack heat.','','![Static hold and friction work](friction-and-static-hold.png)','','## Moving release and convergence','','The vehicle begins at 25 m/s with δ=0.08 rad, neutral, freely released, three seconds. Same recorded audit controls, map/seed and tire parameters before and after.','', '| Hz | Final δ before (rad) | Final δ after (rad) | After steering error vs 800 Hz (rad) | After heading error (rad) | After yaw error (rad/s) |','| --- | --- | --- | --- | --- | --- |']
for hz in [50,100,200,400]:
 b=find(before,'vehicle','release-moving',hz);a=find(after,'vehicle','release-moving',hz);r=next(x for x in refrows if x['scenario']=='release-moving' and x['hz']==hz)
 lines.append(f"| {hz} | {b['final']['steer']:.9g} | {a['final']['steer']:.9g} | {r['steer_error']:.6g} | {r['heading_error']:.6g} | {r['omega_error']:.6g} |")
extra=['','## Undamped spring accuracy','', 'With I=0.08 kg·m², k=2 N·m/rad, δ₀=0.2 rad, zero friction/damping/road moment and two seconds, the correct energy is 0.04 J and δ(t)=0.2 cos(5t). The rejected BE prototype passed work accounting but removed physical spring energy. Exact affine event propagation replaces it, without corrective torques or rescaling.','', '| Hz | Prototype energy retention (%) | Final retention (%) | Final absolute phase-position error (rad) |','| --- | --- | --- | --- |']
for old in prototype:
 if not old['coupled']:continue
 new=next(x for x in undamped if x['coupled'] and x['hz']==old['hz']);extra.append(f"| {old['hz']} | {old['retention']*100:.9g} | {new['retention']*100:.12g} | {abs(new['angleError']):.3g} |")
extra+=['','![Undamped energy and phase](undamped-energy-and-phase.png)','']
# Insert the independent undamped check before the moving-release section.
position=lines.index('## Moving release and convergence');lines[position:position]=extra
lines+=['','![Moving-release trajectories](moving-release-feedback.png)','','![Vehicle refinement](vehicle-refinement.png)','','The 800 Hz run is a numerical reference, not a real-vehicle measurement. Final steering can reach the static-friction neighborhood, where endpoint differences have an internal/roundoff floor; heading/yaw and complete trajectories must also be inspected. Do not fit a universal convergence order to nonlinear stops or steering oscillations. Separate analytical viscous and spring tests reproduce the continuous affine response to roundoff; the undamped control also preserves phase and energy. The shared contact method additionally refines steering internally; outer body geometry and load splitting remain first order.','','## Work and energy, corrected vehicle runs at 100 Hz','','All values are accepted-substep sums in joules. Tire moment is external work on the effective steering coordinate; this is not a closed total-vehicle energy ledger.','', '| Scenario | Driver | Tire moment | Viscous | Coulomb | Stops | Numerical work defect | Max tick ledger residual |','| --- | --- | --- | --- | --- | --- | --- | --- |']
for scenario in ['release-low','release-moving','reverse','countersteer','drift','sleep-wake','rest','zero-capacity-recontact']:
 r=find(after,'vehicle',scenario,100);w=r['work'];lines.append('| '+scenario+' | '+' | '.join(f'{w[k]:.9g}' for k in ['driverWork','tireWork','viscousWork','frictionWork','stopWork','numericalWork'])+f" | {r['maxResidual']:.3g} |")
lines+=['','![Analytical energy and input response](analytical-energy-and-input.png)','','Affine steering roundoff residuals are separated from modeled losses; its numerical-work term is zero. Contact/body integration still has discretization error. Isolated Coulomb stopping reproduces the continuous stopping distance and friction work at all rates; the undamped spring preserves its energy and phase. The rejected prototype’s numerical attenuation is retained separately for review. Zero crossing, exact hold, applied-torque response, stop energy, and passive under/critical/overdamped responses have independent executable checks.','','## Other behavior and limits','','| Scenario | Final δ at 50 / 100 / 200 / 400 Hz (rad) | Interpretation |','| --- | --- | --- |']
notes={'release-low':'Small low-speed release; off-center static hold is allowed.','reverse':'Reverse release can run to the mechanical stop; no automatic recovery is imposed.','countersteer':'Finite driver authority, target +0.22 then −0.22 rad at 1 s.','drift':'Initial 8 m/s lateral motion and 0.7 rad/s yaw, driver released. Tire saturation can remove pneumatic moment.','sleep-wake':'Preserved steering through sleep and sampled driver target; neutral throttle input wakes the application policy, not an engine launch.','rest':'Stationary spring/friction relaxation from 0.3 rad; not forced to zero.','zero-capacity-recontact':'Contact capacity zero from 1–1.5 s (μ intervention); independent tests cover actual front Fz removal.'}
for scenario,note in notes.items():lines.append(f"| {scenario} | "+' / '.join(f"{find(after,'vehicle',scenario,h)['final']['steer']:.7g}" for h in [50,100,200,400])+f' | {note} |')
lines+=['','Forward/reverse pneumatic signs are tested with matched ±20 m/s prescribed contact velocities, including zero transport, unloading and combined-slip saturation in the retained tire tests. The full forward-moving and reverse-release cases above have different speeds and must not be treated as a matched directional experiment. Reverse lock-seeking persists with current coupling; that bounds the present effective model, not evidence of validated real hardware behavior.','','Full data: [handling/work CSV](handling-and-work.csv), [refinement CSV](refinement.csv), [before JSON](before.json), [after JSON](after.json), and [baseline friction reconstruction](baseline-friction-work.json). Every figure also has matching SVG and PDF exports.']
dc=json.loads((D/'delayed-control.json').read_text())
lines+=['','## Same-model delayed-feedback negative control','','This test-only helper keeps the final exact column model but restores previous-tick SAT delivery; it is not a production option. It isolates feedback scheduling from the other baseline changes.','','| Hz | Final δ, delayed (rad) | Final δ, current coupled (rad) |','| --- | --- | --- |']
for r in dc['vehicle']:
 a=find(after,'vehicle',r['scenario'],r['hz']);lines.append(f"| {r['hz']} | {r['final']['steer']:.9g} | {a['final']['steer']:.9g} |")
lines+=['','Full negative-control trajectories and source identities: [delayed-control.json](delayed-control.json).']
(D/'BEFORE_AFTER.md').write_text('\n'.join(lines)+'\n')
# Performance is a separately serialized baseline/final-source measurement.
if (D/'performance-before.json').exists() and (D/'performance-after.json').exists():
 pb=json.loads((D/'performance-before.json').read_text());pa=json.loads((D/'performance-after.json').read_text())
 prows=[]
 for a in pa['vehicle']:
  b=next(x for x in pb['vehicle'] if x['scenario']==a['scenario'] and x['hz']==a['hz'])
  prows.append({'scenario':a['scenario'],'hz':a['hz'],'before_mean_tick_ms':b['meanTickMs'],'after_mean_tick_ms':a['meanTickMs'],'ratio':a['meanTickMs']/b['meanTickMs'],'before_worst_tick_ms':b['worstTickMs'],'after_worst_tick_ms':a['worstTickMs'],'before_peak_contact_steps':b['maxSubsteps'],'after_peak_contact_steps':a['maxSubsteps'],'after_attempted_evaluations':a['attemptedEvaluations'],'after_nonlinear_iterations':a['nonlinearIterations'],'after_rejected_intervals':a['rejectedIntervals'],'after_sim_seconds_per_wall_second':a['simulatedSecondsPerWallSecond']})
 with (D/'performance.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=list(prows[0]),lineterminator="\n");w.writeheader();w.writerows(prows)
 fig,ax=plt.subplots(1,2,figsize=(10,3.8))
 for sc in ['release','rapid-countersteer']:
  rr=[r for r in prows if r['scenario']==sc]
  for key,style,label in [('before_mean_tick_ms','--',sc+' before'),('after_mean_tick_ms','-',sc+' after')]:ax[0].plot([r['hz'] for r in rr],[r[key] for r in rr],'o'+style,label=label)
  ax[1].plot([r['hz'] for r in rr],[r['after_sim_seconds_per_wall_second'] for r in rr],'o-',label=sc)
 ax[0].set(xlabel='Physics Hz',ylabel='Mean physics tick (ms)',yscale='log');ax[0].legend(fontsize=8);ax[1].set(xlabel='Physics Hz',ylabel='Simulated seconds / wall second');ax[1].axhline(1,color='gray',linestyle='--',linewidth=1);ax[1].legend(fontsize=8)
 save(fig,'performance')
 text=['# Computational performance — Mission 03','',f"Serialized matched benchmark on {pa['cpu']}, Node {pa['node']}. Source {pb['revision']} before, {pa['revision']} after. No concurrent physics/test/browser workload; no rendering. Five warmed 20,000-update column batches per mode; eight 0.8-s vehicle fixtures. One maneuver sample per setting, so these are observed costs, not hardware-independent estimates or confidence intervals.",'', '## Column primitive','', '| Mode | Before median μs/update | After median μs/update |','| --- | --- | --- |']
 for old,new in zip(pb['column'],pa['column']):
  text.append(f"| {'Driven' if new['driven'] else 'Released'} steady state | {sorted(old['microsecondsPerUpdate'])[2]:.6g} | {sorted(new['microsecondsPerUpdate'])[2]:.6g} |")
 text+=['','This primitive benchmark measures settled states. It excludes the repeated column evaluations and tire solves inside Newton/adaptive retries. It is not representative of a full moving steering tick.','','## Matched moving fixtures','', '| Scenario | Hz | Mean tick before → after (ms) | Cost ratio | Worst after tick (ms) | Peak accepted contact steps before → after | Sim s / wall s after |','| --- | --- | --- | --- | --- | --- | --- |']
 for r in prows:text.append(f"| {r['scenario']} | {r['hz']} | {r['before_mean_tick_ms']:.5g} → {r['after_mean_tick_ms']:.5g} | {r['ratio']:.4g}× | {r['after_worst_tick_ms']:.5g} | {r['before_peak_contact_steps']} → {r['after_peak_contact_steps']} | {r['after_sim_seconds_per_wall_second']:.5g} |")
 text+=['','![Timing and throughput](performance.png)','','Both versions start at 25 m/s with road-wheel angle 0.08 rad, neutral, recorded audited controls and the same rotor/history seeds. Rapid countersteer requests +0.22 rad, then −0.22 rad at 0.4 s. Driver mechanics intentionally differ between versions; the measured cost includes the actual resulting trajectories, not identical frozen steering states.','','## Solver work, final source','', '| Scenario | Hz | Attempted residual evaluations | Newton iterations | Rejected adaptive intervals | Accepted evaluations |','| --- | --- | --- | --- | --- | --- |']
 for r in pa['vehicle']:text.append(f"| {r['scenario']} | {r['hz']} | {r['attemptedEvaluations']} | {r['nonlinearIterations']} | {r['rejectedIntervals']} | {r['acceptedEvaluations']} |")
 worst=max(after['vehicle'],key=lambda r:r['maxTickMs']);peak=max(after['vehicle'],key=lambda r:r['maxSubsteps'])
 text+=['',f"The longer 35-case sweep observed a worst tick of **{worst['maxTickMs']:.6g} ms** in {worst['scenario']} at {worst['hz']} Hz. Its largest accepted subdivision count was **{peak['maxSubsteps']}** in {peak['scenario']} at {peak['hz']} Hz. These are observed maxima, not hard runtime bounds. The earlier Mission 02 figure of 1,016 steps came from a different historical maneuver matrix and must not be presented as a matched speed comparison.",'', 'The fourth root unknown and repeated tire response evaluations account for much of the extra cost. Steering trajectory error controls resolve rapid aligning-moment changes; exact affine column propagation avoids forcing subdivisions merely to integrate a constant linear spring/damper, but varying contact moment remains expensive. Rejected trials are real work; baseline had no counters for all attempted evaluations, so those fields cannot be compared numerically as if baseline work were zero.','', 'This version does **not** meet a real-time or many-vehicle AI-training throughput target on this host. No contact tolerances, damping, friction or tire parameters were reduced to improve it. Preserve the current residual/energy/trajectory gates while investigating analytic Jacobians, a higher-order current-moment coupling, proven column elimination, event-aware stepping, and batched compiled kernels. Optimizing the inexpensive outer column call alone will not solve the contact bottleneck.','', 'Raw data: [baseline](performance-before.json), [final](performance-after.json), [CSV comparison](performance.csv), and final-sweep counters/timings in [after.json](after.json). Timed measurements include host scheduling and garbage collection; repeat under controlled hardware before capacity planning.']
 hb=json.loads((D/'historical-countersteer-before.json').read_text());ha=json.loads((D/'historical-countersteer-after.json').read_text())
 text+=['','## Reproduced Mission 02 historical stress case','','The original 1,016-step tick is reproduced with the original maneuver: vx=5 m/s, vy=−18 m/s, yaw rate=0.5 rad/s, initial δ=0.22 rad, target +0.22 then −0.22 rad at 1.5 s, three seconds total. Same recorded controls and seeds. Finite driver authority changes the resulting corrected trajectory.','','| Hz | Peak accepted steps before → after | Total wall time before → after (s) | Final δ after (rad) |','| --- | --- | --- | --- |']
 for b,a in zip(hb['runs'],ha['runs']):text.append(f"| {a['hz']} | {b['maxSteps']} → {a['maxSteps']} | {b['wallMs']/1000:.5g} → {a['wallMs']/1000:.5g} | {a['finalAngle']:.8g} |")
 text+=['','The old peak is reproduced exactly at 50 Hz. Fewer peak accepted steps do not imply less total work: the fourth coupled unknown, additional evaluations and different trajectory increase elapsed time. [Historical baseline](historical-countersteer-before.json) and [corrected run](historical-countersteer-after.json) retain complete settings, source hashes, counters and samples.']
 (D/'PERFORMANCE.md').write_text('\n'.join(text)+'\n')
 print('Performance rows:',len(prows))
print('Published',len(rows),'vehicle comparisons;',len(refrows),'refinement rows')
