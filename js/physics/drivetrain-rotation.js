// Bounded rotational mechanics. Torques/impulses are signed at their own shaft.
// Gearbox housing reactions mean conserved momentum is generalized by ratio.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function gearRatio(gear, p) {
  if (gear === 'N') return 0;
  if (gear === 'R') return -p.gearRatio1 * p.finalDriveRatio;
  return /^[1-6]$/.test(gear) ? p[`gearRatio${gear}`] * p.finalDriveRatio : 0;
}

// Equal/opposite friction impulse, including static hold without slip reversal.
export function frictionImpulse(slip, mobility, capacity, dt) {
  const required = slip / mobility;
  const impulse = clamp(required, -capacity * dt, capacity * dt);
  return { impulse, locked: capacity > 0 && Math.abs(required) <= capacity * dt,
    heat: impulse * slip - .5 * mobility * impulse * impulse };
}

// Inverse of Iw*Identity + Jshaft*g²/4 * ones(2,2).
// Differential motion sees only wheel inertia, never a fictitious half engine.
export function rearMobility(wheelInertia, shaftInertia, g) {
  const common = 1 / (wheelInertia + shaftInertia * g * g / 2);
  const differential = 1 / wheelInertia;
  return { diagonal: (common + differential) / 2,
    offDiagonal: (common - differential) / 2 };
}

export function clutchImpulse(crank, input, Ie, Js, capacity, dt) {
  if(capacity===0)return { impulse:0,heat:0,locked:false,crank,input };
  const result = frictionImpulse(crank - input, 1 / Ie + 1 / Js, capacity, dt);
  return { ...result, crank: crank - result.impulse / Ie,
    input: input + result.impulse / Js };
}

// Three dry-friction constraints (clutch, rear L/R brakes). Enumerate each
// constraint as sticking or sliding in either direction: at most 27 linear
// systems of order <=3, not a nonlinear tire solve or adaptive iteration.
export function clutchBrakeImpulse(e,l,r,Ie,Ji,Iw,g,C,BL,BR,dt) {
  const m=rearMobility(Iw,Ji,g), a=m.diagonal,b=m.offDiagonal,h=g/2;
  const q=[e-h*(l+r),l,r], bounds=[C*dt,BL*dt,BR*dt];
  const A=[[1/Ie+2*h*h*(a+b),-h*(a+b),-h*(a+b)],
    [-h*(a+b),a,b],[-h*(a+b),b,a]];
  for(let code=0;code<27;code++){
    const status=[code%3,Math.floor(code/3)%3,Math.floor(code/9)%3];
    const J=status.map((s,i)=>s===0?0:(s===1?1:-1)*bounds[i]);
    const free=[0,1,2].filter(i=>status[i]===0);
    const mat=free.map(i=>[...free.map(j=>A[i][j]),q[i]-A[i].reduce((sum,x,j)=>sum+x*J[j],0)]);
    for(let k=0;k<free.length;k++){
      const pivot=mat[k][k];
      for(let j=k;j<=free.length;j++)mat[k][j]/=pivot;
      for(let i=0;i<free.length;i++)if(i!==k){
        const scale=mat[i][k];for(let j=k;j<=free.length;j++)mat[i][j]-=scale*mat[k][j];
      }
    }
    free.forEach((i,k)=>{J[i]=mat[k][free.length];});
    const s=q.map((v,i)=>v-A[i].reduce((sum,x,j)=>sum+x*J[j],0));
    if(!J.every((v,i)=>status[i]===0 ? Math.abs(v)<=bounds[i]+1e-10
      : status[i]===1?s[i]>=-1e-10:s[i]<=1e-10))continue;
    const crank=e-J[0]/Ie;
    const left=l+h*(a+b)*J[0]-a*J[1]-b*J[2];
    const right=r+h*(a+b)*J[0]-b*J[1]-a*J[2];
    const heat=J.reduce((sum,v,i)=>sum+v*(q[i]+s[i])/2,0);
    return {crank,left,right,impulse:J[0],brakeLeft:-J[1],brakeRight:-J[2],
      locked:C>0&&status[0]===0,heat};
  }
  throw Error('No admissible drivetrain friction state');
}
