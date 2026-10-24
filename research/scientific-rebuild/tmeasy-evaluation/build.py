#!/usr/bin/env python3
"""Extract unchanged original member definitions; compile a prescribed-contact harness."""
import hashlib,json,pathlib,subprocess,sys,tempfile
ROOT=pathlib.Path(__file__).resolve().parent

def block(text, marker):
    start=text.index(marker); brace=text.index('{', start); depth=1; end=brace+1
    while depth:
        depth+=(text[end]=='{')-(text[end]=='}');end+=1
    return text[start:end]

def build(out):
    out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((ROOT/'source-manifest.json').read_text())
    sources={}
    for name,info in manifest['files'].items():
        data=(ROOT/'upstream'/name).read_bytes()
        assert hashlib.sha256(data).hexdigest()==info['sha256'], name+' has changed'
        sources[name]=data.decode()
    cpp=sources['ChTMeasyTire.cpp']; header=sources['ChTMeasyTire.h']
    declarations='\n'.join(block(header,m)+';' for m in ['struct TMeasyCoeff {','struct TireStates {'])
    declarations+='\n'+block(header,'double InterpL(')+'\n'+block(header,'double InterpQ(')
    (out/'declarations.inc').write_text(declarations)
    markers=['ChTMeasyTire::ChTMeasyTire(', 'void ChTMeasyTire::Synchronize(', 'void ChTMeasyTire::Advance(', 'void ChTMeasyTire::CombinedCoulombForces(', 'void ChTMeasyTire::tmxy_combined(', 'double ChTMeasyTire::AlignmentTorque(', 'double ChTMeasyTire::GetNormalStiffnessForce(', 'double ChTMeasyTire::GetNormalDampingForce(', 'void ChTMeasyTire::GuessTruck80Par(double']
    definitions='\n\n'.join(block(cpp,m) for m in markers)
    definitions+='\n'+block(sources['ChFunctionSineStep.cpp'],'double ChFunctionSineStep::Eval(')
    (out/'definitions.inc').write_text(definitions)
    # Original generic fixture initializer, with its original parameter-guessing call.
    (out/'fixture.inc').write_text(block(sources['Generic_TMeasyTire.cpp'],'void Generic_TMeasyTire::SetTMeasyParams('))
    cmd=['g++','-std=c++17','-O2','-Wall','-Wextra','-Wno-unused-parameter','-I'+str(out),str(ROOT/'harness.cpp'),'-o',str(out/'tmeasy-probe')]
    subprocess.run(cmd,check=True)
    return out/'tmeasy-probe'

if __name__=='__main__':
    out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='tmeasy-m20-'))
    print(build(out))
