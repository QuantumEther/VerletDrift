import { PIXELS_PER_METER } from '../constants.js';

// Effective world-space camera shared by Canvas and GPU. Positive shake moves
// world graphics right/down, so the sampling camera moves in the opposite direction.
export function getViewCamera(camera, shake) {
  const active = shake.magnitude > 0.001;
  return {
    x: camera.x - (active ? shake.shakeX : 0),
    y: camera.y - (active ? shake.shakeY : 0),
  };
}
// Legacy tile-size setting is authored in pixels at the default scale. Convert
// once to metres so changing pixelsPerMeter zooms the grid along with the car.
export function getCheckerTileMetres(tilePixels = 80) {
  return tilePixels / PIXELS_PER_METER;
}

