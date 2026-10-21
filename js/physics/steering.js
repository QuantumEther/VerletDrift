// Effective common road-wheel steering, including a finite driver impedance.
import { physicsState as state } from '../state.js';
import { integrateSteering } from './steering-model.js';
const MAX_VISUAL_WHEEL_ANGLE_RAD = Math.PI * 2.5;
export function steeringIntegrationInput(dt) {
  const s=state.steering,p=state.params;
  if(s.isDragging && s.targetWheelAngle === null)s.targetWheelAngle=s.wheelAngle;
  return {angle:s.frontWheelAngle,rate:s.angularVelocity,dt,
    inertia:p.steeringColumnInertia,damping:p.steeringViscousDamping,
    friction:p.steeringCoulombFriction,stiffness:p.steeringColumnInertia*p.steeringSelfCenterRate,
    limit:p.maxFrontWheelAngle,
    target:s.isDragging ? (s.targetWheelAngle ?? s.wheelAngle)/MAX_VISUAL_WHEEL_ANGLE_RAD*p.maxFrontWheelAngle : null};
}
export function commitSteering(next,dt) {
  const s=state.steering,p=state.params,I=p.steeringColumnInertia,k=I*p.steeringSelfCenterRate;
  const previousRate=s.angularVelocity;
  // Live inertia/stiffness edits supply/remove stored energy explicitly.
  // This history is an energy-accounting cache, never a dynamics input.
  if(s.energyParameters) {
    const old=s.energyParameters;
    const work=.5*(I-old.inertia)*s.angularVelocity**2+.5*(k-old.stiffness)*s.frontWheelAngle**2;
    next.ledger.initialEnergy-=work;next.ledger.configurationWork+=work;
  }
  s.energyParameters={inertia:I,stiffness:k};
  s.frontWheelAngle=next.angle;s.angularVelocity=next.rate;s.ledger=next.ledger;
  // The asynchronous input target is distinct from the interpolated HUD.
  if(!s.isDragging)s.targetWheelAngle=null;
  s.wheelAngle=s.frontWheelAngle/p.maxFrontWheelAngle*MAX_VISUAL_WHEEL_ANGLE_RAD;
  s.prevAngularVelocity=previousRate;
  s.angularAcceleration=(s.angularVelocity-previousRate)/dt;
  s.angularJerk=(s.angularAcceleration-(s.prevAngularAcceleration??0))/dt;
  s.prevAngularAcceleration=s.angularAcceleration;
}

export function updateSteering(dt) {
  commitSteering(integrateSteering({...steeringIntegrationInput(dt),
    tireTorque:-state.steering.selfAligningTorque}),dt);
}
