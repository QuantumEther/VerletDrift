"""Compare measured final states with immutable Mission 12 long-run data.
JSON numbers do not preserve signed zero; only contact-replay/tire-baseline
make bit-exact claims. Each metric retains its own physical units.
"""
import json,gzip
from pathlib import Path
base=Path(__file__).resolve().parents[1]/'results'
def read(folder,name):return json.loads(gzip.decompress((base/folder/(name+'.json.gz')).read_bytes()))['runs']
old=read('tire-strategy-ab','vehicle')+read('tire-strategy-ab','drift')+read('tire-strategy-ab','cornering')
new=read('contact-optimization','vehicle-long')+read('contact-optimization','vehicle-cornering')
results=[]
for run in new:
 reference=next(r for r in old if all(r[k]==run[k] for k in ['scenario','h','floor','id']))
 a,b=reference['final'],run['final']
 q=lambda key:max(abs(x-y) for x,y in zip(a['vertical'][key],b['vertical'][key]))
 force=max(abs(a['wheels'][i][k]-b['wheels'][i][k]) for i in range(4) for k in ['fx','fy','normal'])
 results.append({'scenario':run['scenario'],'h':run['h'],'floor':run['floor'],'id':run['id'],'fault':run['fault'],'sameJSONFinalState':a==b,'position_m':max(abs(a['planar'][k]-b['planar'][k]) for k in ['x','y']),'velocity_m_s':max(abs(a['planar'][k]-b['planar'][k]) for k in ['u','v']),'yaw_rad_s':abs(a['planar']['r']-b['planar']['r']),'heading_rad':abs(a['planar']['heading']-b['planar']['heading']),'vertical_wheel_position_m':max(abs(a['vertical']['q'][i]-b['vertical']['q'][i]) for i in [0,3,4,5,6]),'attitude_rad':max(abs(a['vertical']['q'][i]-b['vertical']['q'][i]) for i in [1,2]),'vertical_wheel_velocity_m_s':max(abs(a['vertical']['v'][i]-b['vertical']['v'][i]) for i in [0,3,4,5,6]),'attitude_rate_rad_s':max(abs(a['vertical']['v'][i]-b['vertical']['v'][i]) for i in [1,2]),'force_N':force,'wheel_speed_rad_s':max(abs(a['wheels'][i]['omega']-b['wheels'][i]['omega']) for i in range(4)),'engine_speed_rad_s':abs(a['flywheel']['omega']-b['flywheel']['omega']),'steering_rad':abs(a['steering']['wheelAngle']-b['steering']['wheelAngle']),'clutchHeat_J':abs(a['flywheel']['heat']-b['flywheel']['heat']),'energyResidual_J':run['energy'],'constitutiveResidual_Ns':run['constitutive']})
print(json.dumps({'comparison':'Full measured final states vs Mission 12. JSON equality is not a signed-zero-preserving bit comparison.','cases':results},indent=2))
