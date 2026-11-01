"""Summarize measured experiments, never generate or replace reference fixtures."""
import json,gzip,math,statistics,collections,random
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'results/precision-m15'
def load(n):return json.loads((root/n).read_text())
def interval(values):
 rng=random.Random(15);draws=sorted(statistics.median(rng.choices(values,k=len(values))) for _ in range(5000))
 return {'median':statistics.median(values),'bootstrap95':[draws[124],draws[4874]],'pairs':len(values)}
def errors(rows,field='errorsToStrict'):
 out={}
 for r in rows:
  for k,v in r.get(field,{}).get('maxErrors',{}).items():
   if v is not None:out[k]=max(out.get(k,0),v)
 return out
screen=load('screen.json')['runs'];screenGroups=collections.defaultdict(list)
for r in screen:screenGroups[r['config']].append(r)
screenSummary=[]
for name,rows in screenGroups.items():
 screenSummary.append({'config':name,'complete':sum(not r['fault'] for r in rows),'runs':len(rows),'innerAccepted':sum(r['inner'] for r in rows),'outerAccepted':sum(r['outer'] for r in rows),'maxErrorsToStrict':errors(rows),'performance':({'cpuMsPerSimSecond':sum(r['cpuMs'] for r in rows)/sum(r['simulated'] for r in rows),'medianOfRunMedianMs':statistics.median(r['medianMs'] for r in rows),'medianOfRunP95Ms':statistics.median(r['p95Ms'] for r in rows),'medianOfRunP99Ms':statistics.median(r['p99Ms'] for r in rows)} if all(not r['fault'] for r in rows) else None),'faults':[{'strategy':r['id'],'scenario':r['scenario'],**r['fault']} for r in rows if r['fault']]})
paired=load('paired.json')['runs'];blocks=collections.defaultdict(dict)
for r in paired:
 if not r['warmup']:blocks[(r['id'],r['scenario'],r['repeat'])][r['config']]=r
costs=[]
for name in ['contact-10','contact-9','velocity-8','fast','moderate','reuse']:
 rows=[v for v in blocks.values() if v[name]['complete'] and v['strict']['complete']]
 costs.append({'config':name,'cpuRatio':interval([v[name]['cpuMs']/v['strict']['cpuMs'] for v in rows]),'aggregateCpuRatio':sum(v[name]['cpuMs'] for v in rows)/sum(v['strict']['cpuMs'] for v in rows),'innerRatio':sum(v[name]['inner'] for v in rows)/sum(v['strict']['inner'] for v in rows),'outerRatio':sum(v[name]['outer'] for v in rows)/sum(v['strict']['outer'] for v in rows),'cpuMsPerSimSecond':sum(v[name]['cpuMs'] for v in rows)/sum(v[name]['simulated'] for v in rows),'medianOfRunMedianMs':statistics.median(v[name]['medianMs'] for v in rows),'medianOfRunP95Ms':statistics.median(v[name]['p95Ms'] for v in rows),'medianOfRunP99Ms':statistics.median(v[name]['p99Ms'] for v in rows)})
retained=load('retained.json')['runs'];matched=collections.defaultdict(dict)
for r in retained:
 if not r['warmup']:matched[(r['id'],r['scenario'],r['repeat'])][r['config']]=r
performance=[]
for id in ['reference','speed-normalized-anisotropic','all']:
 for name in ['strict','moderate']:
  rows=[r for r in retained if not r['warmup'] and r['config']==name and (id=='all' or r['id']==id)]
  performance.append({'strategy':id,'config':name,'runs':len(rows),'faults':sum(bool(r['fault']) for r in rows),'cpuMsPerSimSecond':sum(r['cpuMs'] for r in rows)/sum(r['simulated'] for r in rows),'medianOfTickMediansMs':statistics.median(r['medianMs'] for r in rows),'medianOfTickP95Ms':statistics.median(r['p95Ms'] for r in rows),'medianOfTickP99Ms':statistics.median(r['p99Ms'] for r in rows),'worstMs':max(r['worstMs'] for r in rows),'innerPerTick':sum(r['inner'] for r in rows)/sum(r['accepted'] for r in rows),'outerPerTick':sum(r['outer'] for r in rows)/sum(r['accepted'] for r in rows)})
validation=load('validation.json')['runs']+load('heave.json')['runs'];accuracy=[]
for name in ['fast','moderate']:
 rows=[r for r in validation if r['config']==name];sameEvents=all(r['events']==next(t for t in validation if t['scenario']==r['scenario'] and t['id']==r['id'] and t['config']=='strict')['events'] for r in rows)
 stopD=[];stopT=[]
 for r in rows:
  if r['stop']:
   s=next(t for t in validation if t['scenario']==r['scenario'] and t['id']==r['id'] and t['config']=='strict')['stop'];stopD.append(abs(r['stop']['distance']-s['distance']));stopT.append(abs(r['stop']['time']-s['time']))
 accuracy.append({'config':name,'runs':len(rows),'complete':sum(not r['fault'] for r in rows),'maxErrorsToStrict':errors(rows),'identicalEventLogs':sameEvents,'maxStoppingDistanceErrorM':max(stopD,default=0),'maxStoppingTimeErrorS':max(stopT,default=0),'maxEnergyResidualJ':max(r['energy'] for r in rows),'maxConstitutiveImpulseResidualNs':max(r['constitutive'] for r in rows),'maxGripExcessN':max(r['gripExcess'] for r in rows)})
