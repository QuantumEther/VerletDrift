import { test, expect } from '@playwright/test';

// Actual application, real mouse/keyboard events; only RAF timestamps are controlled.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let queued = [];
    window.requestAnimationFrame = callback => { queued.push(callback); return queued.length; };
    window.__frame = time => { const callbacks = queued; queued = []; for (const cb of callbacks) cb(time); };
    window.__keys = [];
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyR') __keys.push({ prevented: e.defaultPrevented,
        held: Boolean(window.state?.input.heldKeys.KeyR), command: window.state?.engine.command });
    });
  });
  await page.goto('/?renderer=canvas&debugMode=quiet');
  await page.waitForFunction(() => Boolean(window.state), {}, { polling: 50 });
  await page.evaluate(() => { __frame(1000); __frame(1011); });
});
const read = page => page.evaluate(() => ({ command: state.steering.wheelAngle,
  angle: state.steering.frontWheelAngle, velocity: state.steering.angularVelocity,
  time: state.loop.simulationTime, dragging: state.steering.isDragging }));
async function point(page) {
  await page.locator('#simCanvas').scrollIntoViewIfNeeded();
  const b = await page.locator('#simCanvas').boundingBox();
  return { x: b.x + 100, y: b.y + 100 };
}
for (const hz of [60, 120, 240]) test(`pending command survives ${hz} Hz rendering with D/S/A and gear input`, async ({ page }) => {
  const { x, y } = await point(page);
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' });
  await page.mouse.move(x + 30, y);
  for (const key of ['KeyD', 'KeyS', 'KeyA']) await page.keyboard.down(key);
  await page.keyboard.press('Digit2');
  const pending = await read(page);
  // Exact original failure sequence, extended to several render-only frames.
  for (const time of [1012, 1013, 1014]) {
    await page.evaluate(t => __frame(t), time);
    expect((await read(page)).command).toBe(pending.command);
    expect((await read(page)).time).toBe(pending.time);
  }
  for (let n = 1; n <= 8; n++) {
    await page.evaluate(t => __frame(t), 1014 + n * 1000 / hz);
    expect((await read(page)).command).toBe(pending.command);
    const current = await read(page);
    expect(current.angle).toBeCloseTo(current.time > pending.time ? .104 : 0, 12);
  }
  expect(await page.evaluate(() => [state.input.throttleKeyHeld, state.input.brakeKeyHeld,
    state.input.clutchKeyHeld, state.engine.requestedGear])).toEqual([true, true, true, '2']);
});
for (const angle of [-.52, -.2, 0, .2, .52]) test(`regrab continuous at ${angle} rad and release`, async ({ page }) => {
  const { x, y } = await point(page);
  await page.evaluate(a => Object.assign(state.steering, { frontWheelAngle: a,
    wheelAngle: a / state.params.maxFrontWheelAngle * Math.PI * 2.5,
    angularVelocity: 0, selfAligningTorque: 0, isDragging: false }), angle);
  // Stale snapshots differ deliberately: render must restore actual live angle.
  await page.evaluate(() => __frame(1012));
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' });
  expect((await read(page)).command).toBeCloseTo(angle / .52 * Math.PI * 2.5, 12);
  const direction = angle === .52 ? -1 : 1;
  await page.mouse.move(x + direction, y);
  await page.evaluate(async () => (await import('/js/physics/steering.js')).updateSteering(.01));
  const after = await read(page), expected = Math.min(.52, Math.max(-.52, angle + direction * .52 / 150));
  expect(after.angle).toBeCloseTo(expected, 12);
  expect(after.velocity).toBeCloseTo((expected - angle) / .01, 12);
  await page.mouse.up({ button: 'right' });
  expect((await read(page)).velocity).toBe(after.velocity);
  await page.evaluate(async () => (await import('/js/physics/steering.js')).updateSteering(.01));
  expect(Math.abs((await read(page)).angle - expected)).toBeLessThan(.004);
  // Immediate second drag uses current position after actual column motion.
  const current = await read(page);
  await page.mouse.down({ button: 'right' }); await page.mouse.move(x + direction * 2, y);
  expect((await read(page)).command).toBeCloseTo(current.command + direction * Math.PI * 2.5 / 150, 12);
});
test('shift-left drag, locks, boundary release, blur, visibility and settings', async ({ page }) => {
  const { x, y } = await point(page);
  await page.mouse.move(x, y); await page.keyboard.down('Shift'); await page.mouse.down();
  await page.mouse.move(1, 1);
  // Movement outside canvas must release instead of leaving steering stuck.
  expect((await read(page)).dragging).toBe(false);
  await page.mouse.up(); await page.keyboard.up('Shift');
  await page.mouse.move(x, y); await page.keyboard.down('Shift'); await page.mouse.down();
  await page.mouse.move(x + 20, y); await page.keyboard.up('Shift'); await page.mouse.up();
  expect((await read(page)).dragging).toBe(false);
  await page.mouse.down({ button: 'right' }); await page.keyboard.down('KeyD');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await read(page)).dragging).toBe(false);
  expect(await page.evaluate(() => state.input.throttleKeyHeld)).toBe(false);
  await page.mouse.up({ button: 'right' });
  await page.mouse.down({ button: 'right' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await read(page)).dragging).toBe(false);
  await page.mouse.up({ button: 'right' });
  await page.locator('#tireFrictionCoeff').focus(); await page.keyboard.press('KeyD');
  const returned = await point(page);
  await page.mouse.move(returned.x, returned.y); await page.mouse.down({ button: 'right' });
  expect((await read(page)).dragging).toBe(true);
});
for (const chord of ['Control+r', 'Control+Shift+r', 'Meta+r', 'Alt+r', 'Shift+r']) {
  test(`${chord} is not consumed or dispatched`, async ({ page }) => {
    await page.evaluate(() => Object.assign(state.engine, { mode: 'stopped', command: null }));
    await page.keyboard.press(chord);
    expect(await page.evaluate(() => __keys.at(-1))).toEqual({ prevented: false, held: false, command: null });
    expect(await page.evaluate(() => Boolean(state.input.heldKeys.KeyR))).toBe(false);
    await page.keyboard.press('KeyR');
    expect(await page.evaluate(() => state.engine.command)).toBe('start');
  });
}
test('R start/restart, repeats, running, starting and text entry', async ({ page }) => {
  for (const mode of ['stopped', 'stalled']) {
    await page.evaluate(mode => Object.assign(state.engine, { mode, command: null }), mode);
    await page.keyboard.down('KeyR');
    expect(await page.evaluate(() => state.engine.command)).toBe('start');
    await page.evaluate(() => { state.engine.command = null; });
    await page.keyboard.down('KeyR');
    expect(await page.evaluate(() => state.engine.command)).toBeNull();
    await page.keyboard.up('KeyR');
  }
  for (const mode of ['running', 'starting']) {
    await page.evaluate(mode => Object.assign(state.engine, { mode, command: null }), mode);
    await page.keyboard.press('KeyR');
    expect(await page.evaluate(() => state.engine.command)).toBeNull();
  }
  await page.locator('#search').fill(''); await page.keyboard.press('KeyR');
  await expect(page.locator('#search')).toHaveValue('r');
});

