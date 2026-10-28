"""Offline presentation only; no physics implementation or numerical reference."""
import gzip,json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
matplotlib.rcParams['svg.hashsalt']='living-automobile'
import matplotlib.pyplot as plt
p=Path(__file__).resolve().parents[1]/'results'
d=json.loads((p/'living-automobile-experiments.json').read_text())
t=json.loads(gzip.decompress((p/'living-automobile-traces.json.gz').read_bytes()))
fig,axes=plt.subplots(1,2,figsize=(11,4))
for c in t['cases']:
 if c['id'].startswith('engine'):
  axes[0].plot([v['time'] for v in c['trace']],[v['rpm'] for v in c['trace']],label=f"h={c['h']*1000:g} ms")
axes[0].axhline(d['idleEquilibrium']['rpm'],color='grey',linestyle=':',label='idle equilibrium')
axes[0].set(xlabel='time [s]',ylabel='crank speed [rpm]',title='Start 0–2 s · warm 2–6 · W 6–8 · close 8–9')
s=d['steering'];axes[1].plot([x['column']*180/3.141592653589793 for x in s],[x['left']*180/3.141592653589793 for x in s],label='left knuckle');axes[1].plot([x['column']*180/3.141592653589793 for x in s],[x['right']*180/3.141592653589793 for x in s],label='right knuckle')
axes[1].set(xlabel='steering wheel [deg]',ylabel='road wheel [deg]',title='Closed linkage · mechanical stops ±401° column')
for a in axes:a.grid(alpha=.3);a.legend(fontsize=8)
fig.tight_layout();f=p/'living-automobile-engine-steering.svg';fig.savefig(f,metadata={'Date':None});f.write_text('\n'.join(line.rstrip() for line in f.read_text().splitlines())+'\n')
