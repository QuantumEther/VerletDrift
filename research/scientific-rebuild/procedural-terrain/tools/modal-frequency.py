"""Independent linear suspension reference; NumPy/SciPy are analysis-only dependencies."""
import json,sys,subprocess
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
root=Path(__file__).resolve().parents[4]
s=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createVertical} from './research/scientific-rebuild/procedural-terrain/src/vertical.js'; console.log(JSON.stringify(createVertical()));"],cwd=root))
report=[]
def poles(a,h=None):
 values=np.linalg.eigvals(a)
 if h:values=np.log(values.astype(complex))/h
 return sorted([{'decay':float(-v.real),'dampedHz':float(v.imag/(2*np.pi)),'dampingRatio':float(-v.real/abs(v))} for v in values if v.imag>0],key=lambda x:x['dampedHz'])
for mode,mass,factor in [('heave',s['mass'],4),('pitch',s['pitchInertia'],sum(x*x for x,y in s['corners'])),('roll',s['rollInertia'],sum(y*y for x,y in s['corners']))]:
 M=np.diag([mass,s['wheelMass']*factor]);K=factor*np.array([[s['ks'],-s['ks']],[-s['ks'],s['ks']+s['kt']]],float);C=s['damping']*factor*np.array([[1,-1],[-1,1]],float);I=np.eye(2);Z=np.zeros((2,2))
 physical=poles(np.block([[Z,I],[-np.linalg.solve(M,K),-np.linalg.solve(M,C)]]));rates=[]
 for hz in [4000,2000,1000,500,250,200,100]:
  h=1/hz;D=np.linalg.inv(M+h*C+h*h*K/2);A=np.block([[I-h*h*D@K,h*D@M],[-h*D@K,D@M]]);discrete=poles(A,h)
  q=np.array([.01,.003]);v=np.array([.02,-.01]);q1,v1=(A@np.r_[q,v]).reshape(2,2);dv=v1-v
  workResidual=.5*(v1@M@v1+q1@K@q1-v@M@v-q@K@q)+h*v1@C@v1+.5*dv@M@dv
  assert abs(workResidual)<1e-10,workResidual
  rates.append({'hz':hz,'poles':discrete,'dampingRelativeError':[d['dampingRatio']/p['dampingRatio']-1 for d,p in zip(discrete,physical)]})
 report.append({'mode':mode,'physical':physical,'rates':rates})
fits=[]
if len(sys.argv)>1:
 samples=json.load(open(sys.argv[1]));base={r['hz']:r for r in samples if r['scenario']=='stationary'}
 for r in samples:
  if r['scenario']!='heave' or r['fault']:continue
  data=[(a['time'],a['vertical'][0]-b['vertical'][0]) for a,b in zip(r['samples'],base[r['hz']]['samples']) if a['time']>=.5];t,y=np.array(data).T
  def fun(p):return np.exp(-p[0]*t)*(p[2]*np.cos(p[1]*t)+p[3]*np.sin(p[1]*t))-y
  low=report[0]['physical'][0];fit=least_squares(fun,[low['decay'],low['dampedHz']*2*np.pi,.01,.001],bounds=([.01,1,-1,-1],[30,30,1,1]),gtol=1e-13,ftol=1e-13,xtol=1e-13)
  alpha,w=fit.x[:2];fits.append({'hz':r['hz'],'decay':alpha,'dampedHz':w/(2*np.pi),'dampingRatio':alpha/np.hypot(alpha,w),'rmseMetres':float(np.sqrt(np.mean(fit.fun**2)))})
wheelFits=[]
if len(sys.argv)>2:
 for r in json.load(open(sys.argv[2])):
  if r['fault']:continue
  t=np.array([a['time'] for a in r['samples']]);y=np.array([np.mean(a['vertical'][3:]) for a in r['samples']]);y-=y[-1]
  predicted=next(a for a in report[0]['rates'] if a['hz']==r['hz'])['poles'];low,high=predicted
  def fun(p):return 1000*(np.exp(-p[0]*t)*(p[2]*np.cos(p[1]*t)+p[3]*np.sin(p[1]*t))+np.exp(-low['decay']*t)*(p[4]*np.cos(low['dampedHz']*2*np.pi*t)+p[5]*np.sin(low['dampedHz']*2*np.pi*t))+p[6]-y)
  fit=least_squares(fun,[7,60,.001,.0001,0,0,0],bounds=([.01,40,-.01,-.01,-.01,-.01,-.01],[100,80,.01,.01,.01,.01,.01]),gtol=1e-13,ftol=1e-13,xtol=1e-13)
  alpha,w=fit.x[:2];ratio=alpha/np.hypot(alpha,w);assert abs(ratio/high['dampingRatio']-1)<.02,(r['hz'],ratio,high)
  wheelFits.append({'hz':r['hz'],'decay':alpha,'dampedHz':w/(2*np.pi),'dampingRatio':ratio,'rmseMetres':float(np.sqrt(np.mean(fit.fun**2)))/1000})
for fit in fits:
 expected=next(r for r in report[0]['rates'] if r['hz']==fit['hz'])['poles'][0]
 assert abs(fit['dampingRatio']/expected['dampingRatio']-1)<.005,fit
print(json.dumps({'parameters':s,'assumptions':'Linear symmetric vertical-only spring/damper/tire system. Tangential tire coupling excluded; pitch/roll poles are subsystem predictions. Non-flat production heave fit subtracts matched stationary trace; late high-mode content is neglected.','reference':report,'productionHeaveFits':fits,'productionWheelFits':wheelFits},indent=2))
