import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const root='research/full-system-forensic/data/',s=JSON.parse(readFileSync(root+'summary.json'));
const order=JSON.parse(gunzipSync(readFileSync(root+'order-probe.json.gz'))),yaw=order.columns.indexOf('yaw');
const b=JSON.parse(readFileSync(root+'balloon-probe.json'));
const checks={straightSymmetry:s.scenarios['engine-braking'].input.maxYaw<1e-6,
 rearOrderInvariance:Math.max(...order.normal.rows.map((r,i)=>Math.abs(r[yaw]-order.reversed.rows[i][yaw])))<1e-6,
 passiveSeparatingBalloon:b.kineticChange<=1e-8,
 derivedSpeedAfterBalloon:Math.abs(b.after.cachedSpeed-Math.hypot(b.after.velocityX,b.after.velocityY))<1e-8,
 repeatDeterminism:Object.values(s.branches).every(b=>b.deterministicRepeat),
 finiteScenarios:Object.values(s.scenarios).every(x=>Object.values(x).every(r=>!r.anomalies.length))};
writeFileSync(root+'checks.json',JSON.stringify(checks,null,2));console.log(checks);
if(Object.values(checks).some(x=>!x))process.exitCode=1;
