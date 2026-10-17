import { CAR_HALF_WIDTH, CAR_HALF_LENGTH, WHEEL_RADIUS } from '../constants.js';

// Rendering-only switch; disabling this restores the original car and ghosts.
export const vehicleSpriteSettings = { enabled: true };

function loadImage(path) {
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.src = new URL(path, import.meta.url).href;
  return image;
}

const bodyImage = loadImage('../../assets/vehicles/delorean/DeLorean.png');
const wheelImage = loadImage('../../assets/vehicles/delorean/DeLorean_Wheel.png');

// Visible artwork bounds in the original 1254px PNGs, excluding transparent padding.
const BODY_CROP = [284, 26, 687, 1203];
const WHEEL_CROP = [411, 119, 431, 1015];
const WHEEL_LENGTH = WHEEL_RADIUS * 0.85 * 2;
const WHEEL_WIDTH = WHEEL_LENGTH * WHEEL_CROP[2] / WHEEL_CROP[3];
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
    const wheel = pose.wheels[name];
    const image = selectWheelImage(name, pose.wheelOmega?.[name] ?? 0);
    ctx.save();
    ctx.translate(wheel.x, wheel.y);
    ctx.rotate(pose.heading + (isFront ? pose.steerAngle : 0));
    ctx.drawImage(image, ...WHEEL_CROP, -WHEEL_WIDTH / 2, -WHEEL_LENGTH / 2,
      WHEEL_WIDTH, WHEEL_LENGTH);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(pose.cx, pose.cy);
  ctx.rotate(pose.heading);
  ctx.drawImage(bodyImage, ...BODY_CROP, -CAR_HALF_WIDTH, -CAR_HALF_LENGTH,
    CAR_HALF_WIDTH * 2, CAR_HALF_LENGTH * 2);
  if (pose.isStalled) {
    ctx.fillStyle = 'rgba(200, 50, 50, 0.28)';
    ctx.fillRect(-CAR_HALF_WIDTH, -CAR_HALF_LENGTH, CAR_HALF_WIDTH * 2, CAR_HALF_LENGTH * 2);
  }
  ctx.restore();
  return true;
}
