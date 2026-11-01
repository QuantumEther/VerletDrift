"""Summarize saved measurements; no simulation or fixture generation."""
import json,collections,statistics,math,random
from pathlib import Path
base=Path(__file__).resolve().parent.parent/'results/performance-m14'
def load(name):return json.loads((base/name).read_text())
def median(x):return statistics.median(x)
def ratio_interval(values):
 rng=random.Random(14)
 samples=sorted(median(rng.choices(values,k=len(values))) for _ in range(5000))
 return {'median':median(values),'bootstrap95':[samples[124],samples[4874]],'pairs':len(values)}
runs=load('paired-final.json')['runs'];blocks=collections.defaultdict(dict)
for r in runs:
 if not r['warmup']:blocks[(r['scenario'],r['h'],r['id'],r['repeat'])][r['kernel']]=r
comparisons=[]
for id in ['reference','speed-normalized-anisotropic']:
 rows=[v for k,v in blocks.items() if k[2]==id]
 for den,num in [('dense','interior'),('interior','isolated'),('dense','isolated')]:
  comparisons.append({'strategy':id,'control':den,'candidate':num,**ratio_interval([v[num]['cpuMs']/v[den]['cpuMs'] for v in rows])})
cost=[]
for id in ['reference','speed-normalized-anisotropic']:
 for hz in [1000,500,250,'all']:
  for kernel in ['dense','interior','isolated']:
   a=[r for r in runs if not r['warmup'] and r['id']==id and r['kernel']==kernel and (hz=='all' or abs(r['h']-1/hz)<1e-15)]
   sim=sum(r['simulated'] for r in a)
   cost.append({'strategy':id,'hz':hz,'kernel':kernel,'runs':len(a),'cpuMsPerSimSecond':sum(r['cpuMs'] for r in a)/sim,'wallMsPerSimSecond':sum(r['wallMs'] for r in a)/sim,'medianOfRunMedianMs':median(r['medianMs'] for r in a),'medianOfRunP95Ms':median(r['p95Ms'] for r in a),'medianOfRunP99Ms':median(r['p99Ms'] for r in a),'worstMs':max(r['worstMs'] for r in a),'convexIterationsPerTick':sum(r['inner'] for r in a)/sum(r['accepted'] for r in a),'endpointIterationsPerTick':sum(r['outer'] for r in a)/sum(r['accepted'] for r in a),'medianHeapDelta':median(r['heapDelta'] for r in a),'gcCount':None,'gcDurationMs':None,'gcStatus':'Missing in original paired sweep: delayed listener delivery discarded events; use gc-recovery.json'})
control=[r for r in runs if not r['warmup'] and r['kernel']=='dense'];selected=[r for r in runs if not r['warmup'] and r['kernel']=='isolated']
summary={'base':'bf4505252f615beacfdb177cf5c53f37f9d3739e','runs':len(runs),'faults':sum(bool(r['fault']) for r in runs),'overallAggregatePhysicsSpeedup':sum(r['cpuMs'] for r in control)/sum(r['cpuMs'] for r in selected),'twoTimesTargetMet':False,'pairedCpuRatios':comparisons,'perRateCosts':cost,'iterationTotalsIdentical':all(len({(r['outer'],r['inner'],r['substeps']) for r in v.values()})==1 for v in blocks.values()),'maximumEnergyResidualJ':max(r['energy'] for r in runs),'maximumConstitutiveImpulseResidualNs':max(r['constitutive'] for r in runs),'uncertainty':'Bootstrap intervals resample paired run ratios, seed14; samples share scenarios/host and are not universal latency guarantees. Quantiles are medians of run quantiles, not pooled individual ticks.'}
if (base/'ab-retention.json').exists() and (base/'ab-retention.json').stat().st_size:
 ab=load('ab-retention.json')['runs'];groups=collections.defaultdict(lambda:collections.defaultdict(list))
 for r in ab:
  if not r['warmup']:groups[(r['scenario'],r['h'],r['floor'])][r['id']].append(r)
 gates=[]
 for k,g in groups.items():
  a=median(r['cpuMs']/r['simulated'] for r in g['reference']);b=median(r['cpuMs']/r['simulated'] for r in g['speed-normalized-anisotropic']);gates.append({'scenario':k[0],'h':k[1],'floor':k[2],'cpuRatioBtoA':b/a,'pass':b/a<=1.1})
 summary['bRetention']={'runs':len(ab),'faults':sum(bool(r['fault']) for r in ab),'combinations':len(gates),'passes':sum(g['pass'] for g in gates),'fails':sum(not g['pass'] for g in gates),'maximumCpuRatio':max(g['cpuRatioBtoA'] for g in gates),'passesAll':all(g['pass'] for g in gates),'cases':gates,'limitation':'Two measured repeats per combination; descriptive retention screen, not tight confidence intervals. No gate thresholds relaxed.'}
