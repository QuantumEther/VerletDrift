import {createStudioTachometer} from './studio-tachometer.js';
import {mountLegacyStudio} from './legacy-shell.js';
export function mountStudio() {
  if (document.body.dataset.studio !== 'native') return mountLegacyStudio();
  const find = id => document.getElementById(id);
  const shell = document.querySelector('.studio-shell');
  const tools = document.querySelector('.studio-tools');
  for (const button of document.querySelectorAll('.studio-nav button[aria-controls]')) {
    button.onclick = event => {
      for (const tab of document.querySelectorAll('.studio-nav button[aria-controls]')) {
        const active = tab === button;
        find(tab.getAttribute('aria-controls')).hidden = !active;
        tab.setAttribute('aria-pressed', String(active));
      }
      window.dispatchEvent(new Event('studio-input-clear'));
      if (event.detail) find('perspective').focus();
    };
  }
  const immersive = [...document.querySelectorAll('header button')].find(b=>b.textContent==='Immersive view');
  immersive.onclick = () => {
    immersive.setAttribute('aria-pressed',shell.classList.toggle('immersive'));
    find('perspective').focus();
  };
  const collapse = document.querySelector('.studio-nav button:not([aria-controls])');
  collapse.onclick = () => {
    const closed=shell.classList.toggle('inspector-collapsed');
    collapse.setAttribute('aria-expanded',String(!closed));
  };
  tools.addEventListener('focusin',event=>{
    if(!event.target.closest('[data-drive]'))window.dispatchEvent(new Event('studio-input-clear'));
  });
  const readouts = document.createElement('div');
  readouts.className = 'studio-readouts';
  const drawTachometer = createStudioTachometer(readouts);
  const fields = {};
  for (const range of tools.querySelectorAll('input[type=range]')) {
    const updateFill = () => {
      const minimum = Number(range.min || 0);
      const maximum = Number(range.max || 100);
      const fill = (Number(range.value) - minimum) / (maximum - minimum) * 100;
      range.style.setProperty('--range-fill', fill + '%');
    };
    range.addEventListener('input', updateFill);
    updateFill();
    const editor = document.createElement('input');
    editor.type = 'number';
    for (const key of ['min', 'max', 'step']) editor[key] = range[key];
    editor.value = range.value;
    editor.setAttribute('aria-label', (range.closest('label')?.textContent.trim() || range.id) + ' exact value');
    const initial = range.defaultValue;
    range.addEventListener('input', () => editor.value = range.value);
    editor.addEventListener('change', () => {
      if (!editor.checkValidity() || !Number.isFinite(editor.valueAsNumber)) return;
      range.value = editor.value;
      range.dispatchEvent(new Event('input', {bubbles:true}));
    });
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Default';
    reset.onclick = () => {
      range.value = initial;
      range.dispatchEvent(new Event('input', {bubbles:true}));
    };
    const precision = document.createElement('div');
    precision.className = 'precision-editor';
    precision.append(editor, reset);
    range.after(precision);
  }
  for (const label of ['Road speed', 'Engine RPM', 'Requested', 'Engaged', 'Throttle', 'Brake', 'Handbrake', 'Clutch', 'Engine', 'Simulation', 'Renderer']) {
    const tile = document.createElement('div');
    const caption = document.createElement('span');
    caption.textContent = label;
    const value = document.createElement('output');
    value.textContent = '—';
    tile.append(caption, value);
    readouts.append(tile);
    fields[label] = value;
  }
  find('perspective').after(readouts);


  shell.classList.add('studio-shell');
  const write = (key, value) => {
    if (fields[key].textContent !== value) fields[key].textContent = value;
  };
  const percent = value => Number.isFinite(value) ? Math.round(value * 100) + '%' : '—';
  return {
    status(message) { write('Simulation', message); },
    update(state, renderer, clock, paused, inputs, requested, engineLimit) {
      drawTachometer(state.engineOmega * 30 / Math.PI, engineLimit * 30 / Math.PI);
      write('Road speed', (Math.hypot(state.planar.u, state.planar.v) * 3.6).toFixed(1) + ' km/h');
      write('Engine RPM', Math.round(state.engineOmega * 60 / (2 * Math.PI)) + '');
      write('Requested', state.gearbox ? requested : 'Fixed');
      write('Engaged', state.gearbox ? state.gearbox.mode === 'engaged' ? String(state.gearbox.gear) : 'N' : 'Fixed');
      write('Throttle', percent(inputs?.throttle));
      write('Brake', percent(inputs?.serviceBrake));
      write('Handbrake', percent(inputs?.handbrake));
      write('Clutch', percent(inputs?.clutch));
      write('Engine', state.engineLifecycle?.mode ?? 'Reference');
      write('Simulation', clock.fault ? 'Fault' : paused ? 'Paused' : clock.status);
      write('Renderer', (renderer.activeBackend ?? renderer.backend) + ' · ' + clock.fps.toFixed(0) + ' FPS');
    },
  };
}
