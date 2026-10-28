"""Offline scientific plot from the recorded JS experiments; matplotlib only."""
import csv
import gzip
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
matplotlib.rcParams['svg.hashsalt']='verlet-mission38'
root=Path(__file__).resolve().parents[1]/'results'
rows=list(csv.DictReader(gzip.open(root/'mission38-clutch-traces.csv.gz','rt')))
fig,axes=plt.subplots(4,2,figsize=(12,12),sharex=True)
for i,case in enumerate(['partial','matched','ramp','abrupt']):
 for model,style in [('reference','--'),('actuated','-')]:
  r=[x for x in rows if x['case']==case and x['model']==model];t=[float(x['time_s']) for x in r]
  for field,color,label in [('engine_rad_s','tab:blue','engine'),('input_rad_s','tab:orange','input')]:axes[i,0].plot(t,[float(x[field])*60/(2*3.141592653589793) for x in r],style,color=color,label=f'{model} {label}')
  axes[i,1].plot(t,[float(x['capacity_Nm']) for x in r],style,label=f'{model} capacity')
  axes[i,1].plot(t,[float(x['torque_Nm']) for x in r],style,label=f'{model} transmitted',alpha=.65)
 axes[i,0].set_ylabel(case+'\nRPM');axes[i,1].set_ylabel('Torque (Nm)');axes[i,0].legend(fontsize=7);axes[i,1].legend(fontsize=7)
 for ax in axes[i]:ax.grid(alpha=.25)
for ax in axes[-1]:ax.set_xlabel('Time (s)')
fig.suptitle('Two-inertia Coulomb clutch: instantaneous capacity vs axial pressure dynamics')
fig.tight_layout();fig.savefig(root/'mission38-clutch-comparison.svg',metadata={'Date':None});plt.close(fig)

# Normalize exporter whitespace without changing SVG path coordinates.
p=root/'mission38-clutch-comparison.svg'
p.write_text('\n'.join(line.rstrip() for line in p.read_text().splitlines())+'\n')
