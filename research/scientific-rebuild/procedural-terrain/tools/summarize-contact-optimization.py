"""Reproduce Mission 13 tables from raw saved data; no fitted model parameters."""
from pathlib import Path
import csv,gzip,json,statistics as st,random
root=Path(__file__).resolve().parents[1]/'results/contact-optimization'
def load(name):return json.loads(gzip.decompress((root/(name+'.json.gz')).read_bytes()))
def write(name,rows):
 with (root/name).open('w',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
def groups(runs):
 out={}
 for r in runs:
  if not r.get('warmup'):out.setdefault((r['scenario'],r['h'],r['floor'],r['id']),[]).append(r)
 return {k:sorted(v,key=lambda r:r['repeat']) for k,v in out.items()}
rng=random.Random(13)
def ratio(a,b,key=lambda r:r['cpuMs']/r['simulated']):
 assert len(a)==len(b)
 samples=[]
 for _ in range(3000):
  indices=[rng.randrange(len(a)) for _ in a];samples.append(st.median(key(b[i]) for i in indices)/st.median(key(a[i]) for i in indices))
 samples.sort();return st.median(map(key,b))/st.median(map(key,a)),samples[75],samples[2924]

bench=[];retention=[];improvement=[];profile_rows=[]
builds={name:load(name) for name in ['baseline-sweep','final-sweep']}
profiles={name:load(name) for name in ['reference-profile','final-profile']}
for name,data in profiles.items():
 for run in data['runs']:
  for e in run['detail']:
   profile_rows.append({'build':name,'scenario':run['scenario'],'h':run['h'],'floor':run['floor'],'id':run['id'],**{k:e.get(k,0) for k in ['stage','mode','count','ms','iterations','projectionMs','residualMs','gradientMs','projections','saturated','bracketSteps','reused','failed','maxResidual']}})
write('profiles.csv',profile_rows)
for build,data in builds.items():
 profile_data=profiles['reference-profile' if build=='baseline-sweep' else 'final-profile']['runs']
 for (scenario,h,floor,id),g in groups(data['runs']).items():
  p=next(r for r in profile_data if (r['scenario'],r['h'],r['floor'],r['id'])==(scenario,h,floor,id));calls=sum(e['count'] for e in p['detail'] if e['stage']=='optimization')
  detail=lambda name:sum(e['ms'] for e in p['detail'] if e['stage']==name)
  bench.append({'build':build,'scenario':scenario,'h':h,'floor':floor,'id':id,'measured_runs':len(g),'cpu_s_per_sim_s':st.median(r['cpuMs']/1000/r['simulated'] for r in g),'wall_s_per_sim_s':st.median(r['wallMs']/1000/r['simulated'] for r in g),'median_ms':st.median(r['medianMs'] for r in g),'p95_ms':st.median(r['p95Ms'] for r in g),'p99_ms':st.median(r['p99Ms'] for r in g),'worst_ms':max(r['worstMs'] for r in g),'inner_per_step':st.median(r['inner']/r['accepted'] for r in g),'outer_per_step':st.median(r['outer']/r['accepted'] for r in g),'macro_attempts':sum(r['attempts'] for r in g),'faults':sum(bool(r['fault']) for r in g),'finite':all(r['finite'] for r in g),'energy_max_J':max(r['energy'] for r in g),'constitutive_max_Ns':max(r['constitutive'] for r in g),'grip_excess_max_N':max(r['gripExcess'] for r in g),'calls_in_matched_profile':calls,'calls_per_step_in_matched_profile':calls/p['accepted'],'clutch_mode_retries_in_matched_profile':calls-p['outer'],'matrix_ms_profile':detail('matrix'),'optimization_ms_profile':detail('optimization'),'diagnostic_ms_profile':detail('constitutive'),'copy_ms_profile':p['stages']['trial-copy']['ms'],'endpoint_ms_profile':p['stages']['energy-and-endpoint']['ms']})
 grouped=groups(data['runs'])
 for (scenario,h,floor,id),a in grouped.items():
  if id!='reference':continue
  b=grouped[(scenario,h,floor,'speed-normalized-anisotropic')];point,lo,hi=ratio(a,b)
  retention.append({'build':build,'scenario':scenario,'h':h,'floor':floor,'cpu_B_over_A':point,'ci_low':lo,'ci_high':hi,'gate':'fail' if lo>1.1 else 'pass' if hi<=1.1 else 'inconclusive'})
write('benchmarks.csv',bench);write('retention.csv',retention)
old,new=(groups(builds[n]['runs']) for n in builds)
for key,a in old.items():
 b=new[key];point,lo,hi=ratio(a,b)
 improvement.append({'scenario':key[0],'h':key[1],'floor':key[2],'id':key[3],'cpu_after_over_before':point,'ci_low':lo,'ci_high':hi,'verdict':'improves' if hi<1 else 'regresses' if lo>1 else 'inconclusive','p95_after_over_before':st.median(r['p95Ms'] for r in b)/st.median(r['p95Ms'] for r in a),'p99_after_over_before':st.median(r['p99Ms'] for r in b)/st.median(r['p99Ms'] for r in a)})
write('before-after.csv',improvement)

candidates=[]
data=load('candidates')['runs']
for floor in [.25,.5]:
 for id in ['reference','speed-normalized-anisotropic']:
  a=sorted([r for r in data if r['floor']==floor and r['id']==id and r['variant']=='reference' and not r['warmup']],key=lambda r:r['repeat'])
  for variant in (['matrix'] if id=='reference' else ['diagnostic','warm','matrix','warm-matrix','all']):
   b=sorted([r for r in data if r['floor']==floor and r['id']==id and r['variant']==variant and not r['warmup']],key=lambda r:r['repeat']);point,lo,hi=ratio(a,b)
   candidates.append({'floor':floor,'id':id,'variant':variant,'cpu_ratio':point,'ci_low':lo,'ci_high':hi,'verdict':'improves' if hi<1 else 'regresses' if lo>1 else 'inconclusive','cpu_s_per_sim_s':st.median(r['cpuMs']/1000/r['simulated'] for r in b),'inner_per_step':st.median(r['iterations']/300 for r in b),'outer_per_step':st.median(r['outer']/300 for r in b),'p95_ratio':st.median(r['p95Ms'] for r in b)/st.median(r['p95Ms'] for r in a),'p99_ratio':st.median(r['p99Ms'] for r in b)/st.median(r['p99Ms'] for r in a)})
write('candidates.csv',candidates)

breakdown=[]
for build,data in profiles.items():
 for id in ['reference','speed-normalized-anisotropic']:
  g=[r for r in data['runs'] if r['id']==id];wall=sum(r['wallMs'] for r in g);vehicle=sum(e['ms'] for r in g for e in r['stages'].values());t=lambda names:sum(e['ms'] for r in g for e in r['detail'] if e['stage'] in names)
  T1=t(['inertia-free','rows','matrix','bound-warm','initial-impulse']);T2=t(['optimization','polish-reconstruction']);T3=t(['constitutive']);T4=sum(e['ms'] for r in g for k,e in r['stages'].items() if k!='unified-solve')+t(['contact-ledger'])
  observations=t(['tire-observations'])-T3;unified=sum(r['stages']['unified-solve']['ms'] for r in g);remaining=unified-T1-T2-T3-t(['contact-ledger'])-observations
  breakdown.append({'build':build,'id':id,'simulated_s':sum(r['simulated'] for r in g),'cpu_ms_instrumented':sum(r['cpuMs'] for r in g),'wall_ms_instrumented':wall,'T1_ms':T1,'T2_ms':T2,'T3_ms':T3,'T4_ms':T4,'other_tire_observation_ms':observations,'unified_unattributed_ms':remaining,'outside_candidate_marks_ms':wall-vehicle,'contact_calls':sum(e['count'] for r in g for e in r['detail'] if e['stage']=='optimization'),'inner_iterations':sum(r['inner'] for r in g),'outer_trials':sum(r['outer'] for r in g),'diagnostic_calls':sum(e['count'] for r in g for e in r['detail'] if e['stage']=='constitutive'),'saturated_calls':sum(e['saturated'] for r in g for e in r['detail'] if e['stage']=='constitutive'),'root_iterations':sum(e['iterations'] for r in g for e in r['detail'] if e['stage']=='constitutive')})
write('cost-breakdown.csv',breakdown)

summary={'candidates':candidates,'retentionCounts':{build:{v:sum(r['gate']==v for r in retention if r['build']==build) for v in ['pass','fail','inconclusive']} for build in builds},'faults':{build:sum(bool(r['fault']) for r in data['runs']) for build,data in builds.items()},'breakdown':breakdown,'numeric':{build:{'maxEnergy':max(r['energy'] for r in data['runs']),'maxConstitutive':max(r['constitutive'] for r in data['runs']),'maxGripExcess':max(r['gripExcess'] for r in data['runs'])} for build,data in builds.items()}}
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')

# Independent seeded analyses keep follow-up intervals reproducible.
rng=random.Random(13)
recovery=[]
for build in ['baseline-recovery','final-recovery']:
 grouped=groups(load(build)['runs'])
 for h in [.001,.002,.004]:
  a=grouped[('recovery',h,.5,'reference')];b=grouped[('recovery',h,.5,'speed-normalized-anisotropic')];point,lo,hi=ratio(a,b)
  recovery.append({'build':build,'h':h,'A_cpu_s_per_sim_s':st.median(r['cpuMs']/1000/r['simulated'] for r in a),'B_cpu_s_per_sim_s':st.median(r['cpuMs']/1000/r['simulated'] for r in b),'B_over_A':point,'ci_low':lo,'ci_high':hi,'A_inner_per_step':st.median(r['inner']/r['accepted'] for r in a),'B_inner_per_step':st.median(r['inner']/r['accepted'] for r in b),'A_outer_per_step':st.median(r['outer']/r['accepted'] for r in a),'B_outer_per_step':st.median(r['outer']/r['accepted'] for r in b)})
write('recovery.csv',recovery)
rng=random.Random(13)
tail=[]
for id in ['reference','speed-normalized-anisotropic']:
 runs=load('tail-probe')['runs'];a=sorted([r for r in runs if r['id']==id and r['variant']=='reference' and not r['warmup']],key=lambda r:r['repeat']);b=sorted([r for r in runs if r['id']==id and r['variant']=='selected' and not r['warmup']],key=lambda r:r['repeat'])
 for metric in ['cpuMs','p95Ms','p99Ms']:
  point,lo,hi=ratio(a,b,key=lambda r:r[metric]);tail.append({'id':id,'metric':metric,'ratio':point,'low':lo,'high':hi})
(root/'tail-summary.json').write_text(json.dumps(tail,indent=2)+'\n')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
controlled=load('controlled-conditioning')['cases'];fig,ax=plt.subplots(figsize=(7,4))
for variant in ['original','isotropic-compliance','zero-seed','preceding-mode-seed']:
 case=next(r for r in controlled if r['h']==.001 and r['floor']==.5 and r['mode']==1 and r['variant']==variant)
 ax.semilogy(range(1,len(case['history'])+1),case['history'],label=variant)
ax.axhline(1e-12,color='gray',linestyle=':');ax.set(xlabel='FISTA iteration',ylabel='Projected residual (solver impulse coordinates)',title='Captured B fixed-capacity recovery problem, h=1 ms, floor=0.5 m/s');ax.legend(fontsize=8);ax.grid(alpha=.2);fig.tight_layout();fig.savefig(root/'convergence.png',dpi=160);plt.close(fig)
print(json.dumps(summary,indent=2))
