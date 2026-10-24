#!/usr/bin/env python3
"""Execute the native probe twice, retain failures, independently audit the wrench."""
import argparse,csv,hashlib,io,json,math,pathlib,platform,subprocess
ROOT=pathlib.Path(__file__).resolve().parent
PIN='9a5072b5324e012a66d9fb7eaac0c679b8465e73'
SOURCES=['src/chrono_vehicle/wheeled_vehicle/tire/ChTMeasyTire.cpp','src/chrono_vehicle/wheeled_vehicle/tire/ChTMeasyTire.h','src/chrono_vehicle/wheeled_vehicle/tire/ChForceElementTire.cpp','src/chrono_vehicle/wheeled_vehicle/ChTire.cpp','src/chrono_vehicle/wheeled_vehicle/ChWheel.cpp','src/chrono_vehicle/wheeled_vehicle/ChSpindle.cpp','src/chrono_vehicle/wheeled_vehicle/ChWheeledVehicle.cpp','src/chrono_vehicle/wheeled_vehicle/ChAxle.cpp','src/chrono_vehicle/wheeled_vehicle/test_rig/ChWheelTestRig.cpp','src/chrono_vehicle/ChVehicle.cpp','src/chrono_vehicle/terrain/FlatTerrain.cpp','src/chrono_models/vehicle/generic/Generic_Wheel.cpp','src/chrono_models/vehicle/generic/tire/Generic_TMeasyTire.cpp','LICENSE']

