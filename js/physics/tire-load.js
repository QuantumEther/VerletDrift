// Effective peak grip in Newtons. Reference load preserves the nominal tire.
// Exponent < 1 means two unevenly loaded tires offer less combined peak grip.
export function tireGripLimit(load, friction, referenceLoad, sensitivity = 0) {
  if (!(load > 0) || !(friction > 0)) return 0;
  const exponent = 1 - Math.max(0, Math.min(0.3, sensitivity));
  const ratio = load / Math.max(1, referenceLoad);
  // Bound effective friction at very low/high loads; exactly zero at lift-off.
  const loadFactor = Math.max(0.5, Math.min(1.5, ratio ** (exponent - 1)));
  return load * friction * loadFactor;
}
