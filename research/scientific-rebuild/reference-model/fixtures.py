"""Independent 70-digit Eq.20 fixtures in dimensionless adhesion fraction form.
No JavaScript calls; no trajectory integration. Reproducible with mpmath.
"""
import json
from pathlib import Path
import mpmath as mp
mp.mp.dps=70
rows=[]
for sx,sy in [('0','0'),('.01','0'),('-.01','0'),('0','.02'),('0','-.02'),('.04','.06'),('-.04','-.06'),('.5','.3')]:
 x,y=mp.mpf(sx),mp.mpf(sy);a=mp.mpf('.1');kx=mp.mpf('4000000');ky=mp.mpf('2000000');fz=mp.mpf('5000');mu0=mp.mpf('.9');mu=mp.mpf('.6')
 b=mp.sqrt(x*x+y*y);k=mp.sqrt((kx*x)**2+(ky*y)**2)
 if not b:fx=fy=mz=mp.mpf(0);branch='adhesion'
 else:
  L=1-2*a*a*k/(3*mu0*fz) # lambda/(2a), not a physical clamp
  if L<=0:fx=mu*fz*x/b;fy=mu*fz*y/b;mz=mp.mpf(0);branch='sliding'
  else:
   fx=2*a*a*L*L*kx*x+(1-L)**2*(1+2*L)*mu*fz*x/b
   fy=2*a*a*L*L*ky*y+(1-L)**2*(1+2*L)*mu*fz*y/b
   mz=mp.mpf(2)/3*a**3*(3-4*L)*L*L*ky*y-3*a*(1-L)**2*L*L*mu*fz*y/b;branch='adhesion'
 rows.append({'slip':[float(x),float(y)],'Fz':5000,'force':[float(fx),float(fy),float(mz)],'branch':branch})
Path(__file__).with_name('fixtures.json').write_text(json.dumps({'method':'70 digit mpmath; dimensionless lambda/(2a), Eq.20','points':rows},indent=2)+'\n')
