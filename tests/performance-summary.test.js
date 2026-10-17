import { it, expect } from 'vitest';
import { distribution } from '../js/diagnostics/performance-capture.js';
it('reports frame-time tails and excludes missing/unsupported GPU measurements', () => {
  expect(distribution([null,undefined,NaN,Infinity])).toBeNull();
  const times=Array.from({length:100},(_,i)=>i+1);
  const result=distribution([...times,null]);
  expect(result.samples).toBe(100);
  expect(result.median).toBe(50);
  expect(result.p95).toBe(95);
  expect(result.p99).toBe(99);
  expect(result.max).toBe(100);
  expect(result.mean).toBe(50.5);
});
