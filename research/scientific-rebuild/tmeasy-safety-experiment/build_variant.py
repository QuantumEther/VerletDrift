#!/usr/bin/env python3
"""Build one patched native object and relink a separate Vehicle library.
VERLETDRIFT RESEARCH PATCH — NOT UPSTREAM CHRONO.
Original source, objects and shared libraries are never overwritten.
"""
import argparse,hashlib,json,pathlib,shlex,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parent
PIN='9a5072b5324e012a66d9fb7eaac0c679b8465e73'
REL='src/chrono_vehicle/wheeled_vehicle/tire/ChTMeasyTire.cpp'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main(a):
    source=a.source.resolve();build=a.build.resolve();out=a.out.resolve();out.mkdir(parents=True,exist_ok=True)
    assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==PIN
    original=source/REL;expected=subprocess.check_output(['git','-C',str(source),'show',PIN+':'+REL]);assert original.read_bytes()==expected
    before={name:sha(build/'lib'/name) for name in ['libChrono_core.so','libChrono_vehicle.so']}
    patched=out/REL;patched.parent.mkdir(parents=True,exist_ok=True);patched.write_bytes(expected)
    subprocess.run(['git','apply','--check',str(ROOT/'zero-load.patch')],cwd=out,check=True)
    subprocess.run(['git','apply',str(ROOT/'zero-load.patch')],cwd=out,check=True)
    commands=subprocess.check_output([str(a.ninja),'-C',str(build),'-t','commands','Chrono_vehicle'],text=True).splitlines()
    compile_line=next(c for c in commands if '/tire/ChTMeasyTire.cpp.o -c ' in c)
    compile_args=shlex.split(compile_line)
    object_path=out/'ChTMeasyTire.cpp.o';(out/'lib').mkdir(exist_ok=True)
    for option,value in [('-o',str(object_path)),('-MF',str(out/'tmeasy.d')),('-MT',str(object_path))]:compile_args[compile_args.index(option)+1]=value
    compile_args[compile_args.index('-c')+1]=str(patched)
    link_args=shlex.split(commands[-1])
    assert link_args[:2]==[':','&&'] and link_args[-2:]==['&&',':'];link_args=link_args[2:-2]
    link_args[link_args.index('-o')+1]=str(out/'lib/libChrono_vehicle.so')
    replaced=0
    for i,token in enumerate(link_args):
        if token.endswith('/tire/ChTMeasyTire.cpp.o'):link_args[i]=str(object_path);replaced+=1
        if token.startswith('-Wl,--dependency-file='):link_args[i]='-Wl,--dependency-file='+str(out/'link.d')
    assert replaced==1
    start=time.monotonic()
    with (out/'build.log').open('w') as log:
        subprocess.run(compile_args,cwd=build,stdout=log,stderr=subprocess.STDOUT,check=True)
        subprocess.run(link_args,cwd=build,stdout=log,stderr=subprocess.STDOUT,check=True)
    assert original.read_bytes()==expected
    assert before=={name:sha(build/'lib'/name) for name in before}
    record={'label':'VERLETDRIFT RESEARCH PATCH — NOT UPSTREAM CHRONO','upstream_commit':PIN,'original_source_sha256':sha(original),'patch_sha256':sha(ROOT/'zero-load.patch'),'patched_source_sha256':sha(patched),'variant_library_sha256':sha(out/'lib/libChrono_vehicle.so'),'original_libraries_unchanged_sha256':before,'seconds':time.monotonic()-start,'compile_command':compile_args,'link_command_sha256':hashlib.sha256('\0'.join(link_args).encode()).hexdigest(),'method':'one native object replaced; all other original native Vehicle objects and Core library reused; no ELF interposition'}
    (out/'provenance.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({k:record[k] for k in ['original_source_sha256','patch_sha256','patched_source_sha256','seconds']},indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--build',type=pathlib.Path,required=True);p.add_argument('--ninja',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);main(p.parse_args())
