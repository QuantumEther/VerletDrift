// Move existing elements intact so control IDs, event handlers and state survive workspace changes.
export function mountStudio() {
  if (new URLSearchParams(location.search).get('layout') === 'legacy') return null;
  const find = id => document.getElementById(id);
  const shell = document.querySelector('.shell');
  const lab = shell.querySelector('.lab');
  const stage = lab.querySelector('.exhibition');
  const header = shell.querySelector('header');
  const terrain = shell.querySelector('.terrain-controls');
  const drive = lab.querySelector('.operator');
  const instruments = lab.querySelector('.instruments');
  const audio = find('engine-audio-panel');
  const smoke = find('smoke-enable').closest('details');
  const graphics = find('graphics').closest('.views');
  const overlays = find('show-marks').closest('.views');
  const contacts = find('contacts').closest('section');
  const diagnostics = find('diag-mode').closest('details');
  const balloons = find('balloon-count').closest('details');
  const vehicle = document.createElement('div');
  const appearance = find('appearance').closest('.views');
  vehicle.append(find('vehicle-select').closest('label'), find('vehicle-info'),
    find('drivetrain-mode').closest('label'), appearance);
  const tools = document.createElement('aside');
  tools.className = 'studio-tools';
  const nav = document.createElement('nav');
  nav.className = 'studio-nav';
  nav.setAttribute('aria-label', 'Laboratory workspaces');
  const workspaces = {
    Drive: [drive], Vehicle: [vehicle], Terrain: [terrain], Audio: [audio],
    Graphics: [graphics, smoke, balloons], Telemetry: [overlays, instruments, contacts, diagnostics],
  };
  const panels = [];
  for (const [name, nodes] of Object.entries(workspaces)) {
    const button = document.createElement('button');
    const panel = document.createElement('section');
    panel.className = 'studio-workspace';
    panel.id = 'workspace-' + name.toLowerCase();
    button.textContent = name;
    button.setAttribute('aria-controls', panel.id);
    panel.setAttribute('aria-label', name);
    panel.append(...nodes);
    button.onclick = () => {
      for (const [tab, section] of panels) {
        section.hidden = section !== panel;
        tab.setAttribute('aria-pressed', section === panel);
      }
      tools.scrollTop = 0;
    };
    panels.push([button, panel]);
    nav.append(button);
    tools.append(panel);
  }
  panels[0][0].click();
  const immersive = document.createElement('button');
  immersive.textContent = 'Immersive view';
  immersive.setAttribute('aria-pressed', 'false');
  immersive.onclick = () => {
    immersive.setAttribute('aria-pressed', shell.classList.toggle('immersive'));
    find('perspective').focus();
  };
  header.querySelector('.edition').replaceWith(immersive);
  header.querySelector('h1').textContent = 'VerletDrift';
  header.querySelector('.eyebrow').textContent = 'Terrain laboratory';
  header.after(nav);
  const references = document.createElement('details');
  references.className = 'studio-references';
  const summary = document.createElement('summary');
  summary.textContent = 'Experiment notes and references';
  references.append(summary, shell.querySelector(':scope > p'), shell.querySelector(':scope > p.note'));
  shell.querySelector('footer').before(references);
  const readouts = document.createElement('div');
  readouts.className = 'studio-readouts';
  const fields = {};
  for (const label of ['Road speed', 'Engine RPM', 'Requested', 'Engaged', 'Throttle', 'Brake', 'Clutch', 'Engine', 'Simulation', 'Renderer']) {
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
  lab.append(tools);
  shell.classList.add('studio-shell');
  const write = (key, value) => {
    if (fields[key].textContent !== value) fields[key].textContent = value;
  };
  const percent = value => Number.isFinite(value) ? Math.round(value * 100) + '%' : '—';
  return {
    status(message) { write('Simulation', message); },
    update(state, renderer, clock, paused, inputs, requested) {
      write('Road speed', (Math.hypot(state.planar.u, state.planar.v) * 3.6).toFixed(1) + ' km/h');
      write('Engine RPM', Math.round(state.engineOmega * 60 / (2 * Math.PI)) + '');
      write('Requested', state.gearbox ? requested : 'Fixed');
      write('Engaged', state.gearbox ? state.gearbox.mode === 'engaged' ? String(state.gearbox.gear) : 'N' : 'Fixed');
      write('Throttle', percent(inputs?.throttle));
      write('Brake', percent(inputs?.serviceBrake));
      write('Clutch', percent(inputs?.clutch));
      write('Engine', state.engineLifecycle?.mode ?? 'Reference');
      write('Simulation', clock.fault ? 'Fault' : paused ? 'Paused' : clock.status);
      write('Renderer', (renderer.activeBackend ?? renderer.backend) + ' · ' + clock.fps.toFixed(0) + ' FPS');
    },
  };
}