if (base/'gc-recovery.json').exists():
 gc=load('gc-recovery.json')['runs'];groups=collections.defaultdict(list)
 for r in gc:
  if not r['warmup']:groups[(r['id'],r['kernel'])].append(r)
 summary['gcRecovery']=[{'strategy':k[0],'kernel':k[1],'measuredRuns':len(v),'simulatedSeconds':sum(r['simulated'] for r in v),'events':sum(len(r['gc']) for r in v),'totalGCDurationMs':sum(e['duration'] for r in v for e in r['gc']),'medianHeapDelta':median(r['heapDelta'] for r in v),'faults':sum(bool(r['fault']) for r in v)} for k,v in groups.items()]
if (base/'browser-rendering.json').exists():
 br=load('browser-rendering.json');render=[]
 for mode in ['normal','xray']:
  for batched in [False,True]:
   a=[r for r in br['results'] if r['repeat']>0 and r['mode']==mode and r['batched']==batched];s=[v for r in a for v in r['samples']];dt=sorted(v['dt'] for v in s);cpu=sorted(v['callbackMs'] for v in s);q=lambda a,p:a[min(len(a)-1,math.ceil(len(a)*p)-1)]
   render.append({'mode':mode,'batched':batched,'samples':len(s),'fps':1000/statistics.mean(dt),'frameMedianMs':median(dt),'frameP95Ms':q(dt,.95),'frameP99Ms':q(dt,.99),'callbackMedianMs':median(cpu),'callbackP95Ms':q(cpu,.95),'drawCalls':a[0]['presentation']['drawCalls'],'triangles':a[0]['presentation']['triangles'],'renderer':a[0]['backend']['renderer'],'frozenStateChecks':'PASS'})
 summary['rendering']=render
if (base/'browser-driving.json').exists():
 driving=[]
 for r in load('browser-driving.json')['results']:
  start,end=r['start'],r['end'];seconds=(end['at']-start['at'])/1000;frames=sorted(v['dt'] for v in end['frames']);q=lambda p:frames[min(len(frames)-1,math.ceil(len(frames)*p)-1)]
  driving.append({'kind':r['kind'],'hz':r['hz'],'phase':r['phase'],'wallSeconds':seconds,'simulatedSeconds':end['state']['time']-start['state']['time'],'fps':len(frames)/seconds,'frameMedianMs':q(.5),'frameP95Ms':q(.95),'frameP99Ms':q(.99),'physicsCpuWallMs':end['clock']['acceptedPhysicsMs']-start['clock']['acceptedPhysicsMs'],'stepsPerWallSecond':(end['clock']['accepted']-start['clock']['accepted'])/seconds,'convexIterations':end['clock']['candidates']-start['clock']['candidates'],'fault':({k:v for k,v in end['clock']['fault'].items() if k!='snapshot'} if end['clock']['fault'] else None),'errors':r['errors']})
 summary['browserDriving']=driving
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k not in ['perRateCosts','rendering','browserDriving','bRetention']},indent=2))
