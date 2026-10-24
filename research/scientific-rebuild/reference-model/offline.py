"""Independent NumPy transcription: normalized adhesion fraction and mass-matrix solve.
Only offline validation; does not import/call the JS model. Source Eq.7-20.
"""
import argparse,json,math,time,platform,subprocess,gzip
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp
import scipy
ROOT=Path(__file__).parent
A=np.array([1e-4,1e-4,1e-6,1e-3,1e-3]);PARAM={'mv':1200.,'mw':100.,'JG':2500.,'C':2.77,'D':4.5,'l':2.5,'d':1.5,'q':1.,'r':.3,'kx':4e6,'ky':2e6,'a':.1,'mu0':.9,'mu':.6,'g':9.81}
COUNTS={'rhs':0,'tires':0}
MOBILITY=np.linalg.inv([[1400.,-50.],[-50.,2830.54]])
def contact(vx,vy,O,fz):
 COUNTS['tires']+=1
 sx=(.3*O-vx)/abs(.3*O);sy=-vy/abs(.3*O);b=math.hypot(sx,sy);k=math.hypot(4e6*sx,2e6*sy)
 if b==0:return np.zeros(3),[sx,sy,'adhesion']
 L=1-2*.1**2*k/(3*.9*fz)
 if L<=0:return np.array([.6*fz*sx/b,.6*fz*sy/b,0]),[sx,sy,'sliding']
 # Algebraically independent nondimensional form of Eq.20.
 w=(1-L)**2*(1+2*L);z=3*.1*(1-L)**2*L**2
 return np.array([2*.1**2*L**2*4e6*sx+w*.6*fz*sx/b,2*.1**2*L**2*2e6*sy+w*.6*fz*sy/b,2/3*.1**3*(3-4*L)*L**2*2e6*sy-z*.6*fz*sy/b]),[sx,sy,'adhesion']
def evaluate(x,Md=200,g=math.pi/36):
 COUNTS['rhs']+=1
 v,s,w,Or,Of=x;co=math.cos(g);sn=math.sin(g)
 kr=(v,s-1.5*w);kf=(v*co+(s+w)*sn,-v*sn+(s+w)*co)
 r,rs=contact(*kr,Or,5689.8+Md/2.5);f,fs=contact(*kf,Of,8044.2-Md/2.5)
 Fx=r[0]+f[0]*co-f[1]*sn;H=f[0]*sn+f[1]*co;tau=-1.5*r[1]+H+r[2]+f[2]
 # Solve the coupled inertial balance rather than copying the JS expanded formula.
 lat,yaw=MOBILITY @ np.array([r[1]+H,tau])
 dx=np.array([s*w+(-50*w*w+Fx)/1400,lat-v*w,yaw,(Md-.3*r[0])/4.5,-.3*f[0]/4.5])
 power=np.array([Md*Or,r[0]*(kr[0]-.3*Or)+r[1]*kr[1],f[0]*(kf[0]-.3*Of)+f[1]*kf[1],r[2]*w,f[2]*w])
 return dx,power,{'rear':{'force':r.tolist(),'slip':rs},'front':{'force':f.tolist(),'slip':fs}}
def jac(x,Md,factor=1e-5):
 h=factor*np.maximum(1,np.abs(x));return np.column_stack([(evaluate(x+np.eye(5)[i]*h[i],Md)[0]-evaluate(x-np.eye(5)[i]*h[i],Md)[0])/(2*h[i]) for i in range(5)])
