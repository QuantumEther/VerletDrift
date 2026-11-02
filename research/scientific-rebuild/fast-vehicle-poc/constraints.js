// Exact piecewise-constant-torque Coulomb flow. Wheel order FL FR RL RR engine.
// Rear clutch row J=[-G/2,-G/2,1]; brakes have individual rotor rows.
// No iterative optimizer: one scalar piecewise-linear static reaction equation.
const sign=Math.sign,clamp=(x,b)=>Math.max(-b,Math.min(b,x));
export function reactions(w,T,B,C,{Iw=1,Ie=.3,G=3.5}={}){
 const g=G/2,slip=w[4]-g*(w[2]+w[3]);
 const wheel=(i,c)=>{const t=T[i]+(i>=2?g*c:0);return (t-(w[i]===0?clamp(t,B[i]):sign(w[i])*B[i]))/Iw;};
 const S=c=>(T[4]-c)/Ie-g*(wheel(2,c)+wheel(3,c));
 let clutch=0;
 if(C>0){
  if(slip!==0)clutch=sign(slip)*C;
  else if(S(C)>=0)clutch=C;
  else if(S(-C)<=0)clutch=-C;
  else{
   const breaks=[-C,C];for(const i of [2,3])if(w[i]===0)for(const b of [-B[i],B[i]]){const x=(b-T[i])/g;if(x>-C&&x<C)breaks.push(x);}
   breaks.sort((a,b)=>a-b);
   for(let j=0;j<breaks.length-1;j++){
    const lo=breaks[j],hi=breaks[j+1],a=S(lo),b=S(hi);
    if(a>=0&&b<=0){const mid=(lo+hi)/2;let numerator=T[4]/Ie,denominator=1/Ie;
     for(const i of [2,3]){const drive=T[i]+g*mid;if(w[i]!==0||Math.abs(drive)>B[i]){const brake=w[i]===0?sign(drive)*B[i]:sign(w[i])*B[i];numerator-=g*(T[i]-brake)/Iw;denominator+=g*g/Iw;}}
     clutch=Math.max(lo,Math.min(hi,numerator/denominator));break;}
   }
  }
 }
 const acceleration=[...Array.from({length:4},(_,i)=>wheel(i,clutch)),(T[4]-clutch)/Ie];
 const brakes=acceleration.slice(0,4).map((a,i)=>T[i]+(i>=2?g*clutch:0)-Iw*a);
 return {acceleration,brakes,clutch,slip,slipAcceleration:acceleration[4]-g*(acceleration[2]+acceleration[3])};
}
export function rotorFlow(initial,T,B,C,h,p={}){
 const {Iw=1,Ie=.3,G=3.5}=p,g=G/2,m=[Iw,Iw,Iw,Iw,Ie];
 if(!(h>=0&&Number.isFinite(h))||![...initial,...T,...B,C,Iw,Ie,G].every(Number.isFinite)||B.some(x=>x<0)||C<0||Iw<=0||Ie<=0||G<=0)throw Error('Invalid rotor problem');
 let w=initial.slice(),remaining=h,segments=0,brakeHeat=0,clutchHeat=0,roundingEnergy=0,roundingVelocityMax=0;
 const integral=Array(5).fill(0),brakeImpulse=Array(4).fill(0);let clutchImpulse=0;
 while(remaining>0){
  if(++segments>16)throw Object.assign(Error('Rotor event budget exceeded'),{w,T,B,C,remaining,initial});
  const r=reactions(w,T,B,C,p),a=r.acceleration,events=[];
  for(let i=0;i<4;i++)if(w[i]*a[i]<0&&B[i]>0)events.push({t:-w[i]/a[i],i});
  if(C>0&&r.slip*r.slipAcceleration<0)events.push({t:-r.slip/r.slipAcceleration,i:4});
  const dt=Math.min(remaining,...events.map(e=>e.t));
  if(!(dt>0))throw Error('Nonpositive rotor event time');
  const next=w.map((v,i)=>v+dt*a[i]),average=w.map((v,i)=>(v+next[i])/2);
  for(let i=0;i<5;i++)integral[i]+=dt*average[i];
  for(let i=0;i<4;i++){brakeHeat+=dt*r.brakes[i]*average[i];brakeImpulse[i]+=dt*r.brakes[i];}
  clutchHeat+=dt*r.clutch*(average[4]-g*(average[2]+average[3]));clutchImpulse+=dt*r.clutch;
  // Canonicalize only roots and maintained linear constraints, at roundoff scale.
  const raw=next.slice();
  const before=next.reduce((e,x,i)=>e+.5*m[i]*x*x,0);
  const zeroMask=w.slice(0,4).map((v,i)=>v===0&&a[i]===0);
  let clutchRoot=false;for(const e of events)if(Math.abs(e.t-dt)<=32*Number.EPSILON*Math.max(h,dt)){if(e.i===4)clutchRoot=true;else {next[e.i]=0;zeroMask[e.i]=true;}}
  const scale=1+Math.max(...a.map(Math.abs));
  if(clutchRoot||(C>0&&r.slip===0&&Math.abs(r.slipAcceleration)<=64*Number.EPSILON*scale)){
   const residual=next[4]-g*(next[2]+next[3]);
   const inverseMass=1/Ie+[2,3].reduce((sum,i)=>sum+(zeroMask[i]?0:g*g/Iw),0);
   const impulse=residual/inverseMass;
   for(const i of [2,3])if(!zeroMask[i])next[i]+=g*impulse/Iw;
   next[4]-=impulse/Ie;
   // Only a roundoff canonicalization of an analytically maintained/rooted row.
   // Zero wheel constraints participate in this projection; never resuscitate them.
   next[4]=g*(next[2]+next[3]);
  }
  const correction=Math.max(...next.map((v,i)=>Math.abs(v-raw[i])));
  if(correction>128*Number.EPSILON*(1+Math.max(...w.map(Math.abs),...raw.map(Math.abs))))throw Error('Non-roundoff rotor projection rejected');
  roundingVelocityMax=Math.max(roundingVelocityMax,correction);
  roundingEnergy+=next.reduce((e,x,i)=>e+.5*m[i]*x*x,0)-before;
  w=next;remaining=dt===remaining?0:remaining-dt;
 }
 const delta=w.reduce((e,x,i)=>e+.5*m[i]*(x*x-initial[i]**2),0),work=T.reduce((e,x,i)=>e+x*integral[i],0),residual=delta-work+brakeHeat+clutchHeat-roundingEnergy;
 const kineticScale=initial.reduce((e,x,i)=>e+.5*m[i]*x*x,0)+w.reduce((e,x,i)=>e+.5*m[i]*x*x,0);
 const tolerance=128*Number.EPSILON*(1+kineticScale+Math.abs(work)+Math.abs(brakeHeat)+Math.abs(clutchHeat));
 if(brakeHeat < -tolerance||clutchHeat < -tolerance||Math.abs(residual)>tolerance||Math.abs(roundingEnergy)>tolerance)throw Object.assign(Error('Rotor work check failed'),{residual,tolerance,brakeHeat,clutchHeat,roundingEnergy,initial,w,T,B,C,segments});
 const end=reactions(w,T,B,C,p);
 return {w,integral,brakeHeat,clutchHeat,brakeImpulse,clutchImpulse,segments,residual,roundingEnergy,roundingVelocityMax,
  clutchMode:C===0?'open':w[4]===g*(w[2]+w[3])&&Math.abs(end.slipAcceleration)<=64*Number.EPSILON*(1+Math.max(...end.acceleration.map(Math.abs)))?'locked':'slipping',
  brakeModes:w.slice(0,4).map((v,i)=>B[i]===0?'open':v===0&&end.acceleration[i]===0?'holding':'slipping')};
}