refinements=[]
for s in [r for r in validation if r['config']=='strict']:
 f=next(r for r in validation if r['scenario']==s['scenario'] and r['id']==s['id'] and r['config']=='fine');ff=next(r for r in validation if r['scenario']==s['scenario'] and r['id']==s['id'] and r['config']=='finer')
 item={'strategy':s['id'],'scenario':s['scenario'],'allComplete':not(s['fault'] or f['fault'] or ff['fault']),'hVsHalf':f['comparisonToStrict']['maxErrors'],'halfVsQuarter':f['comparisonToFiner']['maxErrors'],'events':{r['config']:r['events'] for r in [s,f,ff]},'stopping':{r['config']:r['stop'] for r in [s,f,ff]}}
 refinements.append(item)
rates=[]
for name in ['rate500.json','rate250.json']:
 for r in load(name)['runs']:
  rates.append({'hz':round(1/r['h']),'strategy':r['id'],'scenario':r['scenario'],'config':r['config'],'complete':not bool(r['fault']),'fault':r['fault'],'errorsToStrict':r['errorsToStrict']})
residuals=load('residuals.json')['runs'] if (root/'residuals.json').stat().st_size else []
selectedStrict=[r for r in retained if not r['warmup'] and r['config']=='strict'];selectedFast=[r for r in retained if not r['warmup'] and r['config']=='moderate']
summary={'base':'2caf5f45f989b04f6de282b880837b1a29069622','selected':'NUMERICAL_EXPERIMENTS.balanced (CLI moderate), opt-in; original position criterion and default strict path unchanged','screen':screenSummary,'candidateComparisons':costs,'selectedPerformance':performance,'selectedAggregateSpeedup':sum(r['cpuMs'] for r in selectedStrict)/sum(r['cpuMs'] for r in selectedFast),'selectedPairedCpuRatio':interval([v['moderate']['cpuMs']/v['strict']['cpuMs'] for v in matched.values()]),'accuracy':accuracy,'strictRefinement':refinements,'coarseRateScreen':rates,'residualCertificate':{'runs':len(residuals),'faults':[r for r in residuals if r['fault']],'maxPrePolish':max((r['maxPre'] for r in residuals),default=None),'maxPostPolish':max((r['maxPost'] for r in residuals),default=None)},'limitations':['Numerical agreement in this reduced model is not validation of real-vehicle realism','Coarse large-slip energy rejection occurs with strict and relaxed settings','Contact 1e-9 additionally fails some 250Hz constitutive gates; not the retained preset','Input reuse rejected as marginal; replay patch retained','Error maxima measured on matched 1ms samples; contact event detection/min loads at every actual step; stored traces decimated to 100Hz','CPU intervals share cases/host; not universal guarantees or human perceptual error thresholds']}
observables=[]
for filename in ['validation-traces.json.gz','heave-traces.json.gz']:
 data=json.load(gzip.open(root/filename,'rt'))
 for r in data['runs']:
  if r['id']!='reference' or r['config'] not in ['strict','moderate','fine','finer']:continue
  trace=r['trace'];last=trace[-1];item={'scenario':r['scenario'],'config':r['config'],'samplingHz':100,'finalHeadingRad':last[2],'finalYawRadS':last[5],'peakAbsYawRadS':max(abs(v[5]) for v in trace),'initialSideslipDeg':math.degrees(math.atan2(trace[0][4],abs(trace[0][3]))),'finalSideslipDeg':math.degrees(math.atan2(last[4],abs(last[3]))),'finalBodySpeedMS':math.hypot(last[3],last[4])}
  if r['scenario']=='heave':
   datum=trace[0][24]-.015;peaks=[{'timeS':r['sampleIndices'][i]*r['sampleGridH'],'heightM':trace[i][24],'amplitudeM':trace[i][24]-datum} for i in range(1,len(trace)-1) if trace[i][24]>trace[i-1][24] and trace[i][24]>=trace[i+1][24]];item['heavePeaks']=peaks;item['finalHeightM']=last[24]
  observables.append(item)
summary['sampledObservables']=observables
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'speedup':summary['selectedAggregateSpeedup'],'ratio':summary['selectedPairedCpuRatio'],'performance':performance,'accuracy':accuracy,'certificate':summary['residualCertificate']},indent=2))
