export function createSuspension({mass=40, stiffness=4000, damping=160, freeLength=0.6, gravity=9.81}={}) {
  const equilibrium=freeLength-mass*gravity/stiffness;
  if (!(mass>0 && stiffness>0 && damping>=0 && equilibrium>0)) throw new RangeError('Invalid suspension configuration');
  return {mass,stiffness,damping,freeLength,gravity,equilibrium,z:equilibrium,velocity:0};
}
export function suspensionDiagnostics(s) {
  const compression=s.freeLength-s.z, spring=s.stiffness*compression, damper=-s.damping*s.velocity;
  return {compression,spring,damper,supportReaction:-(spring+damper),springEnergy:0.5*s.stiffness*compression**2,kineticEnergy:0.5*s.mass*s.velocity**2,gravityEnergy:s.mass*s.gravity*s.z};
}
export function stepSuspension(s,h) {
  // Implicit midpoint: bounded, second-order, and energy preserving at c=0.
  const a=s.stiffness/s.mass, b=s.damping/s.mass, q=s.z-s.equilibrium;
  const v=(s.velocity*(1-b*h/2-a*h*h/4)-a*h*q)/(1+b*h/2+a*h*h/4);
  s.z+=h*(s.velocity+v)/2; s.velocity=v;
}
