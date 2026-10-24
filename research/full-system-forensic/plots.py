import json,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=pathlib.Path('research/full-system-forensic/data');s=json.loads((p/'summary.json').read_text());m=json.loads((p/'model-probes.json').read_text())
f,ax=plt.subplots(1,2,figsize=(10,4))
for branch in s['branches']:
 c=s['branches'][branch]['convergence']['steering-reversal'];ax[0].plot([50,100,200,400],[c[str(h)]['finalHeading'] for h in [50,100,200,400]],'o-',label=branch)
ax[0].set(xlabel='Physics Hz',ylabel='Final heading (rad)',title='Same steering-reversal attempt');ax[0].legend(fontsize=7)
c=m['curves'];ax[1].plot([r['alphaDegrees'] for r in c],[r['lateralRaw'] for r in c],label='Raw normalized force');ax[1].plot([r['alphaDegrees'] for r in c],[r['lateralCapped'] for r in c],label='After friction cap');ax[1].set(xlabel='Slip angle (deg)',ylabel='Force / μN',title='Actual tire parameterization');ax[1].legend(fontsize=7)
f.tight_layout();f.savefig(p/'forensic-summary.png',dpi=150)