def sha(data):return hashlib.sha256(data).hexdigest()
def vector(row,prefix):return [row[prefix+'_'+a] for a in 'xyz']
def add(a,b):return [x+y for x,y in zip(a,b)]
def sub(a,b):return [x-y for x,y in zip(a,b)]
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def rotate(q,v):
    # Independent quaternion-to-matrix construction; no Chrono helper calls.
    w,x,y,z=q
    m=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
       [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
       [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    return [dot(row,v) for row in m]
def close(a,b):return abs(a-b)<=1e-8+2e-11*max(abs(a),abs(b))
def vecclose(a,b):return all(close(x,y) for x,y in zip(a,b))
def run(exe,source,build,out):
    out.mkdir(parents=True,exist_ok=True)
    actual=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
    assert actual==PIN,actual
    integrity={}
    for path in SOURCES:
        expected=subprocess.check_output(['git','-C',str(source),'show',PIN+':'+path])
        assert (source/path).read_bytes()==expected,path+' modified'
        integrity[path]=sha(expected)
    (out/'source-integrity.json').write_text(json.dumps({'commit':PIN,'sha256':integrity},indent=2)+'\n')
    runs=[]
    for i in (1,2):
        p=subprocess.run([str(exe)],capture_output=True,text=True)
        (out/f'native-run-{i}.csv').write_text(p.stdout)
        (out/f'native-run-{i}.stderr.txt').write_text(p.stderr)
        assert p.returncode==0,('native process failed',p.returncode,p.stderr)
        runs.append(p.stdout)
    parsed=list(csv.DictReader(io.StringIO(runs[0])))
    rows={r['id']:{k:(v if k=='id' else float(v)) for k,v in r.items()} for r in parsed}
    assert len(rows)==11
    checks=[]
    def check(name,ok):checks.append({'id':name,'status':'PASS' if ok else 'FAIL'})
    check('deterministic-two-native-runs',runs[0]==runs[1])
    for id,r in rows.items():
        check(id+'-actual-disc-contact',r['geometric_contact']==1 and close(r['depth_m'],r['geometric_depth_m']))
        check(id+'-zero-initial-bristles',r['brx_before_m']==r['bry_before_m']==0)
        check(id+'-native-time-advanced',close(r['time_after_s']-r['time_before_s'],r['advance_dt_s']) and r['integrated']==1)
        check(id+'-cached-first-wrench',vector(r,'acc_force')==[0,0,0] and vector(r,'acc_moment')==[0,0,0])
        q=[r['frame_q'+a] for a in ['w','x','y','z']]
        if all(math.isfinite(x) for x in vector(r,'hub_force')+vector(r,'hub_moment')):
            f=rotate(q,vector(r,'local_force'))
            m=add(rotate(q,vector(r,'local_moment')),cross(sub(vector(r,'contact_point'),vector(r,'wheel_position')),f))
            check(id+'-native-hub-transform',vecclose(f,vector(r,'hub_force')) and vecclose(m,vector(r,'hub_moment')))
            p=dot(f,vector(r,'wheel_velocity'))+dot(m,vector(r,'wheel_angvel'))
            check(id+'-pending-wheel-power',close(p,r['pending_power_W']))
        # The next callback applies the cached force iff contact remains active.
        if r['next_active_contact']:
            check(id+'-next-applied-force',vecclose(vector(r,'next_acc_force'),vector(r,'hub_force')))
            # All cases are upright; verify the actual measured contact frame, not an implicit assumption.
            check(id+'-upright-contact-frame',vecclose(q[1:],[0,0,0]) and close(q[0],1))
            m=add(vector(r,'local_moment'),cross(sub(vector(r,'next_contact_point'),vector(r,'post_position')),vector(r,'hub_force')))
            check(id+'-next-applied-moment',vecclose(m,vector(r,'next_acc_moment')))
        else:
            check(id+'-inactive-suppresses-cached-wrench',vector(r,'next_acc_force')==vector(r,'next_acc_moment')==[0,0,0])
    a=rows['A_zero']
    observations={
      'A':{'exact_zero_reached':a['Fn_N']==0 and a['active_contact']==1,'active_at_zero':a['active_contact']==1,'nonfinite_pending_force':not all(math.isfinite(x) for x in vector(a,'hub_force')),'nonfinite_bristles':not math.isfinite(a['brx_after_m']),'next_active':bool(a['next_active_contact']),'next_force_finite':all(math.isfinite(x) for x in vector(a,'next_acc_force'))},
      'B':{'contact_jump_Nm':rows['B_at']['local_moment_z']-rows['B_below']['local_moment_z'],'next_applied_jump_Nm':rows['B_at']['next_acc_moment_z']-rows['B_below']['next_acc_moment_z']},
      'C':{'forward_Fx_N':rows['C_forward']['local_force_x'],'reverse_Fx_N':rows['C_reverse']['local_force_x'],'forward_Mz_Nm':rows['C_forward']['local_moment_z'],'reverse_Mz_Nm':rows['C_reverse']['local_moment_z']},
      'D':{'small_brx_m':rows['D_small_matched']['brx_after_m'],'large_brx_m':rows['D_large_matched']['brx_after_m'],'mismatched_brx_m':rows['D_mismatched']['brx_after_m'],'interface_contract':rows['D_small_matched']['brx_after_m']==rows['D_mismatched']['brx_after_m'] and rows['D_large_matched']['brx_after_m']!=rows['D_mismatched']['brx_after_m']}}
    if observations['A']['exact_zero_reached']:
        check('A-native-zero-boundary',all(observations['A'][x] for x in ['active_at_zero','nonfinite_pending_force','nonfinite_bristles']))
    else:
        checks.append({'id':'A-native-zero-boundary','status':'UNRESOLVED','reason':'The frozen physical inputs did not reach exact zero active native normal force; finite output here cannot refute the conditional source finding.'})
    # Compare unchanged Mission 20 saved records, not a newly rewritten model.
    old=ROOT.parent/'tmeasy-evaluation/results/cases.csv'
    baseline={r['id']:r for r in csv.DictReader(old.open())}
    pairs={'B_below':'threshold_0.999999','B_at':'threshold_1.000000','B_above':'threshold_1.000001','C_forward':'forward_reflect','C_reverse':'reverse_reflect','D_small_matched':'arg_dt_small','D_mismatched':'arg_dt_large'}
    for now,prior in pairs.items():
        b=baseline[prior];r=rows[now]
        check(now+'-mission20-output-agreement',all(close(r[n],float(b[o])) for n,o in [('local_force_x','Fx_N'),('local_force_y','Fy_N'),('local_moment_z','Mz_Nm'),('brx_after_m','brx_m'),('bry_after_m','bry_m')]))
    check('B-moment-jump-survives-native-application',observations['B']['next_applied_jump_Nm']>13)
    check('C-native-reverse-asymmetry',abs(observations['C']['forward_Fx_N']+observations['C']['reverse_Fx_N'])>500)
    check('D-timestep-contract',observations['D']['interface_contract'])
    check('D-force-old-bristle-level',all(close(rows[id]['local_force_x'],-500) for id in ['D_small_matched','D_large_matched','D_mismatched']))
    provenance={'chrono_commit':PIN,'verlet_base':'7e2df69bec9ed5153a7fed6229ced50f34bb998e','python':platform.python_version(),'platform':platform.platform(),'compiler':subprocess.check_output(['g++','--version'],text=True).splitlines()[0],'native_executable_sha256':sha(exe.read_bytes()),'native_executable_bytes':exe.stat().st_size,'input_sha256':sha((ROOT/'cases.json').read_bytes()),'harness_sha256':{p.name:sha(p.read_bytes()) for p in [ROOT/'native.cpp',ROOT/'CMakeLists.txt',ROOT/'verify.py']},'run_sha256':list(map(lambda t:sha(t.encode()),runs)),'mission20_cases_sha256':sha(old.read_bytes()),'source_build_paths':{'source':str(source),'build':str(build)}}
    summary={'schema':'mission21-native-v1','provenance':provenance,'case_count':len(rows),'checks':checks,'observations':observations,'global_passivity':'UNRESOLVED'}
    (out/'verification.json').write_text(json.dumps(summary,indent=2,allow_nan=False)+'\n')
    (out/'linked-libraries.txt').write_text(subprocess.check_output(['ldd',str(exe)],text=True))
    cache=build/'CMakeCache.txt'
    (out/'build-options.txt').write_text('\n'.join(l for l in cache.read_text().splitlines() if l.startswith(('CH_ENABLE_','BUILD_','CMAKE_CXX_COMPILER:','CMAKE_BUILD_TYPE:','CMAKE_PREFIX_PATH:','CMAKE_DISABLE_FIND_PACKAGE_MPI:')))+'\n')
    print(json.dumps({'cases':len(rows),'checks_passed':sum(c['status']=='PASS' for c in checks),'checks_failed':sum(c['status']=='FAIL' for c in checks),'observations':observations},indent=2))
    return int(any(c['status']=='FAIL' for c in checks))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=pathlib.Path,required=True);p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--build',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args()
    raise SystemExit(run(a.exe,a.source,a.build,a.out))
