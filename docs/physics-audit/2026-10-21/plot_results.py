from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=Path('/workspace/physics-audit')
r={x['name']:x for x in json.loads((p/'results.json').read_text())}
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'figure.dpi':150})
fig,ax=plt.subplots(figsize=(8,4.3))
for dt in [.02,.01,.005,.0025]:
 a=r[f'free-yaw-{dt}-0']['samples'];ax.plot([x['t'] for x in a],[x['yaw'] for x in a],label=f'dt = {dt:g} s')
ax.axhline(2,ls='--',color='black',lw=1,label='No-torque rigid-body reference')
ax.set(xlabel='Simulated time (s)',ylabel='Yaw rate (rad/s)',title='Unforced rotation: numerical yaw loss',ylim=(0,2.15));ax.legend(ncol=2,frameon=False);ax.grid(alpha=.2);fig.tight_layout()
for ext in ['png','svg','pdf']:fig.savefig(p/f'free-yaw.{ext}')
plt.close(fig)
a=json.loads((p/'steer-isolate-baseline-trace.json').read_text())
b=json.loads((p/'browser-low-speed.json').read_text())['samples']
fig,axs=plt.subplots(2,1,figsize=(8,6),sharex=True)
axs[0].plot([x['t'] for x in a],[x['delta'] for x in a],label='Isolated production mechanical sequence')
axs[0].plot([x['t'] for x in b],[x['delta'] for x in b],ls='--',alpha=.75,label='Actual browser loop')
axs[0].axhline(.01,color='black',lw=.8,ls=':',label='Initial perturbation 0.01 rad')
axs[0].set(ylabel='Road-wheel angle (rad)',title='Released steering from 1 m/s: physical-state oscillation');axs[0].legend(frameon=False,fontsize=9)
axs[1].plot([x['t'] for x in a],[x['v'] for x in a],label='CoM speed',color='#8250ad');axs[1].axhline(.05,ls=':',color='black',lw=.8,label='0.05 m/s')
axs[1].set(xlabel='Simulated time (s)',ylabel='Speed (m/s)');axs[1].legend(frameon=False)
for ax in axs:ax.grid(alpha=.2)
fig.tight_layout()
for ext in ['png','svg','pdf']:fig.savefig(p/f'low-speed-steering.{ext}')
plt.close(fig)
