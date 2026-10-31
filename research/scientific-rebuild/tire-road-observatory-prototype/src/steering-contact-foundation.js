// Isolated planar steering/contact fixture. SI units; reference values are
// illustrative, not measured vehicle parameters. Positive lateral displacement
// and positive steering rotation share the same right-handed planar convention.
// The contact point is `trail` behind the steering axis, hence its lateral
// velocity is lateralVelocity - trail * angularVelocity.
import {solveContacts} from './contact-solver.js';

// Virtual-work map shared by the fixture and coupled vehicle solver.
export const trailContactJacobian=(trail,angleJacobian=1)=>-trail*angleJacobian;

export function createSteeringContact({mass=100, inertia=1, trail=.08, damping=1,
  friction=1, stiffness=800, normal=250, mu=.9}={}) {
  const values=[mass,inertia,trail,damping,friction,stiffness,normal,mu];
  if (!values.every(Number.isFinite) || mass<=0 || inertia<=0 || trail<0 ||
      damping<0 || friction<0 || stiffness<=0 || normal<0 || mu<0)
    throw Error('Invalid steering-contact parameters');
  return {mass,inertia,trail,damping,friction,stiffness,normal,mu,
    angle:0,angularVelocity:0,lateralVelocity:0,driverWork:0,dissipation:0,numericalLoss:0};
}

// Backward Euler with a dissipative tire contact and a Coulomb friction
// constraint. The tire force acts on both translation and steering through the
// same Jacobian, so its contact work cannot create energy. This fixture has no
// longitudinal DOF, wheel spin, caster camber, pneumatic trail, or stops.
export function stepSteeringContact(s,{driverTorque=0,lateralForce=0}={},h=.001) {
  if (!(Number.isFinite(h)&&h>0&&Number.isFinite(driverTorque)&&Number.isFinite(lateralForce)))
    throw Error('Invalid steering-contact input');
  const old=[s.lateralVelocity,s.angularVelocity], inv=[1/s.mass,1/(s.inertia+h*s.damping)];
  const inverse=[[inv[0],0],[0,inv[1]]];
  const free=[old[0]+h*lateralForce*inv[0],(s.inertia*old[1]+h*driverTorque)*inv[1]];
  const rows=[{j:[1,trailContactJacobian(s.trail)],compliance:1/(h*s.stiffness)},
    {j:[0,1]}];
  const groups=[{indices:[0],limit:h*s.mu*s.normal},
    {indices:[1],limit:h*s.friction}];
  const result=solveContacts(inverse,free,rows,groups,h);
  const [v,omega]=result.velocity, [contactImpulse,frictionImpulse]=result.z;
  const slip=v-s.trail*omega, tireForce=-contactImpulse/h;
  const tireTorque=-s.trail*tireForce;
  const frictionTorque=-frictionImpulse/h, dampingTorque=-s.damping*omega;
  const energy0=.5*s.mass*old[0]**2+.5*s.inertia*old[1]**2;
  const energy1=.5*s.mass*v*v+.5*s.inertia*omega*omega;
  const work=h*(lateralForce*v+driverTorque*omega);
  const dissipation=h*(-tireForce*slip-frictionTorque*omega-dampingTorque*omega);
  const numericalLoss=.5*s.mass*(v-old[0])**2+.5*s.inertia*(omega-old[1])**2;
  Object.assign(s,{lateralVelocity:v,angularVelocity:omega,angle:s.angle+h*omega,
    driverWork:s.driverWork+work,dissipation:s.dissipation+dissipation,
    numericalLoss:s.numericalLoss+numericalLoss,
    last:{slip,tireForce,tireTorque,frictionTorque,dampingTorque,driverTorque,
      energy0,energy1,work,dissipation,numericalLoss,
      energyResidual:energy1-energy0-work+dissipation+numericalLoss}});
  return s;
}
