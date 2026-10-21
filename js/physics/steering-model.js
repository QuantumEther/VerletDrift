// One effective common road-wheel coordinate (rad, kg m², N m).
// Backward Euler with a Coulomb proximal impulse; event-localized perfectly
// inelastic stops. No rate deadband, corrective torque, or velocity attenuation.
export const STEERING_MODEL_VERSION = 1;
export const DRIVER_NATURAL_FREQUENCY = 40; // s^-1; input actuator, not tire calibration
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function integrateSteering({angle, rate, dt, inertia: I, damping: b,
  friction: C, stiffness: k, limit, tireTorque = 0, externalTorque = 0,
  target = null}) {
  if (![angle,rate,dt,I,b,C,k,limit,tireTorque,externalTorque].every(Number.isFinite)
      || dt <= 0 || I <= 0 || limit <= 0 || Math.min(b,C,k) < 0
      || (target !== null && !Number.isFinite(target))) throw new RangeError('Invalid steering mechanical state/parameters');
  const kp = target === null ? 0 : I * DRIVER_NATURAL_FREQUENCY ** 2;
  const kd = target === null ? 0 : 2 * I * DRIVER_NATURAL_FREQUENCY;
  const goal = target === null ? 0 : clamp(target,-limit,limit);
  const torque = tireTorque + externalTorque;
  const energy = () => .5 * I * rate ** 2 + .5 * k * angle ** 2;
  const ledger = {initialEnergy:energy(), finalEnergy:0, driverWork:0, tireWork:0,
    externalWork:0, viscousWork:0, frictionWork:0, stopWork:0,
    numericalWork:0, configurationWork:0, frictionImpulse:0, stopImpulse:0, residual:0};
  // A live lock reduction is an explicit configuration intervention.
  if (Math.abs(angle) > limit) {
    const before=energy(); angle=clamp(angle,-limit,limit);
    if(rate*Math.sign(angle)>0) rate=0;
    ledger.configurationWork+=energy()-before;
  }
  function candidate(h) {
    const p=I*rate+h*(torque-k*angle+kp*(goal-angle));
    const frictionImpulse=clamp(-p,-h*C,h*C);
    return {rate:(p+frictionImpulse)/(I+h*(b+kd)+h*h*(k+kp)),frictionImpulse};
  }
  function segment(h) {
    const oldRate=rate,oldAngle=angle,c=candidate(h);
    rate=c.rate;angle+=h*rate;
    const displacement=angle-oldAngle;
    ledger.driverWork+=(kp*(goal-angle)-kd*rate)*displacement;
    ledger.tireWork+=tireTorque*displacement;
    ledger.externalWork+=externalTorque*displacement;
    ledger.viscousWork-=b*h*rate**2;
    ledger.frictionWork+=c.frictionImpulse*rate;
    ledger.frictionImpulse+=c.frictionImpulse;
    ledger.numericalWork-=.5*I*(rate-oldRate)**2+.5*k*displacement**2;
  }
  function advance(h, depth=0) {
    const next=candidate(h),end=angle+h*next.rate;
    // Persistent stop contact: friction and the stop share the static load.
    if(Math.abs(angle)>=limit && next.rate*Math.sign(angle)>0) {
      const c=clamp(-h*(torque-k*angle+kp*(goal-angle)),-h*C,h*C);
      ledger.frictionImpulse+=c;
      ledger.stopImpulse-=I*rate+h*(torque-k*angle+kp*(goal-angle))+c;
      ledger.stopWork-=.5*I*rate**2;rate=0;return;
    }
    if(Math.abs(end)<=limit) {segment(h);return;}
    if(depth>=16) throw new Error('Unresolved steering stop events; subdivide timestep');
    const boundary=Math.sign(end)*limit;
    let lo=0,hi=h;
    for(let i=0;i<60;i++) {const mid=(lo+hi)/2,c=candidate(mid);
      if((angle+mid*c.rate-boundary)*Math.sign(boundary)>=0)hi=mid;else lo=mid;}
    segment(hi);angle=boundary;
    ledger.stopImpulse-=I*rate;ledger.stopWork-=.5*I*rate**2;rate=0;
    if(h-hi>h*1e-14)advance(h-hi,depth+1);
  }
  advance(dt);
  ledger.finalEnergy=energy();
  ledger.frictionTorque=ledger.frictionImpulse/dt;
  ledger.residual=ledger.finalEnergy-ledger.initialEnergy-
    (ledger.driverWork+ledger.tireWork+ledger.externalWork+ledger.viscousWork+
     ledger.frictionWork+ledger.stopWork+ledger.numericalWork+ledger.configurationWork);
  return {angle,rate,ledger};
}
