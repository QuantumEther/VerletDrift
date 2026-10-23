"""Regenerate audit figures from preserved measurements, without simulation."""
import gzip, json, os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR', '/tmp/verlet-audit-matplotlib')
os.environ.setdefault('XDG_CACHE_HOME', '/tmp/verlet-audit-cache')
Path('/tmp/verlet-audit-cache').mkdir(exist_ok=True)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

root = Path('docs/vehicle-audit')
summary = json.loads((root/'summary.json').read_text())
data = {n: json.load(gzip.open(root/f'telemetry-{n}.json.gz')) for n in ['realtime','input']}
plt.rcParams.update({'font.size':9,'axes.grid':True,'grid.alpha':.25,'figure.constrained_layout.use':True})
colors = {'realtime':'#2373ad','input':'#d95328'}
def series(run, columns, key): return np.array([r[columns.index(key)] for r in run['rows']], dtype=float)
def run(name, branch): return next(r for r in data[branch]['runs'] if r['name']==name)
def line(ax, r, columns, key, label=None, **kw):
    ax.plot(series(r,columns,'t'),series(r,columns,key),label=label,**kw)
def save(fig,name): fig.savefig(root/name,dpi=170);plt.close(fig)

probe=json.load(gzip.open(root/'order-probe.json.gz'));cols=probe['columns']
fig,ax=plt.subplots(3,1,figsize=(9,7),sharex=True)
for name,color in [('normal','#d95328'),('reversed','#2373ad')]:
    r=probe[name];t=series(r,cols,'t')
    line(ax[0],r,cols,'yaw',name,color=color)
    ax[1].plot(t,series(r,cols,'roadTorque_rearLeft')-series(r,cols,'roadTorque_rearRight'),label=name,color=color)
    ax[2].plot(t,series(r,cols,'omega_rearLeft')-series(r,cols,'omega_rearRight'),color=color)
ax[0].set(title='Zero steering, symmetric initial state: wheel order selects the yaw direction',ylabel='Yaw rate [rad/s]');ax[0].legend()
ax[1].set_ylabel('Rear road torque L − R [Nm]');ax[2].set(ylabel='Rear speed L − R [rad/s]',xlabel='Simulation time [s]')
save(fig,'straight-symmetry.png')

causal=json.loads((root/'causal-input.json').read_text())
fig,ax=plt.subplots(1,2,figsize=(10,4))
v=causal['regrab'];ax[0].bar(['Before grab','1 px motion','After release'],np.rad2deg([v['initialRoadAngle'],v['roadAngle'],v['afterRelease']]),color=['#2373ad','#d95328','#aa3142'])
ax[0].set(title='Off-center re-grab creates a steering jump',ylabel='Road-wheel angle [deg]')
target=causal['pendingCommand']['wheelAngle']/(np.pi*2.5)*.52
ax[1].bar(['Pending target','Render only','Next tick','New motion + tick'],np.rad2deg([target,causal['afterRenderOnlyFrame']['wheelAngle'],causal['afterNextPhysicsFrame']['roadAngle'],causal['afterImmediatePhysicsFrame']['roadAngle']]),color=['#2373ad','#aa3142','#aa3142','#31906c'])
ax[1].tick_params(axis='x',rotation=15);ax[1].set(title='A render-only frame erases pending input',ylabel='Road-angle equivalent [deg]')
save(fig,'steering-input-loss.png')

steering=json.load(gzip.open(root/'steering-probe.json.gz'));cols=steering['columns']
fig,ax=plt.subplots(3,1,figsize=(9,7),sharex=True)
for r,color in zip(steering['neutral'],['#d95328','#2373ad']):
    t=series(r,cols,'t');ax[0].plot(t,np.rad2deg(series(r,cols,'steerAngle')),label=r['name'],color=color)
    line(ax[1],r,cols,'yaw',color=color);line(ax[2],r,cols,'sat',color=color)
for a in ax:a.axvline(1.2,color='black',ls=':',alpha=.5)
ax[0].set(title='Neutral/coasting isolates free steering feedback from driven-wheel coupling',ylabel='Road-wheel angle [deg]');ax[0].legend()
ax[1].set_ylabel('Yaw rate [rad/s]');ax[2].set(ylabel='Filtered front SAT [Nm]',xlabel='Simulation time [s] (release at 1.2 s)')
save(fig,'steering-feedback.png')

