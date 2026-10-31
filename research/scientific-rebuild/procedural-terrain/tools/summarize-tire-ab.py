"""Summarize saved Mission 12 measurements; no vehicle simulation or parameter fitting.
Run from procedural-terrain: python3 tools/summarize-tire-ab.py
Requires matplotlib only for the standalone curve figure.
"""
import csv
import gzip
import json
import random
import statistics as st
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'results/tire-strategy-ab'
def read(name):
    return json.loads(gzip.decompress((root / (name + '.json.gz')).read_bytes()))
def csvout(name, rows):
    with (root / name).open('w', newline='') as out:
        writer = csv.DictWriter(out, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
def percentile(values, p):
    return sorted(values)[round((len(values)-1)*p)]

curves = read('curves')['curves']
rows = []
for row in curves:
    for strategy in ['A','B']:
        rows.append({**{k:v for k,v in row.items() if k not in ['A','B']}, 'strategy':strategy, **row[strategy]})
csvout('curves.csv', rows)
overlap = []
for floor in [.25,.5,1,2]:
    for sx in [0,.2]:
        for angle in [.5,1,2]:
            group = [r for r in curves if r['floor']==floor and r['sx']==sx and r['angle']==angle and r['speed']>0]
            overlap.append({'floor':floor,'sx':sx,'angle':angle,**{s:(max(r[s]['fy'] for r in group)-min(r[s]['fy'] for r in group))/900 for s in ['A','B']}})
csvout('overlap.csv', overlap)

performance = read('performance')
perfrows = []
rng = random.Random(12)
for h in [.001,.002,.004]:
    for scenario in ['acceleration','steering','recovery']:
        groups = {s:sorted([r for r in performance['runs'] if r['h']==h and r['scenario']==scenario and r['id']==s and not r['warmup']],key=lambda r:r['repeat']) for s in ['reference','speed-normalized-anisotropic']}
        a,b = [groups[s] for s in groups]
        assert len(a)==len(b)==8 and not any(r['fault'] for r in a+b)
        cpu = lambda r:r['cpuMs']/1000/r['simulated']
        ratios = []
        for _ in range(3000):
            indices = [rng.randrange(len(a)) for _ in a]
            ratios.append(st.median(cpu(b[i]) for i in indices)/st.median(cpu(a[i]) for i in indices))
        lower,upper = percentile(ratios,.025),percentile(ratios,.975)
        row = {'h':h,'scenario':scenario,'pairs':len(a),'cpuRatio':st.median(map(cpu,b))/st.median(map(cpu,a)),'bootstrapLow':lower,'bootstrapHigh':upper,'retention':'fail' if lower>1.1 else 'pass' if upper<=1.1 else 'inconclusive'}
        for s,group in [('A',a),('B',b)]:
            row.update({s+'_cpu_s_per_sim_s':st.median(map(cpu,group)),s+'_wall_s_per_sim_s':st.median(r['wallMs']/1000/r['simulated'] for r in group),s+'_median_ms':st.median(r['medianMs'] for r in group),s+'_p95_ms':st.median(r['p95Ms'] for r in group),s+'_worst_ms':max(r['worstMs'] for r in group),s+'_outer_per_macro':st.median(r['outer']/r['acceptedSteps'] for r in group),s+'_inner_per_macro':st.median(r['inner']/r['acceptedSteps'] for r in group),s+'_attempts':sum(r['candidateAttempts'] for r in group),s+'_faults':sum(bool(r['fault']) for r in group)})
        perfrows.append(row)
csvout('performance-summary.csv',perfrows)

numerical=[]
for name in ['vehicle','cornering','drift']:
    dataset=read(name)
    for strategy in ['reference','speed-normalized-anisotropic']:
        group=[r for r in dataset['runs'] if r['id']==strategy]
        numerical.append({'dataset':name,'strategy':strategy,'runs':len(group),'faults':sum(bool(r['fault']) for r in group),'simulated_s':sum(r['simulated'] for r in group),'max_energy_J':max(r['energy'] for r in group),'max_constitutive_impulse_Ns':max(r['constitutive'] for r in group),'max_accumulated_energy_J':max(abs(r['final']['terrainLedger']['accumulatedResidual']) for r in group if r.get('final')),'outer_per_macro':sum(r['outer'] for r in group)/sum(r['acceptedSteps'] for r in group),'inner_per_macro':sum(r['inner'] for r in group)/sum(r['acceptedSteps'] for r in group)})
csvout('numerical-summary.csv',numerical)
floors=[]
for floor in [.25,.5,1,2]:
    for h in [.001,.002,.004]:
        for strategy in ['reference','speed-normalized-anisotropic']:
            group=[r for r in read('vehicle')['runs'] if r['floor']==floor and r['h']==h and r['id']==strategy]
            stiffness=[c['ky'] for r in group for sample in r['samples'] for c in sample['contact'].get('tireStrategy',{}).get('coefficients',[{'ky':800}])]
            floors.append({'floor':floor,'h':h,'strategy':strategy,'runs':len(group),'faults':sum(bool(r['fault']) for r in group),'sample_min_ky':min(stiffness),'sample_max_ky':max(stiffness),'outer_per_macro':sum(r['outer'] for r in group)/sum(r['acceptedSteps'] for r in group),'inner_per_macro':sum(r['inner'] for r in group)/sum(r['acceptedSteps'] for r in group)})
csvout('floor-sweep.csv',floors)


refinement=[]
for name in ['vehicle','cornering','drift']:
    runs=read(name)['runs']
    for r in runs:
        base=next(a for a in runs if a['id']==r['id'] and a['floor']==r['floor'] and a['scenario']==r['scenario'] and a['h']==.001)
        f,b=r['final']['planar'],base['final']['planar']
        refinement.append({'dataset':name,'scenario':r['scenario'],'strategy':r['id'],'floor':r['floor'],'h':r['h'],'u':f['u'],'v':f['v'],'r':f['r'],'heading':f['heading'],'delta_u_vs_1ms':f['u']-b['u'],'delta_v_vs_1ms':f['v']-b['v'],'delta_r_vs_1ms':f['r']-b['r']})
csvout('refinement.csv',refinement)
profile=[]
for r in read('profile')['runs']:
    for key,stage in r['stages'].items():
        profile.append({'scenario':r['scenario'],'h':r['h'],'strategy':r['id'],'stage':key,**stage})
csvout('profile-summary.csv',profile)
(root/'summary.json').write_text(json.dumps({'overlap':overlap,'numerical':numerical,'performance':perfrows},indent=2)+'\n')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig,axes=plt.subplots(1,2,figsize=(11,4),sharey=True)
for ax,sx in zip(axes,[0,.2]):
    for speed,color in zip([5,10,20],['#3366aa','#dd7711','#228855']):
        group=sorted([r for r in curves if r['floor']==.5 and r['speed']==speed and r['sx']==sx],key=lambda r:r['angle'])
        for strategy,style in [('A','--'),('B','-')]:
            ax.plot([r['angle'] for r in group],[-r[strategy]['fy'] for r in group],style,color=color,label=f'{strategy} {speed} m/s')
    ax.set(xlabel='Prescribed slip angle (degrees)',title=f'Longitudinal slip {sx} m/s',xlim=(0,30))
    ax.grid(alpha=.25)
axes[0].set_ylabel('Opposing lateral force (N)')
axes[1].legend(fontsize=8,ncol=2)
fig.suptitle('Measured isolated convex solver: N=1000 N, μ=0.9, Vmin=0.5 m/s')
fig.tight_layout()
fig.savefig(root/'force-curves.png',dpi=160)
plt.close(fig)
print(json.dumps({'numerical':numerical,'performance':perfrows},indent=2))
