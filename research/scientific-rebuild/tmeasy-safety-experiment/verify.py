#!/usr/bin/env python3
"""Compare native original and labelled research variant; keep every failure trace."""
import argparse,csv,hashlib,io,json,math,pathlib,platform,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def parse(data,key):
    return {r[key]:{k:v if k==key else float(v) for k,v in r.items()} for r in csv.DictReader(io.StringIO(data))}
def main(a):
    a.out.mkdir(parents=True,exist_ok=True);checks=[];records={};links={}
    def check(name,ok):checks.append({'id':name,'status':'PASS' if ok else 'FAIL'})
    for variant,directory in [('original',a.original),('patched',a.patched)]:
        for exe in ['frozen','trajectory']:
            runs=[]
            for n in (1,2):
                p=subprocess.run([str(directory/exe)],text=True,capture_output=True)
                (a.out/f'{variant}-{exe}-{n}.csv').write_text(p.stdout)
                (a.out/f'{variant}-{exe}-{n}.stderr.txt').write_text(p.stderr)
                check(variant+'-'+exe+'-exit-'+str(n),p.returncode==0)
                runs.append(p.stdout)
            check(variant+'-'+exe+'-deterministic',runs[0]==runs[1])
            records[variant+'-'+exe]=parse(runs[0],'id' if exe=='frozen' else 'phase')
            ldd=subprocess.check_output(['ldd',str(directory/exe)],text=True)
            links[variant+'-'+exe]=ldd
            (a.out/f'{variant}-{exe}-libraries.txt').write_text(ldd)
    original=records['original-frozen'];patched=records['patched-frozen']
    check('baseline-frozen-byte-identical-to-mission21',(a.out/'original-frozen-1.csv').read_bytes()==(ROOT.parent/'tmeasy-native-verification/results/native-run-1.csv').read_bytes())
    def close(x,y):return abs(x-y)<=1e-8+2e-11*max(abs(x),abs(y))
    for id in original:
        p=patched[id];o=original[id]
        check(id+'-patched-all-recorded-values-finite',all(math.isfinite(v) for k,v in p.items() if k!='id'))
        if id!='A_zero':
            # Same frozen source paths/fixtures; do not loosen tolerances to hide changes.
            check(id+'-unrelated-native-behavior-preserved',all(close(o[k],p[k]) for k in o if k!='id'))
    zero=patched['A_zero']
    check('zero-support-inactive',zero['Fn_N']==0 and zero['active_contact']==0)
    check('zero-support-next-native-step-finite',zero['next_brx_m']==zero['next_bry_m']==0 and zero['integrated']==1)
    check('original-exact-singularity-observed',not math.isfinite(original['A_zero']['brx_after_m']))
    for prefix in ['hub_force','hub_moment','acc_force','acc_moment','next_acc_force','next_acc_moment']:
        check('zero-'+prefix+'-is-zero',all(zero[prefix+'_'+c]==0 for c in 'xyz'))
    o=records['original-trajectory'];p=records['patched-trajectory']
    check('all-nine-history-phases-retained',len(o)==len(p)==9)
    for phase,r in p.items():
        check(phase+'-entire-patched-record-finite',all(math.isfinite(v) for k,v in r.items() if k!='phase'))
        check(phase+'-native-step-not-rejected',r['integrated']==1 and close(r['native_time_after_s']-r['native_time_before_s'],.001))
    for phase in ['loaded_1','loaded_2','positive_unload']:
        check(phase+'-unchanged-before-zero',all(close(o[phase][k],p[phase][k]) for k in o[phase] if k!='phase'))
    z=p['zero_support'];u=p['positive_unload'];d=p['direct_resupport']
    check('finite-nonzero-history-frozen-not-reset',z['brx_before_m']==z['brx_after_m']==u['brx_after_m'] and z['brx_after_m']!=0 and z['bry_before_m']==z['bry_after_m']==u['bry_after_m'])
    check('direct-positive-resupport-resumes-history',d['brx_before_m']==z['brx_after_m'] and d['brx_after_m']!=d['brx_before_m'] and d['active']==1)
    for prefix in ['returned_force','returned_moment','cache_force','cache_moment','applied_force','applied_moment']:
        check('history-zero-'+prefix,all(z[prefix+'_'+c]==0 for c in 'xyz'))
    check('baseline-direct-resupport-propagates-invalid-wrench',any(not math.isfinite(o['direct_resupport']['applied_force_'+c]) for c in 'xyz') and o['direct_resupport']['integrated']==0)
    check('actual-separation-retains-existing-reset',p['separated']['brx_after_m']==p['separated']['bry_after_m']==0)
    check('zero-penetration-is-geometric-no-contact',p['zero_penetration']['active']==0 and p['zero_penetration']['depth_m']==0)
    check('post-separation-positive-recontact-finite',p['recontact']['active']==1 and p['recontact']['brx_before_m']==0 and p['recontact']['brx_after_m']>0)
    check('loaded-zero-slip-preserves-preload',p['loaded_no_slip']['brx_after_m']==p['recontact']['brx_after_m'] and p['loaded_no_slip']['returned_force_x']!=0)
    check('known-moment-jump-remains',close(patched['B_at']['local_moment_z']-patched['B_below']['local_moment_z'],13.394799774034606))
    check('known-reverse-asymmetry-remains',patched['C_reverse']['local_moment_z']==0 and abs(patched['C_forward']['local_force_x']+patched['C_reverse']['local_force_x'])>500)
    check('setstepsize-contract-unchanged',patched['D_small_matched']['brx_after_m']==patched['D_mismatched']['brx_after_m']!=patched['D_large_matched']['brx_after_m'])
    check('variant-runtime-library-selected',str(a.variant.resolve()/'lib/libChrono_vehicle.so') in links['patched-frozen'] and str(a.variant.resolve()/'lib/libChrono_vehicle.so') in links['patched-trajectory'])
    provenance=json.loads((a.variant/'provenance.json').read_text())
    check('patch-sha-matches-build',digest(ROOT/'zero-load.patch')==provenance['patch_sha256'])
    inputs={p.name:digest(p) for p in [ROOT/'inputs.json',ROOT/'zero-load.patch',ROOT/'trajectory.cpp',ROOT/'CMakeLists.txt',ROOT/'build_variant.py',ROOT/'verify.py']}
    original_baseline_failures={'frozen_nonfinite_cases':[id for id,r in original.items() if any(not math.isfinite(v) for k,v in r.items() if k!='id')],'history_nonfinite_phases':[phase for phase,r in o.items() if any(not math.isfinite(v) for k,v in r.items() if k!='phase')],'native_history_steps_rejected':[phase for phase,r in o.items() if not r['integrated']]}
    result={'label':'VERLETDRIFT RESEARCH PATCH — NOT UPSTREAM CHRONO','verdict':'SAFETY PATCH VERIFIED' if all(c['status']=='PASS' for c in checks) else 'SAFETY PATCH NOT VERIFIED','verlet_base':'32d7adf9fbb2310df04cc7a03a0becc4c8a8fea5','upstream':provenance['upstream_commit'],'checks':checks,'original_failures_preserved':original_baseline_failures,'inputs_sha256':inputs,'variant_provenance':provenance,'traces_sha256':{f.name:digest(f) for f in a.out.glob('*.csv')},'compiler':subprocess.check_output(['g++','--version'],text=True).splitlines()[0],'python':platform.python_version(),'platform':platform.platform(),'known_limitations':['aligning threshold discontinuity','signed-speed reverse asymmetry','SetStepsize ownership','full tire passivity unresolved','finite initial state assumed; corrupt imported checkpoints are not repaired']}
    (a.out/'verification.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
    print(json.dumps({'verdict':result['verdict'],'checks_passed':sum(c['status']=='PASS' for c in checks),'checks_failed':sum(c['status']=='FAIL' for c in checks),'baseline_failures':original_baseline_failures},indent=2))
    return int(any(c['status']=='FAIL' for c in checks))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--original',type=pathlib.Path,required=True);p.add_argument('--patched',type=pathlib.Path,required=True);p.add_argument('--variant',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);raise SystemExit(main(p.parse_args()))
