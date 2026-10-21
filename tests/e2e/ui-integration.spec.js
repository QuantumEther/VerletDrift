import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
});

test('every control writes to its authoritative state field', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { controlBindings, decodeControl, exportSettings, importSettings } = await import('/js/ui/controls.js');
    state.debug.faults.isFrozen = true;
    const baseline = exportSettings();
    const failures = [];
    for (const [id, binding] of controlBindings) {
      const { input, control, scope, key } = binding;
      const original = input.type === 'checkbox' ? input.checked : input.value;
      if (input.type === 'checkbox') input.checked = !original;
      else input.value = Number(original) + control.step <= control.max
        ? Number(original) + control.step : Number(original) - control.step;
      input.dispatchEvent(new Event(input.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
      const expected = decodeControl(control, input.type === 'checkbox' ? input.checked : input.value);
      if (typeof expected === 'number' ? Math.abs(scope[key] - expected) > 1e-8 : scope[key] !== expected) failures.push(id);
      if (input.type === 'checkbox') input.checked = original;
      else input.value = original;
      input.dispatchEvent(new Event(input.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    }
    importSettings(baseline);
    return { count: controlBindings.size, failures,
      finiteSound: Object.values(state.soundParams).every(value => typeof value !== 'number' || Number.isFinite(value)) };
  });
  expect(result).toEqual({ count: 220, failures: [], finiteSound: true });
  await expect(page.locator('input[type=range]')).toHaveCount(199);
  await expect(page.locator('input[type=checkbox]')).toHaveCount(21);
});

test('presets, converted controls, and import/export share the same bindings', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { PRESETS } = await import('/js/ui/presets.js');
    const { exportSettings, importSettings } = await import('/js/ui/controls.js');
    state.debug.faults.isFrozen = true;
    const failures = [];
    for (const button of document.querySelectorAll('[data-preset]')) {
      button.click();
      const preset = PRESETS[button.dataset.preset];
      for (const [scope, values] of Object.entries({ params: preset.params, soundParams: preset.soundParams })) {
        for (const [key, value] of Object.entries(values)) if (Math.abs(state[scope][key] - value) > 1e-8) failures.push(`${button.dataset.preset}:${key}`);
      }
    }
    const trail = document.getElementById('trailSpawnInterval');
    trail.value = 50; trail.dispatchEvent(new Event('input', { bubbles: true }));
    const grip = document.getElementById('tireSlidingFrictionRatio');
    grip.value = .5; grip.dispatchEvent(new Event('input', { bubbles: true }));
    const scale = document.getElementById('gaugeLabelScale');
    scale.value = 140; scale.dispatchEvent(new Event('input', { bubbles: true }));
    const settings = exportSettings();
    const before = JSON.stringify(settings);
    importSettings(JSON.parse(before));
    let rejected = false;
    try { importSettings({ params: { carMassKg: 1600, mapWidth: 'invalid' }, soundParams: {} }); }
    catch { rejected = true; }
    return { failures, settings, rejected, atomic: JSON.stringify(exportSettings()) === before,
      trail: state.params.trailSpawnInterval, slidingGrip: state.params.tireSlidingFrictionRatio, labelScale: state.params.gaugeLabelScale };
  });
  expect(result.failures).toEqual([]);
  expect(result.trail).toBeCloseTo(0.1, 8);
  expect(result.labelScale).toBeCloseTo(1.4, 8);
  expect(result.slidingGrip).toBeCloseTo(.5, 8);
  await expect(page.locator('#tireSlidingFrictionRatioValue')).toHaveText('50%');
  expect(result.rejected && result.atomic).toBe(true);
  await page.locator('#importPreset').setInputFiles({ name: 'setup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.settings)) });
  await expect(page.locator('#actionStatus')).toContainText('Preset imported');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportPreset').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('verlet-preset.json');
  await expect(page.locator('#trailSpawnIntervalValue')).toHaveText('0.100 s');
});

