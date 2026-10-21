"""Plot recorded code experiments. No real tire measurements or fitted data."""
from pathlib import Path
import json, csv, math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
root=Path(__file__).resolve().parent
before=json.loads((root/'before.json').read_text())
after=json.loads((root/'after.json').read_text())
colors=['#b64b35','#176b93','#47804a','#775aa6']
def save(fig,name):
    fig.tight_layout()
    for ext in ['png','svg','pdf']:
        file=root/f'{name}.{ext}';fig.savefig(file,dpi=170)
        if ext=='svg':file.write_text('\n'.join(line.rstrip() for line in file.read_text().splitlines()).rstrip()+'\n')
    plt.close(fig)
def curves(data,axis,**filters):
    return [r for r in data['curves'] if r['axis']==axis and all(r.get(k)==v for k,v in filters.items())]
def case(data,maneuver,dt=.01):
    return next(r for r in data['handling'] if r['maneuver']==maneuver and r['dt']==dt)
fig,ax=plt.subplots(2,2,figsize=(11,8))
for data,label,color in [(before,'Mission 01 tire',colors[0]),(after,'Mission 02 tire',colors[1])]:
    r=curves(data,'lateral',load=2943,peak=8)
    ax[0,0].plot([x['alpha']*180/math.pi for x in r],[abs(x['fx']) for x in r],'o-',label=label,color=color,ms=3)
    r=curves(data,'longitudinal',peak=.12)
    r=[x for x in r if x['input']>=0]
    ax[0,1].plot([x['kappa'] for x in r],[-x['fy'] for x in r],'o-',label=label,color=color,ms=3)
    r=data['combined']
    ax[1,1].scatter([-x['fy'] for x in r],[x['fx'] for x in r],label=label,alpha=.7,s=28,color=color)
for ratio,color in zip([.5,.85,1],colors):
    r=curves(after,'sliding',ratio=ratio)
    ax[1,0].plot([x['input'] for x in r],[abs(x['fx'])/2943 for x in r],'o-',label=f'{ratio:.0%} sliding grip',color=color)
angle=np.linspace(0,2*math.pi,300)
ax[1,1].plot(2943*np.cos(angle),2943*np.sin(angle),'k--',lw=.8,label='Peak friction circle')
ax[1,1].plot(.85*2943*np.cos(angle),.85*2943*np.sin(angle),'k:',lw=.8,label='85% sliding circle')
ax[0,0].axvline(8,color='gray',ls=':',label='Configured peak 8°')
ax[0,1].axvline(.12,color='gray',ls=':',label='Configured peak 0.12')
ax[0,0].set(xlim=(0,30),xlabel='Diagnostic slip angle (degrees)',ylabel='Lateral force magnitude (N)',title='Prescribed rolling fixture; Fz=2943 N')
ax[0,1].set(xlabel='Symmetric slip ratio',ylabel='Longitudinal force (N)',title='Pure longitudinal force; Fz=2943 N')
ax[1,0].set(xlabel='Fixture velocity angle (degrees)',ylabel='Lateral force / peak capacity',title='Sliding Grip controls pure lateral sliding')
ax[1,1].set(xlabel='Wheel longitudinal force (N)',ylabel='Wheel lateral force (N)',title='Combined-slip steady force grid',aspect='equal')
for a in ax.flat:a.grid(alpha=.2);a.legend(fontsize=8)
save(fig,'force-curves')
fig,ax=plt.subplots(2,2,figsize=(11,8))
for speed,color in zip([0,.1,1,30],colors):
    r=next(r for r in after['transients'] if r['speed']==speed and r['dt']==.0025)
    ax[0,0].plot([x['t'] for x in r['trace']],[x['fx'] for x in r['trace']],label=f'vLong={speed} m/s',color=color)
for sensitivity,color in zip([0,.12,.3],colors):
    r=[r for r in after['loadSweep'] if r['sensitivity']==sensitivity]
    ax[0,1].plot([x['load'] for x in r],[x['bound'] for x in r],'o-',label=f'sensitivity={sensitivity}',color=color,ms=3)
for data,label,color in [(before,'Before',colors[0]),(after,'After',colors[1])]:
    r=curves(data,'lateral',load=2943,peak=8)
    ax[1,0].plot([x['alpha']*180/math.pi for x in r],[x['sat'] for x in r],'o-',label=label,color=color,ms=3)
    r=case(data,'handbrake')
    ax[1,1].plot([x['t'] for x in r['samples']],[(x['energy']+x['wheelEnergy'])/1000 for x in r['samples']],label=label,color=color)
ax[0,0].set(xlabel='Time (s)',ylabel='Lateral force (N)',title='Magnitude buildup; imposed slip reversal at 0.5 s')
ax[0,1].set(xlabel='Wheel normal load (N)',ylabel='Peak capacity (N)',title='Existing load sensitivity retained')
ax[1,0].set(xlim=(0,25),xlabel='Diagnostic slip angle (degrees)',ylabel='Exported front SAT (N m)',title='Pneumatic moment in prescribed rolling fixture')
ax[1,1].set(xlabel='Time (s)',ylabel='Chassis + wheel kinetic energy (kJ)',title='Neutral handbrake turn; includes drag/yaw losses')
for a in ax.flat:a.grid(alpha=.2);a.legend(fontsize=8)
save(fig,'transients-load-and-work')
fig,ax=plt.subplots(1,3,figsize=(14,4))
for data,label,color in [(before,'Before',colors[0]),(after,'After',colors[1])]:
    r=case(data,'steering-release')
    ax[0].plot([x['t'] for x in r['samples']],[x['delta'] for x in r['samples']],label=label,color=color)
