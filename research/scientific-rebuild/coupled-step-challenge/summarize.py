import json,collections,statistics,random
from pathlib import Path
p=Path(__file__).resolve().parent/'results'
def load(name):return json.loads((p/name).read_text())
performance=load('performance.json')['runs'];groups=collections.defaultdict(list)
for r in performance:
 if not r['warmup']:groups[r['accuracy'],r['method']].append(r)
tables=[];ratios=[]
for accuracy in ['strict','balanced']:
 for method in ['reference','joint']:
  rows=groups[accuracy,method];ticks=sum(r['accepted'] for r in rows);tables.append({'accuracy':accuracy,'method':method,'runs':len(rows),'complete':sum(r['complete'] for r in rows),'cpuMsPerSimSecond':sum(r['cpuMs'] for r in rows)/sum(r['simulated'] for r in rows),'medianMs':statistics.median(r['medianMs'] for r in rows),'p95Ms':statistics.median(r['p95Ms'] for r in rows),'p99Ms':statistics.median(r['p99Ms'] for r in rows),'worstObservedMs':max(r['worstMs'] for r in rows),'fistaIterationsPerStep':sum(r['contactIterations'] for r in rows)/ticks,'endpointIterationsPerStep':sum(r['endpointIterations'] for r in rows)/ticks,'jointNewtonIterationsPerStep':sum(r['jointIterations'] for r in rows)/ticks,'environmentEvaluationsPerStep':sum(r['environments'] for r in rows)/ticks,'problemAssembliesPerStep':sum(r['assemblies'] for r in rows)/ticks})
 a,b=groups[accuracy,'reference'],groups[accuracy,'joint'];ratios.append({'accuracy':accuracy,'jointOverReferenceCPU':sum(r['cpuMs'] for r in b)/sum(r['cpuMs'] for r in a)})
valid=[r for r in load('validation.json')['runs'] if r['scenario'] not in ['selector','flat-shift']]+load('braking.json')['runs'];j=[r for r in valid if r['method']=='joint'];errors={}
for r in j:
 for k,v in r['comparison']['maxErrors'].items():errors[k]=max(errors.get(k,0),v)
profile=load('baseline-profile.json')['runs'];stages=collections.defaultdict(lambda:{'ms':0,'count':0})
for r in profile:
 for key,v in r['stages'].items():stages[key]['ms']+=v['ms'];stages[key]['count']+=v['count']
total=sum(v['ms'] for v in stages.values())
for v in stages.values():v['fraction']=v['ms']/total
transitions=load('transitions.json')['runs'];originalCert=load('reference-certificates.json')['runs'];initial=load('initial-screen.json')['runs']
summary={'decision':'DO NOT INTEGRATE: numerical agreement in the bounded tests, but complete-step CPU and latency regress substantially; retain nested strict/balanced path','performance':tables,'cpuRatios':ratios,'profileStageWallTimes':stages,'validation':{'jointRuns':len(j),'complete':sum(r['complete'] for r in j),'allFinite':all(r['finite'] for r in j),'independentCertificateFailures':sum(r['certificateFailures'] for r in j),'maxKKT':max(r['maxKKT'] for r in j),'maxEnergyResidualJ':max(r['energy'] for r in j),'maxConstitutiveImpulseResidualNs':max(r['constitutive'] for r in j),'maxFrictionExcessN':max(r['grip'] for r in j),'saturatedForceStages':sum(r['saturatedForceStages'] for r in j),'maxErrorsToMatchedReference':errors,'identicalEngineClutchGearEvents':all(r['comparison']['eventsIdentical'] for r in j),'stopping':[{'strategy':r['strategy'],'accuracy':r['accuracy'],'method':r['method'],'result':r['stop']} for r in load('braking.json')['runs']]},'transitions':{'nonflatSelectorAllRejectAt6ms':all(r['fault']and abs(r['fault']['time']-.006)<1e-12 and r['rollback'] for r in transitions if r['scenario']=='selector'),'flatGearShiftDelegatedExactly':all(r['complete'] and r['finalGear']=='1' for r in transitions if r['scenario']=='flat-shift')},'certificateCorrection':{'initialExtraFailures':sum(r['certificateFailures'] for r in initial),'unmodifiedReferenceFailures':sum(r['failures'] for r in originalCert),'action':'Independent original certificate added as a mandatory joint termination condition; no threshold relaxed'},'limits':['Only prescribed 1ms road/seed42/1mm A/B tests; 0.35s dynamic trajectories and 1s braking','No hardware GPU, rendering or production integration','No global uniqueness or convergence proof for the nonlinear load-dependent feasible sets','Finite-difference geometry Jacobian and allocation costs are included; worst observed timing is not WCET','Flat drivetrain shifts delegate unchanged source physics; nonflat shifts retain original explicit rejection']}
(p/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'ratios':ratios,'validation':summary['validation'],'transitions':summary['transitions']},indent=2))