def refine(seed,Md):
 x=np.array(seed,dtype=float);history=[];lower=x-np.array([.5,.5,.05,2,2]);upper=x+np.array([.5,.5,.05,2,2]);start=COUNTS.copy()
 for iteration in range(51):
  f=evaluate(x,Md)[0];res=float(np.max(np.abs(f)/A));history.append({'iteration':iteration,'scaledResidual':res,'state':x.tolist(),'residual':f.tolist()})
  if res<=1e-3:break
  if iteration==50:raise RuntimeError('Equilibrium unresolved at iteration cap')
  step=np.linalg.solve(jac(x,Md),-f);alpha=1
  for backtrack in range(30):
   y=x+alpha*step
   if np.all(y>=lower)&np.all(y<=upper) and np.max(np.abs(evaluate(y,Md)[0])/A)<res:break
   alpha/=2
  else:raise RuntimeError('Newton search unresolved; windows NOT widened')
  x=y
 j=jac(x,Md);jh=jac(x,Md,.5e-5);ev=np.linalg.eigvals(jh)
 return {'state':x.tolist(),'residual':evaluate(x,Md)[0].tolist(),'scaledResidual':res,'iterations':iteration,'history':history,'jacobian':jh.tolist(),'jacobianRefinementMax':float(np.max(abs(j-jh))),'eigenvalues':[[float(z.real),float(z.imag)] for z in ev],'eigenvalueRefinementMax':float(np.max(abs(np.sort_complex(ev)-np.sort_complex(np.linalg.eigvals(j))))),'contacts':evaluate(x,Md)[2],'counts':{k:COUNTS[k]-start[k] for k in start}}
def check_domain(x,Md,g):
 bounds=[(5,25),(-8,8),(-2,2),(20,200),(20,200)]
 if any(not math.isfinite(v) for v in x):raise RuntimeError('FAIL: nonfinite offline state')
 if any(v<lo or v>hi for v,(lo,hi) in zip(x,bounds)):raise RuntimeError('OUT OF DOMAIN: offline stage '+str(x))
 if not -500<=Md<=800 or abs(g)>math.pi/12:raise RuntimeError('OUT OF DOMAIN: input')
 v,s,w,Or,Of=x
 for vx,vy,O in [(v,s-1.5*w,Or),(v*math.cos(g)+(s+w)*math.sin(g),-v*math.sin(g)+(s+w)*math.cos(g),Of)]:
  if math.hypot((.3*O-vx)/(.3*O),-vy/(.3*O))>2:raise RuntimeError('OUT OF DOMAIN: slip')
def energy(x):
 v,s,w,Or,Of=x
 # Independent three-body sum, not the JS collapsed quadratic.
 return 1200*(v*v+s*s)/2+2500*w*w/2+100*(v*v+(s-1.5*w)**2)/2+100*(v*v+(s+w)**2)/2+2.77*w*w+4.5*(Or*Or+Of*Of)/2