ref=case(after,'cornering',.00125)
refspeed=math.hypot(ref['final']['vx'],ref['final']['vy'])
rows=[]
for dt in [.02,.01,.005,.0025]:
    r=case(after,'cornering',dt)
    speederror=abs(math.hypot(r['final']['vx'],r['final']['vy'])/refspeed-1)
    angleerror=abs(r['final']['heading']-ref['final']['heading'])
    rows.append({'hz':1/dt,'speed_relative_error':speederror,'heading_absolute_error_rad':angleerror,
                 'yaw_absolute_error_rad_s':abs(r['final']['omega']-ref['final']['omega'])})
ax[1].loglog([r['hz'] for r in rows],[r['speed_relative_error'] for r in rows],'o-',color=colors[1])
ax[2].loglog([r['hz'] for r in rows],[r['heading_absolute_error_rad'] for r in rows],'o-',color=colors[1])
ax[0].set(xlabel='Time (s)',ylabel='Road-wheel angle (rad)',title='Released steering: 1 m/s, initial 0.01 rad')
ax[0].legend()
ax[1].set(xlabel='Mechanical frequency (Hz)',ylabel='Relative endpoint speed error',title='Cornering refinement versus 800 Hz')
ax[2].set(xlabel='Mechanical frequency (Hz)',ylabel='Absolute heading error (rad)',title='Cornering refinement versus 800 Hz')
for a in ax:a.grid(alpha=.2)
save(fig,'handling-and-refinement')
# Analytic diagnosis is explicitly a code equation, not measured tire data.
fig,ax=plt.subplots(figsize=(8,4))
degrees=np.linspace(0,8,800)
raw=2943*np.sin(1.9*np.arctan(10*degrees/8))/math.sin(1.9*math.atan(10))
ax.plot(degrees,raw,label='Old analytic demand (code equation)',color=colors[0],ls='--')
ax.plot(degrees,np.minimum(raw,2943),label='Old clipped pure target',color=colors[0])
r=curves(after,'lateral',load=2943,peak=8)
ax.plot([x['alpha']*180/math.pi for x in r],[abs(x['fx']) for x in r],'o-',label='Corrected prescribed-fixture observations',color=colors[1],ms=3)
ax.set(xlim=(0,8),xlabel='Slip angle (degrees)',ylabel='Force magnitude (N)',title='Why 0.1475°, 0.869°, and the 8° label diverged')
ax.axvline(.147512,color='gray',ls=':',label='Old cap onset ≈0.1475°')
ax.axvline(.869032,color='gray',ls='-.',label='Old analytic peak ≈0.869°')
ax.grid(alpha=.2);ax.legend(fontsize=8);save(fig,'legacy-curve-diagnosis')
with(root/'refinement.csv').open('w',newline='')as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
with(root/'force-curves.csv').open('w',newline='')as f:
    keys=['implementation','axis','load','peak','ratio','input','alpha','kappa','fx','fy','sat']
    w=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore',lineterminator='\n');w.writeheader()
    for tag,data in [('before',before),('after',after)]:w.writerows({'implementation':tag,**r}for r in data['curves'])
with(root/'handling-summary.csv').open('w',newline='')as f:
    keys=['implementation','dt','maneuver','final_speed','final_yaw','final_body_energy','maxYaw','maxDelta','maxLateDelta','flips','maxSubsteps','maxWheelImpulseResidual','bodyResidual','resolvedRotorResidual']
    w=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore',lineterminator='\n');w.writeheader()
    for tag,data in [('before',before),('after',after)]:
        for r in data['handling']:w.writerow({'implementation':tag,**r,'final_speed':math.hypot(r['final']['vx'],r['final']['vy']),'final_yaw':r['final']['omega'],'final_body_energy':r['final']['energy']})
fig,ax=plt.subplots(1,3,figsize=(14,4))
for load,color in zip([1000,2943,6000],colors):
    r=curves(after,'lateral',load=load,peak=8)
    ax[0].plot([x['alpha']*180/math.pi for x in r],[abs(x['fx']) for x in r],'o-',label=f'Fz={load} N',color=color,ms=3)
for peak,color in zip([2,8,20],colors):
    r=curves(after,'lateral',load=2943,peak=peak)
    ax[1].plot([x['alpha']*180/math.pi for x in r],[abs(x['fx']) for x in r],'o-',label=f'peak={peak}°',color=color,ms=3)
for peak,color in zip([.05,.12,.3],colors):
    r=[r for r in curves(after,'longitudinal',peak=peak)if r['input']>=0]
    ax[2].plot([x['kappa'] for x in r],[-x['fy'] for x in r],'o-',label=f'peak={peak}',color=color,ms=3)
ax[0].set(xlim=(0,30),xlabel='Diagnostic slip angle (degrees)',ylabel='Lateral force magnitude (N)',title='Normal-load family; peak angle 8°')
ax[1].set(xlim=(0,45),xlabel='Diagnostic slip angle (degrees)',ylabel='Lateral force magnitude (N)',title='Peak-angle family; Fz=2943 N')
ax[2].set(xlabel='Symmetric slip ratio',ylabel='Longitudinal force (N)',title='Peak-ratio family; Fz=2943 N')
for a in ax:a.legend(fontsize=8);a.grid(alpha=.2)
save(fig,'load-and-peak-families')
