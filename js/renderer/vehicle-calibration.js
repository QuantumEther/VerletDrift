import { CAR_HALF_WIDTH, CAR_HALF_LENGTH } from '../constants.js';
import { BODY_ENVELOPE, BODY_RECT } from './vehicle-geometry.js';

// Optional visual inspection only; world-space coordinates under the same camera.
export function drawVehicleCalibration(ctx, pose) {
  const scale = pose.viewScale || 20;
  const names = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  ctx.save();
  ctx.strokeStyle = 'rgba(48,220,255,.85)';
  ctx.fillStyle = '#30dcff';
  ctx.lineWidth = 1.5 / scale;
  for (const [a, b] of pairs) {
    const from = pose.wheels[names[a]], to = pose.wheels[names[b]];
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  }
  ctx.font = `${12 / scale}px monospace`;
  for (const name of names) {
    const wheel = pose.wheels[name];
    ctx.beginPath(); ctx.arc(wheel.x, wheel.y, 3 / scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(name, wheel.x + 5 / scale, wheel.y - 5 / scale);
  }
  ctx.translate(pose.cx, pose.cy);
  ctx.rotate(pose.heading);
  ctx.strokeStyle = '#efc74b';
  ctx.strokeRect(BODY_ENVELOPE.x, BODY_ENVELOPE.y, BODY_ENVELOPE.width, BODY_ENVELOPE.length);
  ctx.setLineDash([4 / scale, 3 / scale]);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(BODY_RECT.x, BODY_RECT.y, BODY_RECT.width, BODY_RECT.length);
  ctx.fillStyle = '#efc74b';
  const x = BODY_ENVELOPE.x, y = BODY_ENVELOPE.y - 12 / scale;
  ctx.fillText(`Target body ${BODY_ENVELOPE.length.toFixed(3)} x ${BODY_ENVELOPE.width.toFixed(3)} m`, x, y);
  ctx.fillText(`Wheelbase ${(CAR_HALF_LENGTH * 2).toFixed(3)} / track ${(CAR_HALF_WIDTH * 2).toFixed(3)} m`, x, y - 16 / scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Undistorted art ${BODY_RECT.length.toFixed(3)} x ${BODY_RECT.width.toFixed(3)} m`, x, y - 32 / scale);
  ctx.restore();
}