def references():
 plan=json.loads((ROOT/'results/plan.json').read_text());output={'metadata':{'scipy':scipy.__version__,'numpy':np.__version__,'python':platform.python_version(),'method':'DOP853; independent normalized tire/mass-matrix transcription'},'cases':[]}
 for case in plan['cases']:
  Md=case['u']['Md'];g=case['u']['gamma'];x=np.array(case['x']);n=round(case['duration']*800);times=np.arange(n+1)/800
  def rhs(t,y):
   check_domain(y[:5],Md,g);dx,power,_=evaluate(y[:5],Md,g);return np.concatenate((dx,power))
  solutions=[];counts=[];elapsed=[]
  try:
   for rate,rtol,mult in [(6400,1e-12,1),(12800,2.5e-13,.25)]:
    start=time.perf_counter();before=COUNTS.copy()
    sol=solve_ivp(rhs,(0,case['duration']),np.r_[x,np.zeros(5)],method='DOP853',max_step=1/rate,rtol=rtol,atol=np.r_[A*1e-4*mult,np.full(5,1e-10*mult)],t_eval=times)
    if not sol.success:raise RuntimeError('UNRESOLVED reference solver '+sol.message)
    solutions.append(sol.y.T);counts.append({k:COUNTS[k]-before[k] for k in before});elapsed.append(time.perf_counter()-start)
   coarse,fine=solutions;difference=np.max(abs(coarse[:,:5]-fine[:,:5]),axis=0);scaled=float(np.max(difference/A))
   workdiff=float(np.max(abs(np.sum(coarse[:,5:]-fine[:,5:],axis=1))))
   ledger=max(abs(energy(row[:5])-energy(x)-sum(row[5:])) for row in fine)
   status='PASS' if scaled<=.01 and workdiff<=1e-5 and ledger<=1e-5 else 'UNRESOLVED'
   output['cases'].append({'id':case['id'],'status':status,'refinementStateMax':difference.tolist(),'refinementScaled':scaled,'refinementWorkMaxJ':workdiff,'energyResidualMaxJ':ledger,'counts':counts,'seconds':elapsed,'rows':np.column_stack((times,fine)).tolist()})
   print(case['id'],status,'scaled',scaled,'ledger J',ledger,flush=True)
   if status!='PASS':break
  except Exception as exc:
   output['cases'].append({'id':case['id'],'status':'OUT OF DOMAIN' if 'OUT OF DOMAIN' in str(exc) else 'UNRESOLVED','error':str(exc)});print(str(exc),flush=True);break
 with gzip.open(ROOT/'results/references.json.gz','wt') as f:json.dump(output,f,separators=(',',':'))
 if len(output['cases'])!=len(plan['cases']) or any(c['status']!='PASS' for c in output['cases']):raise SystemExit('Reference gate failed; dependent comparison must stop')
def stability():
 from scipy.linalg import expm
 roots=json.loads((ROOT/'results/equilibria.json').read_text())
 with gzip.open(ROOT/'results/references.json.gz','rt') as f:refs=json.load(f)
 data={c['id']:np.array(c['rows']) for c in refs['cases']};out={}
 for name,r in roots.items():
  J=np.array(r['jacobian']);ev,V=np.linalg.eig(J);left=np.linalg.inv(V);i=np.argmax(ev.real);out[name]=[]
  for t in [.05,.25]:
   index=round(t*800);base=data[name+'-equilibrium'][index,1:6];cols=[];asym=[]
   for j,h in enumerate([.01,.01,.001,.01,.01]):
    plus=data[f'{name}-perturb-{j}-plus'][index,1:6];minus=data[f'{name}-perturb-{j}-minus'][index,1:6]
    cols.append((plus-minus)/(2*h));asym.append((plus+minus-2*base)/(2*h))
   tangent=np.column_stack(cols);exact=expm(J*t);mode=left[i] @ tangent @ V[:,i]
   out[name].append({'time':t,'dominantEigenvalue':float(ev[i].real),'predictedModeMultiplier':float(math.exp(ev[i].real*t)),'observedModeMultiplierReal':float(mode.real),'observedModeMultiplierImag':float(mode.imag),'modeRate':float(math.log(abs(mode))/t),'tangentVsExpmMax':float(np.max(abs(tangent-exact))),'finiteAmplitudeEvenRemainderMax':float(np.max(abs(np.column_stack(asym)))),'interpretation':'central finite-amplitude perturbations; remainder is an uncertainty indicator, not a rigorous error bound'})
 (ROOT/'results/stability.json').write_text(json.dumps(out,indent=2)+'\n');print(out)
def main():
 parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['roots','references','stability']);args=parser.parse_args()
 if args.mode=='roots':
  out={}
  for name,seed,Md in [('cornering',[14.96,-.84,.29,50.56,49.75],200),('drifting',[13.63,4.02,-.39,54.64,46.33],545)]:
   out[name]={'id':name,'Md':Md,'gamma':math.pi/36,'seed':seed,**refine(seed,Md)}
  (ROOT/'results/equilibria.json').write_text(json.dumps(out,indent=2)+'\n');print({k:(v['iterations'],v['scaledResidual'],v['eigenvalues']) for k,v in out.items()})
 elif args.mode=='references':references()
 else:stability()
if __name__=='__main__':main()
