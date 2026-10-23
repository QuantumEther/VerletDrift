import { DELOREAN_GEOMETRY } from '../constants.js';
import { BODY_RECT, getTireSpriteDimensions } from './vehicle-geometry.js';
import { WHEEL_RADIUS } from '../constants.js';

// Visual-only specifications. Local +x points right and +y points rearward;
// originOffset maps the physical COM to each artwork's chosen visual origin.
export const VEHICLE_MODELS = Object.freeze({
  delorean: Object.freeze({
    id: 'delorean', displayName: 'DeLorean DMC-12', artwork: 'delorean',
    bodyArtwork: '../../assets/vehicles/delorean/DeLorean.png', wheelArtwork: '../../assets/vehicles/delorean/DeLorean_Wheel.png',
    bodyWidth: DELOREAN_GEOMETRY.bodyWidth, bodyLength: DELOREAN_GEOMETRY.bodyLength,
    wheelbase: DELOREAN_GEOMETRY.wheelbase, frontTrack: DELOREAN_GEOMETRY.frontTrack, rearTrack: DELOREAN_GEOMETRY.rearTrack,
    originOffset: Object.freeze({ x: 0, y: 0 }), bodyRect: BODY_RECT,
    wheelRotationPivot: 'anchor', steeringPivot: 'anchor', spinAxis: 'lateral',
    wheelAnchors: Object.freeze({
      frontLeft: Object.freeze({ x: -DELOREAN_GEOMETRY.frontTrack / 2, y: -DELOREAN_GEOMETRY.wheelbase / 2 }),
      frontRight: Object.freeze({ x: DELOREAN_GEOMETRY.frontTrack / 2, y: -DELOREAN_GEOMETRY.wheelbase / 2 }),
      rearLeft: Object.freeze({ x: -DELOREAN_GEOMETRY.rearTrack / 2, y: DELOREAN_GEOMETRY.wheelbase / 2 }),
      rearRight: Object.freeze({ x: DELOREAN_GEOMETRY.rearTrack / 2, y: DELOREAN_GEOMETRY.wheelbase / 2 }),
    }),
    frontTire: DELOREAN_GEOMETRY.frontTire, rearTire: DELOREAN_GEOMETRY.rearTire,
  }),
  'bmw-e30-m3': Object.freeze({
    id: 'bmw-e30-m3', displayName: 'BMW E30 M3 · late-1980s road car', artwork: 'bmw-e30-m3',
    bodyArtwork: '../../assets/vehicles/bmw-e30-m3/body.svg', wheelArtwork: '../../assets/vehicles/bmw-e30-m3/wheel.svg',
    // Reference dimensions: 1988 E30 M3, approx. 4.345 x 1.680 m;
    // 2.562 m wheelbase, 1.415/1.430 m front/rear track.
    bodyWidth: 1.680, bodyLength: 4.345, wheelbase: 2.562,
    frontTrack: 1.415, rearTrack: 1.430,
    originOffset: Object.freeze({ x: 0, y: 0 }),
    wheelRotationPivot: 'anchor', steeringPivot: 'anchor', spinAxis: 'lateral',
    bodyRect: Object.freeze({ x: -.840, y: -2.1725, width: 1.680, length: 4.345 }),
    wheelAnchors: Object.freeze({
      frontLeft: Object.freeze({ x: -.7075, y: -1.281 }),
      frontRight: Object.freeze({ x: .7075, y: -1.281 }),
      rearLeft: Object.freeze({ x: -.715, y: 1.281 }),
      rearRight: Object.freeze({ x: .715, y: 1.281 }),
    }),
    frontTire: Object.freeze({ width: .205, diameter: .607 }),
    rearTire: Object.freeze({ width: .205, diameter: .607 }),
  }),
});

export function getVehicleModel(id = 'delorean') {
  return VEHICLE_MODELS[id] ?? VEHICLE_MODELS.delorean;
}

export function visualTireDimensions(modelId, wheelName, radius = WHEEL_RADIUS) {
  const model=getVehicleModel(modelId);
  if(modelId==='delorean')return getTireSpriteDimensions(radius,wheelName);
  const tire=wheelName.startsWith('front')?model.frontTire:model.rearTire;
  const scale=radius/WHEEL_RADIUS;
  return {width:tire.width*scale,length:tire.diameter*scale};
}

const transformedWheelCache = Object.fromEntries(Object.keys(VEHICLE_MODELS.delorean.wheelAnchors)
  .map(name => [name,{x:0,y:0}]));
let cacheKey = '';

export function visualWheelPositions(pose, modelId = 'delorean', wheelPoints = pose.wheels) {
  // Preserve the DeLorean's established live wheel placement exactly; BMW
  // visual anchors remain appearance metadata independent of chassis points.
  if(modelId==='delorean'&&wheelPoints)return wheelPoints;
  const key=`${modelId}:${pose.centerX}:${pose.centerY}:${pose.heading}`;
  if(key===cacheKey)return transformedWheelCache;
  const model = getVehicleModel(modelId), c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  const ox = model.originOffset.x, oy = model.originOffset.y;
  const originX = pose.centerX + ox * c - oy * s;
  const originY = pose.centerY + ox * s + oy * c;
  for(const [name,p]of Object.entries(model.wheelAnchors)){
    transformedWheelCache[name].x=originX+p.x*c-p.y*s;
    transformedWheelCache[name].y=originY+p.x*s+p.y*c;
  }
  cacheKey=key;
  return transformedWheelCache;
}
