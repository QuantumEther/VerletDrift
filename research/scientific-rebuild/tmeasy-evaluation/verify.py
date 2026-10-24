#!/usr/bin/env python3
"""Bounded independent checks; source limitations are recorded separately from test failures."""
import csv,hashlib,io,json,math,pathlib,platform,subprocess,sys
from build import build
ROOT=pathlib.Path(__file__).resolve().parent

def run(out):
    out.mkdir(parents=True,exist_ok=True);binary=build(out/'build')
    raw=subprocess.check_output([binary],text=True);replay=subprocess.check_output([binary],text=True)
    (out/'cases.csv').write_text(raw)
    fixture_raw=subprocess.check_output([binary,'fixture'],text=True);(out/'fixture.csv').write_text(fixture_raw)
    rows=list(csv.DictReader(io.StringIO(raw)))
    cases={r['id']:{k:(v if k=='id' else float(v)) for k,v in r.items()} for r in rows}
    fix={k:float(v) for k,v in next(csv.DictReader(io.StringIO(fixture_raw))).items()}
    checks=[]
    def check(name,condition,details=None):checks.append({'id':name,'status':'PASS' if condition else 'FAIL','details':details})
    def close(a,b,rtol=2e-12,atol=2e-12):return abs(a-b)<=atol+rtol*max(abs(a),abs(b))
    check('deterministic-byte-replay',raw==replay)
    check('fixture-load-SI',close(fix['pn'],.5*3850*4.4482216153))
    check('fixture-radius-SI',close(fix['R0'],37*.0254/2))
    check('fixture-matches-source-vertical-stiffness',close(fix['d1'],3850*4.4482216153/(.16*(37-16.5)*.0254/2)))
    valid=[r for r in cases.values() if r['id']!='zero_normal']
    check('finite-positive-load-and-removed-contact-cases',all(all(math.isfinite(v) for k,v in r.items() if k!='id') for r in valid))
    for prefix,col in [('long','Fx_N'),('lat','Fy_N')]:
        for val in ['0.020000','0.200000']:
            a,b=cases[prefix+'_'+val],cases[prefix+'_-'+val]
            check(prefix+'-sign-reflection-'+val,a[col]>0 and b[col]<0 and close(a[col],-b[col]))
        a=cases[prefix+'_tiny_positive'];b=cases[prefix+'_tiny_negative'];coefficient=17.7764 if prefix=='long' else 7.4013
        slope=(a[col]-b[col])/(2e-7);expected=coefficient*fix['pn']
        check(prefix+'-initial-stiffness',abs(slope/expected-1)<1e-5,{'measured_N':slope,'source_small_slip_limit_N':expected,'relative_tolerance':1e-5})
    for val in ['0.020000','0.200000']:
        a,b=cases['combined_'+val],cases['combined_-'+val]
        check('combined-reflection-'+val,close(a['Fx_N'],-b['Fx_N']) and close(a['Fy_N'],-b['Fy_N']))
    check('combined-not-independent-superposition',abs(cases['combined_0.200000']['Fx_N']-cases['long_0.200000']['Fx_N'])>1)
    for q in [.5,1,2,4]:
        r=cases['load_'+format(q,'.6f')]
        check('load-clamp-'+str(q),close(r['q'],min(q,3.5)) and close(r['Fz_N'],q*fix['pn']))
    # Independent exact solution of linear constant-input Dahl equation, z(0)=0.
    fc=fix['pn']*fix['fc_mu_ratio'];a=100000*.1/fc
    exact=fc/100000*(1-math.exp(-a*.1));errors=[]
    for dt in [.01,.005,.0025,.00125]:
        value=cases['history_'+format(dt,'.6f')]['brx_m'];errors.append(abs(value-exact))
    ratios=[errors[i]/errors[i+1] for i in range(3)]
    check('matched-time-trapezoid-state-convergence',all(3.9<x<4.1 for x in ratios),{'time_s':.1,'exact_z_m':exact,'errors_m':errors,'error_ratios':ratios})
    check('geometric-contact-loss-clears-memory',cases['no_contact']['brx_m']==cases['no_contact']['bry_m']==0)
    check('memory-actually-affects-force',cases['memory_0.001000']['Fx_N']!=cases['memory_-0.001000']['Fx_N'])
    check('rolling-resistance-opposes-spin',all(r['My_Nm']*r['omega_radps']<=1e-12 for r in valid))
    # Wrench translation independently evaluated as vector components, not tire slip shorthand.
    powers=[]
    for id in ['lat_tiny_positive','lat_0.020000','forward_reflect','release_storage']:
        r=cases[id];rs=fix['R0']-r['depth_m'];om=r['omega_radps'];delta=r['depth_m']
        for yaw in [-.3,0,.3]:
            # r=(0,0,-rs), F=(Fx,Fy,Fz); hub M=Mpatch+r cross F.
            mx_h=r['Mx_Nm']+rs*r['Fy_N'];my_h=r['My_Nm']-rs*r['Fx_N']
            wrench=r['Fx_N']*r['vx_mps']+r['Fy_N']*r['vy_mps']+my_h*om+r['Mz_Nm']*yaw
            fslip=r['Fx_N']*(r['vx_mps']-om*r['Reff_m'])+r['Fy_N']*r['vy_mps']
            radius=r['Fx_N']*om*(r['Reff_m']-rs);rr=r['My_Nm']*om;align=r['Mz_Nm']*yaw
            check('wrench-identity-'+id+'-'+str(yaw),close(wrench,fslip+radius+rr+align,atol=2e-10))
            powers.append({'case':id,'yaw_radps':yaw,'force_slip_W':fslip,'radius_port_difference_W':radius,'rolling_W':rr,'aligning_W':align,'wheel_wrench_W':wrench})
    (out/'power-probes.json').write_text(json.dumps(powers,indent=2)+'\n')
    limitations=[
      {'id':'zero-normal-force','status':'FAIL','observation':'Contact remains active at Fn==0; original bristle division by fc==0 produces nonfinite output.','reproduced':not math.isfinite(cases['zero_normal']['Fx_N'])},
      {'id':'aligning-switch-continuity','status':'FAIL','observation':'Mz jumps at signed Vx=1 m/s; no matching moment blend.','jump_Nm':cases['threshold_1.000000']['Mz_Nm']-cases['threshold_0.999999']['Mz_Nm']},
      {'id':'forward-reverse-symmetry','status':'FAIL','observation':'Mirrored motion selects different laws; reverse Mz=0.','Fx_forward_N':cases['forward_reflect']['Fx_N'],'Fx_reverse_N':cases['reverse_reflect']['Fx_N']},
      {'id':'advance-step-contract','status':'FAIL','observation':'Changing Advance argument alone does not change bristle evolution.','reproduced':cases['arg_dt_small']['brx_m']==cases['arg_dt_large']['brx_m']},
      {'id':'negative-normal-memory','status':'SOURCE LIMITATION','observation':'Damping deactivation returns zero wrench but preserves bristles during that Synchronize call.','brx_m':cases['negative_normal']['brx_m']},
      {'id':'global-passivity','status':'UNRESOLVED','observation':'No full storage/transport proof; positive stored-bristle release is not by itself a thermodynamic failure.'}]
    # Fail if a claimed reproduction disappears; do not change model to recover it.
    check('zero-force-failure-reproduced',limitations[0]['reproduced'])
    check('aligning-discontinuity-reproduced',abs(limitations[1]['jump_Nm'])>1)
    check('reverse-asymmetry-reproduced',not close(cases['forward_reflect']['Fx_N'],-cases['reverse_reflect']['Fx_N']))
    check('advance-argument-ignored-reproduced',limitations[3]['reproduced'])
    summary={'schema':'mission20-v1','source_commit':'9a5072b5324e012a66d9fb7eaac0c679b8465e73','verlet_base':'9f60a9931c6c9dc08f5b4095aa901193b6ed5a9b','case_count':len(cases),'nonfinite_cases':['zero_normal'],'checks':checks,'candidate_limitations':limitations,'trace_sha256':hashlib.sha256(raw.encode()).hexdigest(),'python':platform.python_version(),'platform':platform.platform(),'harness_source_sha256':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['build.py','harness.cpp','verify.py','source-manifest.json']},'compiler':subprocess.check_output(['g++','--version'],text=True).splitlines()[0]}
    (out/'verification.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({'checks_passed':sum(x['status']=='PASS' for x in checks),'checks_failed':sum(x['status']=='FAIL' for x in checks),'cases':len(cases),'candidate_defects':4,'verdict':'CANDIDATE LIMITATIONS REMAIN'}))
    if any(x['status']=='FAIL' for x in checks):return 1
    if '--benchmark' in sys.argv:
        (out/'benchmark.csv').write_bytes(subprocess.check_output([binary,'benchmark']))
    return 0
if __name__=='__main__':sys.exit(run(pathlib.Path(sys.argv[1])))
