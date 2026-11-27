const byId = id => document.getElementById(id);
const names = {atelier:'Automotive Atelier', engineering:'Precision Engineering', cinema:'Cinematic Immersion'};
const requested = new URLSearchParams(location.search).get('concept');
const concept = Object.hasOwn(names, requested) ? requested : 'atelier';
document.body.classList.add(concept);
byId('concept').textContent = names[concept];
const panels = {
  Drive: [['Throttle', 32], ['Clutch engagement', 100]],
  Garage: [['Vehicle', ['Touring chassis', 'Schweinemotorwerke']], ['Drivetrain', ['Six-speed manual', 'Fixed ratio']]],
  Environment: [['Road', ['Alpine proving ground', 'Industrial yard', 'Rally route']], ['Sun intensity', 70]],
  Acoustics: [['Engine audio', ['Muted', 'Hybrid', 'Sample']], ['Master gain', 70], ['Cabin gain', 34]],
  Rendering: [['Backend', ['WebGPU', 'WebGL']], ['Render scale', 100], ['Tire smoke', 35]],
  Laboratory: [['Telemetry', ['Vehicle', 'Tire contact', 'Frame timing']], ['Sample rate', 20]],
};
const settings = new Map();
let workspace = 'Drive';
function render() {
  for (const button of byId('workspaces').children) button.setAttribute('aria-pressed', button.textContent === workspace);
  const panel = byId('inspector');
  panel.innerHTML = '<h2></h2>';
  panel.querySelector('h2').textContent = workspace;
  for (const [name, initial] of panels[workspace]) {
    const row = document.createElement('div');
    row.className = 'control';
    const label = document.createElement('label');
    label.textContent = name;
    const id = 'parameter-' + panel.childElementCount;
    label.htmlFor = id;
    row.append(label);
    const value = settings.get(name) ?? initial;
    if (Array.isArray(initial)) {
      const select = document.createElement('select');
      select.id = id;
      for (const option of initial) select.add(new Option(option, option));
      select.value = settings.get(name) ?? initial[0];
      select.onchange = () => settings.set(name, select.value);
      row.append(select);
    } else {
      row.classList.add('mix');
      const range = document.createElement('input');
      const number = document.createElement('input');
      range.type = 'range';
      number.type = 'number';
      range.id = id;
      number.setAttribute('aria-label', name + ' numeric value');
      for (const input of [range, number]) {
        input.min = 0; input.max = 100; input.step = 1; input.value = value;
      }
      function set(input) {
        const next = Math.max(0, Math.min(100, input.valueAsNumber || 0));
        settings.set(name, next);
        range.value = number.value = next;
      }
      range.oninput = () => set(range);
      number.onchange = () => set(number);
      row.append(range, number);
    }
    panel.append(row);
  }
  if (workspace === 'Drive') {
    const gears = document.createElement('div');
    gears.className = 'gearbox';
    for (const gear of ['1','3','5','2','4','6','R','N']) {
      const button = document.createElement('button');
      button.textContent = gear;
      button.title = 'Request gear ' + gear;
      button.setAttribute('aria-pressed', gear === byId('gear').textContent);
      button.onclick = () => {
        byId('gear').textContent = gear;
        byId('status').textContent = 'Mock gear request accepted · ' + gear;
        for (const peer of gears.children) peer.setAttribute('aria-pressed', peer === button);
      };
      gears.append(button);
    }
    panel.append(gears);
  }
  const blocked = byId('state').value === 'Loading' || byId('state').value === 'Error';
  for (const control of panel.querySelectorAll('input,select,button')) control.disabled = blocked;
}
for (const name of Object.keys(panels)) {
  const button = document.createElement('button');
  button.textContent = name;
  button.onclick = () => { workspace = name; render(); };
  byId('workspaces').append(button);
}
byId('density').onchange = event => {
  document.body.classList.toggle('immersive', event.target.value === 'Immersive');
  document.body.classList.toggle('research', event.target.value === 'Research');
};
byId('state').onchange = event => {
  byId('status').textContent = {Ready:'Ready',Loading:'Loading mock scene…',Warning:'Mock warning · timing budget exceeded',Error:'Mock renderer error · controls unavailable'}[event.target.value];
  render();
};
render();
