// Explicit intent-preserving migration: old labeled peaks become real peaks.
// Matching the defective old force curve is intentionally NOT claimed.
import { TIRE_MODEL_VERSION } from './tire-model.js';
export function migrateTireSettings(data) {
  if (![undefined, 1, 2].includes(data.version)) throw Error('Unsupported preset version.');
  if (data.version === 2 && data.tireModelVersion !== TIRE_MODEL_VERSION) throw Error('Unsupported tire model version.');
  if (!data.params || typeof data.params !== 'object' || Array.isArray(data.params)) throw Error('Invalid params section.');
  const params = { ...data.params };
  for (const key of ['pacejkaB', 'pacejkaC']) {
    if (data.version === 2 && Object.hasOwn(params, key)) throw Error('Legacy tire coefficients require a version 1 preset migration.');
    if (Object.hasOwn(params, key) && (typeof params[key] !== 'number' || !Number.isFinite(params[key]))) {
      throw Error(`Invalid legacy tire setting: ${key}`);
    }
    delete params[key];
  }
  const migrated = data.version !== 2;
  return { data: { ...data, version: 2, tireModelVersion: TIRE_MODEL_VERSION, params },
    notice: migrated ? 'Tire model migrated to v2: labeled slip peaks now identify actual peaks; legacy Pacejka B/C are retired. Force behavior changes; old calibration is not preserved.' : '' };
}
