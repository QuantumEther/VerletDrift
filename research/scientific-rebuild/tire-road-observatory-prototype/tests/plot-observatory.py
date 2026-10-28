"""Offline plotting of measured records; no physics and no parameter fitting."""
import json,gzip
from pathlib import Path
import matplotlib
matplotlib.use('Agg');matplotlib.rcParams['svg.hashsalt']='mission40'
import matplotlib.pyplot as plt
p=Path(__file__).resolve().parents[1]/'results'
d=json.loads(gzip.decompress((p/'mission40-traces.json.gz').read_bytes()))
cases={c['id']:c for c in d['cases']};fig,axes=plt.subplots(2,2,figsize=(12,8))
a=axes[0,0]
for name,label in [('D-low-slip-turn','ordinary turn'),('E-rear-lock-turn','same steering + rear brake')]:
 c=cases[name];a.plot([v['x'] for v in c['trace']],[v['y'] for v in c['trace']],label=label)
 for ring in c['marks']:
  for r in ring:a.plot([r['a']['x'],r['b']['x']],[r['a']['y'],r['b']['y']],color='black',alpha=r['alpha'],linewidth=2)
a.axis('equal');a.set(xlabel='world x [m]',ylabel='world y [m]',title='COM trajectories and work-derived deposition');a.legend(fontsize=8)
a=axes[0,1];t=cases['B-service']['trace'];a.plot([v['time'] for v in t],[v['u'] for v in t],label='body u')
for i,n in [(0,'front left RΩ'),(2,'rear left RΩ')]:a.plot([v['time'] for v in t],[.32*v['wheels'][i]['omega'] for v in t],label=n)
a.set(xlabel='time [s]',ylabel='speed [m/s]',title='Progressive service braking');a.legend(fontsize=8)
a=axes[1,0];t=cases['F-low-grip-wheelspin']['trace'];a.plot([v['time'] for v in t],[v['u'] for v in t],label='body u');a.plot([v['time'] for v in t],[.32*v['wheels'][2]['omega'] for v in t],label='rear RΩ');a.set(xlabel='time [s]',ylabel='speed [m/s]',title='Actual engine/clutch torque, both rear μ=.08');a.legend(fontsize=8)
a=axes[1,1]
for name in ['H-steering-reversal','H-low-grip-reversal']:
 t=cases[name]['trace'];a.plot([v['time'] for v in t],[v['yaw'] for v in t],label=name.replace('H-',''))
a.set(xlabel='time [s]',ylabel='yaw rate [rad/s]',title='Prescribed driver reversal at 1 s');a.legend(fontsize=8)
for a in axes.flat:a.grid(alpha=.25)
fig.tight_layout();f=p/'mission40-handling.svg';fig.savefig(f,metadata={'Date':None});f.write_text('\n'.join(line.rstrip() for line in f.read_text().splitlines())+'\n')
