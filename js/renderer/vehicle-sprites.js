import { BODY_CROP, WHEEL_CROP, BODY_RECT, getTireSpriteDimensions } from './vehicle-geometry.js';
import { drawVehicleCalibration } from './vehicle-calibration.js';

// Rendering-only switch; disabling this restores the original car and ghosts.
export const vehicleSpriteSettings = {
  enabled: true,
  calibration: typeof location !== 'undefined' && new URLSearchParams(location.search).get('vehicleCalibration') === '1',
};

function loadImage(path) {
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.src = new URL(path, import.meta.url).href;
  return image;
}

const bodyImage = loadImage('../../assets/vehicles/delorean/DeLorean.png');
const wheelImage = loadImage('../../assets/vehicles/delorean/DeLorean_Wheel.png');

const WHEELS = [
  ['frontLeft', true], ['frontRight', true],
  ['rearLeft', false], ['rearRight', false],
];

const ready = image => image?.complete && image.naturalWidth > 0;

// Future motion sprites can be selected using this wheel's angular speed (rad/s).
function selectWheelImage(_name, _angularSpeed) {
  return wheelImage;
}

// Coordinates are already in world metres under the existing camera transform.
// Returns false until BOTH images load, so a failed asset keeps the full old car.
export function drawVehicleSprites(ctx, pose) {
  if (!vehicleSpriteSettings.enabled || !ready(bodyImage) || !ready(wheelImage)) return false;

  for (const [name, isFront] of WHEELS) {
    const tire = getTireSpriteDimensions(pose.wheelRadius, name);
    const wheel = pose.wheels[name];
    const image = selectWheelImage(name, pose.wheelOmega?.[name] ?? 0);
    ctx.save();
    ctx.translate(wheel.x, wheel.y);
    ctx.rotate(pose.heading + (isFront ? pose.steerAngle : 0));
    ctx.drawImage(image, ...WHEEL_CROP, -tire.width / 2, -tire.length / 2,
      tire.width, tire.length);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(pose.cx, pose.cy);
  ctx.rotate(pose.heading);
  ctx.drawImage(bodyImage, ...BODY_CROP, BODY_RECT.x, BODY_RECT.y, BODY_RECT.width, BODY_RECT.length);
  if (pose.isStalled) {
    ctx.fillStyle = 'rgba(200, 50, 50, 0.28)';
    ctx.fillRect(BODY_RECT.x, BODY_RECT.y, BODY_RECT.width, BODY_RECT.length);
  }
  ctx.restore();
  if (vehicleSpriteSettings.calibration && !pose.isGhost) drawVehicleCalibration(ctx, pose);
  return true;
}