test('engine, sound and cross-window sound controls update once and stay synchronized', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#engineToggle').click();
  await expect.poll(() => page.evaluate(() => state.engine.isRunning)).toBe(false);
  await expect(page.locator('#instrument-rpm')).toHaveText('0');
  await page.locator('#engineToggle').click();
  await expect.poll(() => page.evaluate(() => state.engine.isRunning)).toBe(true);
  await page.locator('#soundToggle').click();
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-pressed', 'true');
  const other = await context.newPage();
  await other.goto('/?debugMode=quiet');
  await other.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
  await page.evaluate(() => {
    const input = document.getElementById('harmonicEnable');
    input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
    const volume = document.getElementById('masterVol');
    volume.value = .25; volume.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(() => other.evaluate(() => state.soundParams.harmonicEnable)).toBe(true);
  await expect.poll(() => other.evaluate(() => state.soundParams.masterVol)).toBe(.25);
  await expect(other.locator('#harmonicEnable')).toBeChecked();
  await expect(other.locator('#masterVolValue')).toHaveText('0.25');
  await page.locator('#soundToggle').click();
  expect(errors).toEqual([]);
});

test('typing does not drive the car; driving input and instruments use real physics', async ({ page }) => {
  await page.locator('#search').fill('drift');
  await page.keyboard.press('KeyD');
  expect(await page.evaluate(() => state.input.throttleKeyHeld)).toBe(false);
  await page.locator('#clearSearch').click();
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.down('KeyA');
  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => state.engine.rpm)).toBeGreaterThan(1500);
  await page.keyboard.press('Numpad7');
  await page.keyboard.up('KeyA');
  await expect.poll(() => page.evaluate(() => state.body.speed), { timeout: 10000 }).toBeGreaterThan(.2);
  await expect(page.locator('#instrument-gear')).toHaveText('1');
  const telemetry = await page.evaluate(async () => {
    const { readTelemetry } = await import('/js/ui/instruments.js');
    const live = readTelemetry(state);
    return { speed: live.speed, expectedSpeed: state.body.speed * 3.6, rpm: live.rpm, expectedRpm: state.engine.rpm };
  });
  expect(telemetry.speed).toBeCloseTo(telemetry.expectedSpeed, 8);
  expect(telemetry.rpm).toBeCloseTo(telemetry.expectedRpm, 8);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS');
  expect(await page.evaluate(() => state.input.brakeKeyHeld)).toBe(true);
  await page.keyboard.up('KeyS');
});

test('live warnings follow settings and folded layouts persist without affecting controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await page.evaluate(async () => {
    const { updateInstruments } = await import('/js/ui/instruments.js');
    state.debug.faults.isFrozen = true;
    state.params.redlineRpm = 5000; state.engine.rpm = 5500;
    state.params.peakSlipRatio = .2;
    state.wheelSlipRatio.frontLeft = .15;
    updateInstruments(state, performance.now() + 100);
    return { rpm: document.getElementById('rpm-state').dataset.tone, wheel: document.getElementById('wheel-state-0').textContent };
  });
  expect(result).toEqual({ rpm: 'danger', wheel: 'NEAR PEAK' });
  await page.locator('#toggleDiagnostics').click();
  await page.locator('#gauge-toggle-panel-speed').click();
  await expect(page.locator('.instruments-primary > .instrument').first()).toHaveAttribute('data-expanded', 'false');
  await page.reload();
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
  await expect(page.locator('.instruments-primary > .instrument').first()).toHaveAttribute('data-expanded', 'false');
  await expect(page.locator('.dashboard-section[data-expanded=true]')).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.jump-controls').click();
  await page.locator('#search').fill('smoke');
  await expect(page.locator('.slider-row:visible')).toHaveCount(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('storage failure does not prevent startup, driving, sound or layout changes', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = function () { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://localhost:8000/?debugMode=quiet');
  await page.waitForFunction(() => window.state?.loop.previousTimestamp > 0);
  await expect(page.locator('#gaugeLayoutStatus')).toContainText('unavailable');
  await page.locator('#toggleDiagnostics').click();
  await expect(page.locator('.dashboard-section[data-expanded=true]')).toHaveCount(3);
  await page.locator('#soundToggle').click();
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#soundToggle').click();
  expect(errors).toEqual([]);
  await context.close();
});

test('liquid presets, local persistence, reset and settings import operate in the simulator UI',async({page})=>{
 await page.evaluate(()=>{state.debug.faults.isFrozen=true;});
 await page.locator('#liquidMaterialPreset').selectOption('deep-pool');
 expect(await page.evaluate(()=>[state.params.liquidPuddleDepth,state.params.liquidConcentration])).toEqual([1.36,1.65]);
 await page.locator('#liquidResidueLifetime').evaluate(n=>{n.value='90';n.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.reload();await page.waitForFunction(()=>window.state?.loop.previousTimestamp>0);
 expect(await page.evaluate(()=>state.params.liquidResidueLifetime)).toBe(90);
 await page.locator('#resetLiquidControls').evaluate(n=>n.click());
 expect(await page.evaluate(()=>[state.params.liquidResidueLifetime,state.params.liquidPuddleDepth])).toEqual([60,1]);
 const imported=await page.evaluate(async()=>{
  const ui=await import('/js/ui/controls.js'),data=ui.exportSettings();data.params.liquidEnabled=false;data.params.liquidBodyRunoff=1.5;ui.importSettings(data);
  return [state.params.liquidEnabled,document.getElementById('liquidEnabled').checked,state.params.liquidBodyRunoff,ui.exportSettings().params.liquidBodyRunoff];
 });expect(imported).toEqual([false,false,1.5,1.5]);
});
