from pathlib import Path
import gzip,csv,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
matplotlib.rcParams['svg.hashsalt']='verlet-mission39'
root=Path(__file__).resolve().parents[1]/'results'
with gzip.open(root/'mission39-traces.csv.gz','rt') as f:rows=list(csv.DictReader(f))
fig,axes=plt.subplots(3,2,figsize=(12,10),sharex=True)
for col,case in enumerate(['service','left-hand']):
 for model,style in [('reference','--'),('new','-')]:
  r=[x for x in rows if x['case']==case and x['model']==model];t=[float(x['time_s']) for x in r]
  axes[0,col].plot(t,[float(x['u_m_s']) for x in r],style,label=model+' speed')
  axes[0,col].plot(t,[float(x['RL_omega'])*.32 for x in r],style,label=model+' rear circumferential speed',alpha=.6)
  axes[1,col].plot(t,[float(x['yaw_rad_s']) for x in r],style,label=model+' yaw')
  axes[1,col].plot(t,[float(x['rear_Fy'])/1000 for x in r],style,label=model+' rear Fy (kN)',alpha=.6)
  axes[2,col].plot(t,[float(x['energy_J']) for x in r],style,label=model)
 if case=='left-hand':
  r=[x for x in rows if x['case']=='left' and x['model']=='new'];t=[float(x['time_s']) for x in r]
  axes[0,col].plot(t,[float(x['u_m_s']) for x in r],':',label='new, no handbrake speed')
  axes[1,col].plot(t,[float(x['yaw_rad_s']) for x in r],':',label='new, no handbrake yaw')
  axes[2,col].plot(t,[float(x['energy_J']) for x in r],':',label='new, no handbrake')
 axes[0,col].set_title(case)
 for ax in axes[:,col]:ax.grid(alpha=.25);ax.legend(fontsize=7)
 axes[0,col].set_ylabel('m/s');axes[1,col].set_ylabel('rad/s; kN');axes[2,col].set_ylabel('Reduced kinetic energy (J)');axes[2,col].set_xlabel('s')
fig.suptitle('Braking and combined contact; baseline has no dedicated handbrake')
fig.tight_layout();p=root/'mission39-comparison.svg';fig.savefig(p,metadata={'Date':None});p.write_text('\n'.join(x.rstrip() for x in p.read_text().splitlines())+'\n')
