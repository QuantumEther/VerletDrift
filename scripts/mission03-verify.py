"""Check recorded source identities and the report bundle without running physics."""
import hashlib,json,pathlib,re,subprocess,zipfile
root=pathlib.Path(__file__).resolve().parents[1];folder=root/'docs/physics-recovery/mission-03'
sha=lambda b:hashlib.sha256(b).hexdigest()
source={'before.json':'8fba5b33d758e613e1745afab7b16bbe7bd85031','after.json':'d41d674','performance-before.json':'8fba5b33d758e613e1745afab7b16bbe7bd85031','performance-after.json':'d41d674'}
source.update({'historical-countersteer-before.json':'8fba5b33d758e613e1745afab7b16bbe7bd85031','historical-countersteer-after.json':'d41d674','delayed-control.json':'d41d674'})
for name,rev in source.items():
 data=json.loads((folder/name).read_text())
 assert data.get('sourceHashes'),(name,'missing source identities')
 for key,value in data.get('sourceHashes',{}).items():
  path=key if key.startswith('js/') else 'js/physics/'+key
  expected=subprocess.check_output(['git','show',f'{rev}:{path}'],cwd=root)
  assert sha(expected)==value,(name,path,'source hash mismatch')
 print(name,': source hashes match',rev)
# Entire unchanged constitutive and foundational modules, not just defaults.
for path in ['js/physics/tire-model.js','js/physics/tire-load.js','js/physics/wheel.js','js/physics/integrator.js','js/physics/planar-motion.js','js/physics/kinematics.js','js/physics/constraints.js','js/physics/suspension.js','js/constants.js','js/ui/presets.js']:
 assert (root/path).read_bytes()==subprocess.check_output(['git','show',f'8fba5b3:{path}'],cwd=root),('unintended modification',path)
print('Tire laws/relaxation, chassis foundation, suspension, constants and presets unchanged')
# Independent total column work closure from initial/final observables.
after=json.loads((folder/'after.json').read_text());I=.08;k=.4
max_closure=0
for r in after['vehicle']:
 a0=.01 if r['scenario']=='release-low' else .3 if r['scenario']=='rest' else .08
 ef=.5*I*r['final']['steerRate']**2+.5*k*r['final']['steer']**2
 residual=ef-.5*k*a0*a0-sum(v for key,v in r['work'].items() if key!='residual')
 max_closure=max(max_closure,abs(residual));assert abs(residual)<1e-8,(r['scenario'],r['hz'],residual)
print('Independent full-run steering work closure, worst J:',max_closure)
# Validate ordinary relative Markdown links (ignore external URLs/anchors).
for file in folder.glob('*.md'):
 for target in re.findall(r'\]\(([^)]+)\)',file.read_text()):
  if '://' in target or target.startswith('#'):continue
  target=target.split('#')[0].split(':')[0]
  assert (file.parent/target).exists(),(file.name,'broken link',target)
manifest=json.loads((folder/'MANIFEST.json').read_text())
assert set(manifest['artifacts'])=={str(f.relative_to(folder)) for f in folder.rglob('*') if f.is_file() and f.name!='MANIFEST.json'},'Manifest file list differs'
for name,digest in manifest['artifacts'].items():assert sha((folder/name).read_bytes())==digest,(name,'artifact hash mismatch')
for name,digest in manifest['sourceFiles'].items():assert sha((root/name).read_bytes())==digest,(name,'final source hash mismatch')
archive=folder.parent/'mission-03.zip'
with zipfile.ZipFile(archive) as z:
 expected={'mission-03/'+str(f.relative_to(folder)) for f in folder.rglob('*') if f.is_file()}
 assert set(z.namelist())==expected,'ZIP file list differs'
 for name in z.namelist():assert z.read(name)==(folder.parent/name).read_bytes(),('ZIP content mismatch',name)
 assert z.testzip() is None
print('Manifest, Markdown links and exact ZIP/unpacked contents verified')
