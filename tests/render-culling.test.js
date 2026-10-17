import { it, expect } from 'vitest';
import { isInView } from '../js/renderer/view.js';
it('retains quads crossing each edge and excludes fully offscreen quads', () => {
  const view = {x:100,y:-40};
  expect(isInView(111,-40,2,1,view,10,8)).toBe(true);
  expect(isInView(89,-40,2,1,view,10,8)).toBe(true);
  expect(isInView(100,-31.5,2,1,view,10,8)).toBe(true);
  expect(isInView(100,-48.5,2,1,view,10,8)).toBe(true);
  expect(isInView(113,-40,2,1,view,10,8)).toBe(false);
  expect(isInView(100,-30,2,1,view,10,8)).toBe(false);
});
