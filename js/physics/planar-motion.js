// Read the three rigid planar degrees of freedom from the two stored poses.
// Histories encode center velocity and finite angular displacement, not four
// independent tangent velocities. The interval belongs to the HISTORY: a new
// integration dt must never reinterpret an old displacement.
import { physicsState as state } from '../state.js';
import { physicalGeometry } from './vehicle-geometry.js';

export function readPlanarMotion(fallbackDt) {
  if (!(fallbackDt > 0) || !Number.isFinite(fallbackDt)) {
    throw new RangeError('Mechanical timestep must be finite and positive');
  }
  const wheels = state.wheels;
  const geometry = physicalGeometry(state.physicalGeometry);
  const dt = state.body.historyDt ?? fallbackDt;
  let centerX = 0, centerY = 0, previousCenterX = 0, previousCenterY = 0;
  for (const wheel of Object.values(wheels)) {
    centerX += wheel.x * 0.25;
    centerY += wheel.y * 0.25;
    previousCenterX += wheel.prevX * 0.25;
    previousCenterY += wheel.prevY * 0.25;
  }
  const axisX = wheels.frontLeft.x + wheels.frontRight.x - wheels.rearLeft.x - wheels.rearRight.x;
  const axisY = wheels.frontLeft.y + wheels.frontRight.y - wheels.rearLeft.y - wheels.rearRight.y;
  const previousAxisX = wheels.frontLeft.prevX + wheels.frontRight.prevX - wheels.rearLeft.prevX - wheels.rearRight.prevX;
  const previousAxisY = wheels.frontLeft.prevY + wheels.frontRight.prevY - wheels.rearLeft.prevY - wheels.rearRight.prevY;
  // atan2(cross, dot) gives the signed finite rotation between the two poses.
  // As with any two-pose history, angular increments must be smaller than pi.
  const angle = Math.atan2(previousAxisX * axisY - previousAxisY * axisX,
    previousAxisX * axisX + previousAxisY * axisY);
  const heading = Math.atan2(axisY, axisX) + Math.PI * 0.5;
  const centroidX = geometry.centroidX, centroidY = geometry.centroidY;
  const c = Math.cos(heading), s = Math.sin(heading);
  const previousHeading = heading - angle;
  const pc = Math.cos(previousHeading), ps = Math.sin(previousHeading);
  centerX -= c * centroidX - s * centroidY;
  centerY -= s * centroidX + c * centroidY;
  previousCenterX -= pc * centroidX - ps * centroidY;
  previousCenterY -= ps * centroidX + pc * centroidY;
  return { centerX, centerY, heading,
    velocityX: (centerX - previousCenterX) / dt,
    velocityY: (centerY - previousCenterY) / dt,
    angularVelocity: angle / dt };
}
