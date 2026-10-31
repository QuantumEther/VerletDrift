"""Analyze captured production quadratics; spectrum estimates are not a new solver."""
import sys,json,gzip
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
path=Path(sys.argv[1]);data=json.loads(gzip.decompress(path.read_bytes()) if path.suffix=='.gz' else path.read_text());report=[]
for run in data['runs']:
 for trace in run['traces']:
  d=np.array(trace['d']);rhs=np.array(trace['rhs']);z=np.array(trace['z']);variables=trace['variables'];groups=trace['groups'];n=len(z)
  eig=np.linalg.eigvalsh(d[np.ix_(variables,variables)]) if variables else np.array([])
  cols=[];lagrangian=d.copy();saturated=[];fixed=[]
  for group in groups:
   ids=group['indices'];v=z[ids];norm=np.linalg.norm(v);limit=group['limit']
   if 'fixed' in group or limit<=0:fixed+=ids;continue
   if len(ids)==1:
    lo=group.get('lower',-limit);hi=group.get('upper',limit)
    if min(abs(v[0]-lo),abs(v[0]-hi))<1e-8:continue
    col=np.zeros(n);col[ids[0]]=1;cols.append(col)
   elif norm>=limit-1e-8:
    saturated.append(ids);col=np.zeros(n);col[ids]=[-v[1]/norm,v[0]/norm];cols.append(col)
    multiplier=max(0,float(np.dot((rhs-d@z)[ids],v))/(norm*norm))
    for i in ids:lagrangian[i,i]+=multiplier
   else:
    for i in ids:
     col=np.zeros(n);col[i]=1;cols.append(col)
  basis=np.array(cols).T if cols else np.zeros((n,0))
  local=np.linalg.eigvalsh(basis.T@lagrangian@basis) if cols else np.array([])
  initial=np.array(trace['warm']);gradient=d@initial-rhs;projected=initial-gradient/trace['L']
  def project(x):
   x=x.copy()
   for g in groups:
    ids=g['indices']
    if 'fixed' in g:x[ids[0]]=g['fixed']
    elif 'lower' in g:x[ids[0]]=np.clip(x[ids[0]],g['lower'],g['upper'])
    elif np.linalg.norm(x[ids])>g['limit']:x[ids]*=g['limit']/np.linalg.norm(x[ids])
   return x
  warm_res=float(np.max(np.abs(project(projected)-initial)))
  # Independently solve the same captured convex problem with SciPy SLSQP.
  # Fixed/zero-capacity variables are eliminated. This is an offline oracle only.
  variable=sorted(set(variables));constant=np.zeros(n)
  for g in groups:
   if 'fixed' in g:constant[g['indices'][0]]=g['fixed']
  def expand(y):x=constant.copy();x[variable]=y;return x
  objective=lambda y:float(.5*expand(y)@d@expand(y)-rhs@expand(y))
  jac=lambda y:(d@expand(y)-rhs)[variable]
  bounds=[(-np.inf,np.inf) for _ in variable];constraints=[]
  for g in groups:
   if 'fixed' in g or g['limit']<=0:continue
   ids=[variable.index(i) for i in g['indices']]
   if len(ids)==1:bounds[ids[0]]=(g.get('lower',-g['limit']),g.get('upper',g['limit']))
   else:
    L=g['limit']
    def value(y,ids=ids,L=L):return 1-float(y[ids]@y[ids])/(L*L)
    def derivative(y,ids=ids,L=L):v=np.zeros(len(variable));v[ids]=-2*y[ids]/(L*L);return v
    constraints.append({'type':'ineq','fun':value,'jac':derivative})
  oracle=minimize(objective,np.zeros(len(variable)),jac=jac,bounds=bounds,constraints=constraints,method='SLSQP',options={'ftol':1e-13,'maxiter':2000}) if variable else None
  oracle_delta=float(objective(z[variable])-oracle.fun) if oracle is not None else 0
  # Independent normal-cone KKT certificate, unlike the solver's scaled
  # projected-gradient residual. Fixed coordinates have unrestricted multipliers.
  grad=d@z-rhs;kkt=0;feasibility=0
  for g in groups:
   ids=g['indices'];v=z[ids];force=grad[ids];L=g['limit']
   if 'fixed' in g:feasibility=max(feasibility,abs(v[0]-g['fixed']));continue
   if L<=0:feasibility=max(feasibility,float(np.linalg.norm(v)));continue
   if len(ids)==1:
    lo,hi=g.get('lower',-L),g.get('upper',L);feasibility=max(feasibility,lo-v[0],v[0]-hi)
    residual=max(0,-force[0]) if abs(v[0]-lo)<1e-9 else max(0,force[0]) if abs(v[0]-hi)<1e-9 else abs(force[0])
   else:
    norm=float(np.linalg.norm(v));feasibility=max(feasibility,norm-L)
    multiplier=max(0,-float(force@v)/(norm*norm)) if norm>=L-1e-9 and norm>0 else 0
    residual=float(np.linalg.norm(force+multiplier*v))
   kkt=max(kkt,residual)

  positive=local[local>1e-10]
  report.append({'scenario':run['scenario'],'id':run['id'],'h':run['h'],'floor':run['floor'],'time':trace['time'],'mode':trace['mode'],'iterations':trace['iterations'],'L':trace['L'],'freeEigenvalues':eig.tolist(),'freeNullity':int(sum(abs(eig)<1e-10)),'localLagrangianEigenvalues':local.tolist(),'localPositiveCondition':float(max(positive)/min(positive)) if len(positive) else None,'boundOverFreeMaxEigen':float(trace['L']/max(eig)) if len(eig) else None,'saturatedTires':saturated,'warmResidual':warm_res,'finalResidual':trace['postResidual'],'history':trace['history'],'normalConeKKTResidual':float(kkt),'feasibilityExcess':float(feasibility),'oracleSuccess':bool(oracle.success) if oracle is not None else True,'oracleMessage':oracle.message if oracle is not None else '', 'oracleAccurateTo1eMinus10Objective':abs(oracle_delta)<1e-10,'objectiveExcessVsOracle':oracle_delta,'oracleImpulseDifference':float(max(abs(z-expand(oracle.x)))) if oracle is not None else 0})
print(json.dumps({'method':'Actual free Hessian; local active-manifold Lagrangian Hessian; independent SLSQP from zero with fixed coordinates eliminated. Nullity and active-set classification reported explicitly.','cases':report},indent=2))
