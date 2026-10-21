// Exact affine spring/damper motion between Coulomb zero-rate and stop events.
// One effective common road-wheel coordinate: rad, kg m², N m.
export const STEERING_MODEL_VERSION = 1;
export const DRIVER_NATURAL_FREQUENCY = 40; // s^-1; declared input response
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function linearMotion(angle,rate,h,I,B,K,F) {
  const gamma=B/I,w2=K/I;
  // Taylor increments avoid cancellation of equilibrium/step-force terms.
  if(h*Math.max(gamma,Math.sqrt(w2))<.1) {
    let da=rate,dw=(F-B*rate-K*angle)/I,factor=h,a=angle,w=rate;
    for(let n=1;n<=18;n++) {
      a+=factor*da;w+=factor*dw;
      const next=-w2*da-gamma*dw;da=dw;dw=next;if(da===0 && dw===0)break;factor*=h/(n+1);
    }
    return {angle:a,rate:w};
  }
  if(K===0) {
    if(B===0)return {angle:angle+h*rate+.5*F/I*h*h,rate:rate+F/I*h};
    const x=gamma*h,one=-Math.expm1(-x),accel=(F-B*rate)/I;
    return {angle:angle+rate*h+accel*h*h*(x-one)/(x*x),rate:rate+accel*h*one/x};
  }
  const a=gamma/2,disc=a*a-w2;
  let e00,e01,e11,oneMinus;
  if(disc>0) {
    const d=Math.sqrt(disc),slow=-w2/(a+d),fast=-a-d,den=slow-fast;
    const es=Math.exp(slow*h),ef=Math.exp(fast*h);
    e00=(-fast*es+slow*ef)/den;e01=es*(-Math.expm1(-den*h))/den;
    e11=(slow*es-fast*ef)/den;
    oneMinus=(fast*Math.expm1(slow*h)-slow*Math.expm1(fast*h))/den;
  } else {
    const d=Math.sqrt(-disc),e=Math.exp(-a*h),s=d===0?h:Math.sin(d*h)/d,c=Math.cos(d*h);
    e00=e*(c+a*s);e01=e*s;e11=e*(c-a*s);oneMinus=1-e00;
  }
  return {angle:e00*angle+e01*rate+F/K*oneMinus,rate:e11*rate+e01*(F/I-w2*angle)};
}
export function integrateSteering({angle,rate,dt,inertia:I,damping:b,friction:C,
  stiffness:k,limit,tireTorque=0,externalTorque=0,target=null}) {
  if(![angle,rate,dt,I,b,C,k,limit,tireTorque,externalTorque].every(Number.isFinite)
    ||dt<=0||I<=0||limit<=0||Math.min(b,C,k)<0||(target!==null&&!Number.isFinite(target)))
    throw new RangeError('Invalid steering mechanical state/parameters');
  const kp=target===null?0:I*DRIVER_NATURAL_FREQUENCY**2;
  const kd=target===null?0:2*I*DRIVER_NATURAL_FREQUENCY;
  const goal=target===null?0:clamp(target,-limit,limit),K=k+kp,B=b+kd;
  const applied=tireTorque+externalTorque+kp*goal;
  const energy=()=>.5*I*rate*rate+.5*k*angle*angle;
  const ledger={initialEnergy:energy(),finalEnergy:0,driverWork:0,tireWork:0,externalWork:0,
    viscousWork:0,frictionWork:0,stopWork:0,numericalWork:0,configurationWork:0,
    frictionImpulse:0,stopImpulse:0,residual:0};
  if(Math.abs(angle)>limit) {const old=energy();angle=clamp(angle,-limit,limit);if(rate*Math.sign(angle)>0)rate=0;ledger.configurationWork+=energy()-old;}
  function impact() {ledger.stopImpulse-=I*rate;ledger.stopWork-=.5*I*rate*rate;rate=0;}
  function segment(h,sign) {
    const a0=angle,w0=rate,F=applied-C*sign;
    const next=linearMotion(angle,rate,h,I,B,K,F);angle=next.angle;rate=next.rate;
    const displacement=angle-a0,potentialChange=.5*K*(angle-a0)*(angle+a0);
    let damperLoss=0;
    if(B>0) {
      if(h*Math.max(B/I,Math.sqrt(K/I))<.001) {
        // Three-point Gauss integration of omega² is accurate beyond roundoff
        // on these short analytic segments, without energy subtraction.
        const z=Math.sqrt(3/5),nodes=[(1-z)/2,.5,(1+z)/2],weights=[5/18,4/9,5/18];
        damperLoss=B*h*nodes.reduce((sum,x,j)=>sum+weights[j]*linearMotion(a0,w0,h*x,I,B,K,F).rate**2,0);
      } else {
        // Integrated affine-ODE identity: B integral(omega² dt).
        damperLoss=F*displacement-.5*I*(rate-w0)*(rate+w0)-potentialChange;
        if(damperLoss < -1e-11*(1+Math.abs(F*displacement)+I*w0*w0+K*a0*a0))
          throw new Error('Invalid analytic steering dissipation');
        damperLoss=Math.max(0,damperLoss); // only roundoff in the diagnostic
      }
    }
    ledger.driverWork+=kp*goal*displacement-.5*kp*(angle-a0)*(angle+a0)-(B>0?kd/B*damperLoss:0);
    ledger.tireWork+=tireTorque*displacement;ledger.externalWork+=externalTorque*displacement;
    ledger.viscousWork-=B>0?b/B*damperLoss:0;
    ledger.frictionWork-=C*sign*displacement;ledger.frictionImpulse-=h*C*sign;
  }
  const wd=Math.sqrt(Math.max(0,K/I-(B/(2*I))**2));
  const phaseStep=wd>0?Math.PI/(2*wd):dt;
  let remaining=dt,events=0;
  while(remaining>dt*1e-14) {
    if(++events>128)throw new Error('Unresolved steering events; subdivide timestep');
    const net=applied-K*angle;
    if(Math.abs(angle)>=limit && rate*Math.sign(angle)>0)impact();
    if(rate===0) {
      if(Math.abs(angle)>=limit && net*Math.sign(angle)>C) {
        const frictionTorque=clamp(-net,-C,C);
        ledger.frictionImpulse+=frictionTorque*remaining;
        ledger.stopImpulse-=(net+frictionTorque)*remaining;break;
      }
      if(Math.abs(net)<=C) {ledger.frictionImpulse-=net*remaining;break;}
    }
    const sign=rate===0?Math.sign(net):Math.sign(rate),F=applied-C*sign;
    let h=Math.min(remaining,phaseStep),next=linearMotion(angle,rate,h,I,B,K,F),zero=false;
    // A quarter oscillation contains at most one velocity zero. Overdamped
    // affine motion has at most one. Localize it before changing friction sign.
    if(rate!==0 && rate*next.rate<0) {
      let lo=0,hi=h;
      for(let j=0;j<60;j++){const mid=(lo+hi)/2,r=linearMotion(angle,rate,mid,I,B,K,F).rate;if(r*rate<=0)hi=mid;else lo=mid;}
      h=hi;next=linearMotion(angle,rate,h,I,B,K,F);zero=true;
    }
    if(Math.abs(next.angle)>limit) {
      const boundary=Math.sign(next.angle)*limit;let lo=0,hi=h;
      for(let j=0;j<60;j++){const mid=(lo+hi)/2,a=linearMotion(angle,rate,mid,I,B,K,F).angle;if((a-boundary)*Math.sign(boundary)>=0)hi=mid;else lo=mid;}
      segment(hi,sign);angle=boundary;impact();remaining-=hi;
    } else {segment(h,sign);remaining-=h;if(zero)rate=0;}
  }
  ledger.finalEnergy=energy();ledger.frictionTorque=ledger.frictionImpulse/dt;
  ledger.residual=ledger.finalEnergy-ledger.initialEnergy-(ledger.driverWork+ledger.tireWork+
    ledger.externalWork+ledger.viscousWork+ledger.frictionWork+ledger.stopWork+ledger.numericalWork+ledger.configurationWork);
  return {angle,rate,ledger};
}
