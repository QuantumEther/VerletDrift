// Authoritative physical planar geometry. Coordinates use +x to the vehicle's
// right and +y toward its rear; therefore a positive COM offset is forward.
// This is deliberately independent of the DeLorean renderer geometry.

export const DEFAULT_PHYSICAL_VEHICLE_GEOMETRY = Object.freeze({
  // These match Mission 01's symmetric effective chassis. The visual model
  // retains its own measurements and can change independently.
  wheelbase: 2.408,
  frontTrack: 1.589,
  rearTrack: 1.589,
  centerOfMassOffset: 0,
});

const normalized = new WeakMap();
export function physicalGeometry(value = DEFAULT_PHYSICAL_VEHICLE_GEOMETRY) {
  const cacheable = value && typeof value === 'object' && Object.isFrozen(value);
  if (cacheable && normalized.has(value)) return normalized.get(value);
  const { wheelbase, frontTrack, rearTrack, centerOfMassOffset = 0 } = value;
  if (![wheelbase, frontTrack, rearTrack, centerOfMassOffset].every(Number.isFinite)
      || wheelbase <= 0 || frontTrack <= 0 || rearTrack <= 0
      || Math.abs(centerOfMassOffset) >= wheelbase / 2) {
    throw new RangeError('Invalid physical vehicle geometry');
  }
  const frontY = -wheelbase / 2 - centerOfMassOffset;
  const rearY = wheelbase / 2 - centerOfMassOffset;
  const frontStaticLoadFraction = 0.5 - centerOfMassOffset / wheelbase;
  const coordinates = Object.freeze({
    frontLeft: Object.freeze({ x: -frontTrack / 2, y: frontY }),
    frontRight: Object.freeze({ x: frontTrack / 2, y: frontY }),
    rearLeft: Object.freeze({ x: -rearTrack / 2, y: rearY }),
    rearRight: Object.freeze({ x: rearTrack / 2, y: rearY }),
  });
  // Approximate the footprint as a uniform plate about its geometric center,
  // then shift that estimate to the specified COM with the parallel-axis theorem.
  const meanTrack = (frontTrack + rearTrack) / 2;
  const result = Object.freeze({
    wheelbase, frontTrack, rearTrack, centerOfMassOffset, coordinates,
    frontStaticLoadFraction,
    rearStaticLoadFraction: 1 - frontStaticLoadFraction,
    centroidX: 0,
    centroidY: Object.values(coordinates).reduce((sum, p) => sum + p.y, 0) / 4,
    sideLength: Math.hypot(wheelbase, (frontTrack - rearTrack) / 2),
    diagonal: Math.hypot(wheelbase, (frontTrack + rearTrack) / 2),
    yawInertia(massKg) {
      const inertia = massKg * ((wheelbase ** 2 + meanTrack ** 2) / 12
        - centerOfMassOffset ** 2);
      if (!(inertia > 0)) throw new RangeError('Geometry yields nonpositive yaw inertia under the plate approximation');
      return inertia;
    },
  });
  if (cacheable) normalized.set(value, result);
  return result;
}