model=json.loads((root/'model-probes.json').read_text());curve=model['curves']
fig,ax=plt.subplots(1,2,figsize=(11,4))
alpha=[r['alphaDegrees'] for r in curve];raw=[r['lateralRaw'] for r in curve];cap=[r['lateralCapped'] for r in curve]
ax[0].plot(alpha,raw,label='Raw normalized formula');ax[0].plot(alpha,cap,label='After friction cap')
ax[0].axvline(8,color='gray',ls=':',label='Parameter: 8°');ax[0].axvline(model['firstCapAngleDegrees'],color='red',ls='--',label='First cap: 0.148°')
ax[0].set(xlim=(0,10),xlabel='Slip angle [deg]',ylabel='Force / nominal μN',title='Default lateral curve');ax[0].legend(fontsize=8)
k=np.array([r['kappa'] for r in curve]);raw=np.array([r['longitudinalRaw'] for r in curve]);cap=np.minimum(1,raw)
t=np.clip((k-.12)/.88,0,1);blend=t*t*(3-2*t);target=cap*(1-blend)+.85*blend
ax[1].plot(k,raw,label='Raw formula');ax[1].plot(k,target,label='Production target + scrub blend');ax[1].axvline(.12,color='gray',ls=':',label='Parameter: 0.12')
ax[1].set(xlim=(0,.4),xlabel='Longitudinal slip ratio κ',ylabel='Force / nominal μN',title='Pure longitudinal static target');ax[1].legend(fontsize=8)
save(fig,'tire-characteristic.png')

fig,ax=plt.subplots(4,2,figsize=(11,10),sharex='col')
for j,name in enumerate(['gentle-launch','moderate-turn']):
    for branch in ['realtime','input']:
        r=run(name,branch);c=data[branch]['columns'];color=colors[branch];t=series(r,c,'t')
        line(ax[0,j],r,c,'rpm',branch,color=color)
        ax[1,j].plot(t,series(r,c,'longV'),label=branch+' forward',color=color)
        ax[1,j].plot(t,series(r,c,'latV'),ls='--',label=branch+' lateral',color=color,alpha=.8)
        line(ax[2,j],r,c,'yaw',color=color)
        line(ax[3,j],r,c,'clutchTorque',color=color)
    stall=summary['scenarios'][name]['input']['firstStall']['time']
    for a in ax[:,j]:a.axvline(stall,color='#aa3142',ls=':',alpha=.6)
    ax[0,j].axhline(360,color='gray',ls='--');ax[0,j].set_title(name+' (stall marked)');ax[0,j].legend()
    ax[3,j].set_xlabel('Simulation time [s]')
for a,label in zip(ax[:,0],['Engine [RPM]','Body velocity [m/s]','Yaw rate [rad/s]','Clutch torque [Nm]']):a.set_ylabel(label)
ax[1,1].legend(fontsize=7)
save(fig,'branch-response.png')

fig,ax=plt.subplots(1,3,figsize=(12,4));hz=[50,100,200,400]
for branch in ['realtime','input']:
    for j,name in enumerate(['gentle-launch','handbrake']):
        ax[j].plot(hz,[summary['branches'][branch]['convergence'][name][str(h)]['finalSpeed'] for h in hz],marker='o',label=branch,color=colors[branch])
for i,name in enumerate(['Gentle launch','Handbrake recovery']):ax[i].set(title=name,xlabel='Physics Hz',ylabel='Final speed [m/s]');ax[i].legend()
rms=[]
for r in steering['lowTurn']:
    y=series(r,steering['columns'],'yaw');t=series(r,steering['columns'],'t');rms.append(np.sqrt(np.mean(y[t>2]**2)))
ax[2].plot(hz,rms,marker='o',color='#d95328');ax[2].set(title='Neutral low-speed turn',xlabel='Physics Hz',ylabel='Yaw RMS after 2 s [rad/s]')
save(fig,'timestep-sensitivity.png')

r=run('moderate-turn','input');c=data['input']['columns'];t=series(r,c,'t')
fig,ax=plt.subplots(3,1,figsize=(9,7),sharex=True)
ax[0].plot(t,np.rad2deg(series(r,c,'beta')),label='Body sideslip');ax[0].set(ylabel='Sideslip β [deg]',title='Moderate fixed steer: force/load history before a stall')
for side in ['frontLeft','frontRight','rearLeft','rearRight']:line(ax[1],r,c,'load_'+side,side)
line(ax[2],r,c,'tireTorque','Tire yaw moment');line(ax[2],r,c,'yawDampingTorque','Added yaw damper')
ax[1].set_ylabel('Normal load [N]');ax[2].set(ylabel='Yaw moment [Nm]',xlabel='Simulation time [s]')
for a in ax:a.axvline(3.01,color='#aa3142',ls=':');a.legend(fontsize=8)
save(fig,'handling-chain.png')
