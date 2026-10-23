import { getVehicleModel } from './vehicle-models.js';

// Optional visual inspection only; world-space coordinates under the same camera.
export function drawVehicleCalibration(ctx, pose) {
  const model=getVehicleModel(pose.modelId), wheels=pose.visualWheels??pose.wheels;
  const scale = pose.viewScale || 20;
  const names = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
  const pairs = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];
  ctx.save();
  ctx.strokeStyle = 'rgba(48,220,255,.85)';
  ctx.fillStyle = '#30dcff';
  ctx.lineWidth = 1.5 / scale;
  for (const [a, b] of pairs) {
    const from = wheels[names[a]], to = wheels[names[b]];
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  }
  ctx.font = `${12 / scale}px monospace`;
  for (const name of names) {
    const wheel = wheels[name];
    ctx.beginPath(); ctx.arc(wheel.x, wheel.y, 3 / scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(name, wheel.x + 5 / scale, wheel.y - 5 / scale);
  }
  ctx.translate(pose.cx, pose.cy);
  ctx.rotate(pose.heading);
  ctx.strokeStyle = '#efc74b';
  ctx.strokeRect(-model.bodyWidth/2,-model.bodyLength/2,model.bodyWidth,model.bodyLength);
  ctx.setLineDash([4 / scale, 3 / scale]);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(model.bodyRect.x,model.bodyRect.y,model.bodyRect.width,model.bodyRect.length);
  ctx.fillStyle = '#efc74b';
  const x = -model.bodyWidth/2, y = -model.bodyLength/2 - 12 / scale;
  ctx.fillText(`Target body ${model.bodyLength.toFixed(3)} x ${model.bodyWidth.toFixed(3)} m`, x, y);
  ctx.fillText(`Wheelbase ${model.wheelbase.toFixed(3)} / tracks ${model.frontTrack.toFixed(3)}/${model.rearTrack.toFixed(3)} m`, x, y - 16 / scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Artwork ${model.bodyRect.length.toFixed(3)} x ${model.bodyRect.width.toFixed(3)} m`, x, y - 32 / scale);
  ctx.restore();
}