test('isolated original one-pixel regrab trace', async ({ page }) => {
  const { x, y } = await point(page);
  await page.evaluate(() => Object.assign(state.steering, { frontWheelAngle: .2,
    wheelAngle: .2 / state.params.maxFrontWheelAngle * Math.PI * 2.5,
    angularVelocity: 0, selfAligningTorque: 0, isDragging: false }));
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' }); await page.mouse.move(x + 1, y);
  await page.evaluate(async () => (await import('/js/physics/steering.js')).updateSteering(.01));
  const trace = await read(page);
  console.log('one-pixel trace', JSON.stringify(trace));
  expect(trace.angle).toBeCloseTo(.2 + .52 / 150, 12);
  expect(trace.velocity).toBeCloseTo(.52 / 150 / .01, 12);
  await page.mouse.up({ button: 'right' });
  await page.evaluate(async () => (await import('/js/physics/steering.js')).updateSteering(.01));
  console.log('one-pixel release', JSON.stringify(await read(page)));
});

test('ignored modified keydown and modifier release cannot stick or retrigger R', async ({ page }) => {
  await page.evaluate(() => Object.assign(state.engine, { mode: 'stopped', command: null }));
  await page.keyboard.down('Control'); await page.keyboard.down('KeyR');
  await page.keyboard.up('Control'); await page.keyboard.down('KeyR'); // repeated, still held physically
  expect(await page.evaluate(() => ({ held: Boolean(state.input.heldKeys.KeyR), command: state.engine.command })))
    .toEqual({ held: true, command: null });
  await page.keyboard.up('KeyR');
  expect(await page.evaluate(() => Boolean(state.input.heldKeys.KeyR))).toBe(false);
  await page.keyboard.press('KeyR');
  expect(await page.evaluate(() => state.engine.command)).toBe('start');
});

test('render exception also restores pending steering', async ({ page }) => {
  const { x, y } = await point(page);
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' }); await page.mouse.move(x + 30, y);
  const before = await read(page);
  const error = await page.evaluate(() => {
    const ctx = document.querySelector('#simCanvas').getContext('2d'), clear = ctx.clearRect;
    ctx.clearRect = () => { throw Error('controlled draw failure'); };
    try { __frame(1012); } catch (e) { return e.message; }
    finally { ctx.clearRect = clear; }
  });
  expect(error).toBe('controlled draw failure');
  expect(await read(page)).toEqual(before);
});

test('drag is monotonic and clamps at both steering locks', async ({ page }) => {
  const origin = await point(page), x = origin.x + 200, y = origin.y;
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' });
  let previous = 0;
  for (const delta of [10, 30, 100, 160, 180]) {
    await page.mouse.move(x + delta, y);
    const command = (await read(page)).command;
    expect(command).toBeGreaterThanOrEqual(previous);
    expect(command).toBeLessThanOrEqual(Math.PI * 2.5);
    previous = command;
  }
  expect(previous).toBe(Math.PI * 2.5);
  await page.mouse.up({ button: 'right' });
  // Re-grab at positive lock and continue outward, then inward across centre.
  await page.mouse.down({ button: 'right' }); await page.mouse.move(x + 190, y);
  expect((await read(page)).command).toBe(Math.PI * 2.5);
  await page.mouse.move(x - 120, y);
  expect((await read(page)).command).toBe(-Math.PI * 2.5);
  await page.mouse.up({ button: 'right' });
});

test('mouse throttle release does not cancel an independent right-button steering drag', async ({ page }) => {
  const origin = await point(page), x = origin.x, y = origin.y + 150;
  await page.mouse.move(x, y); await page.mouse.down({ button: 'right' });
  await page.mouse.down({ button: 'left' }); await page.mouse.move(x + 30, y - 60);
  expect(await page.evaluate(() => state.input.mouseThrottleAmount)).toBe(.5);
  await page.mouse.up({ button: 'left' });
  expect((await read(page)).dragging).toBe(true);
  expect(await page.evaluate(() => state.input.mouseThrottleActive)).toBe(false);
  await page.mouse.up({ button: 'right' });
  expect((await read(page)).dragging).toBe(false);
});
