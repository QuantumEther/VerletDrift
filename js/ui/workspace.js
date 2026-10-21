import { CONTROLS } from './control-data.js';
import { resetControls } from './controls.js';
let updateCompact = () => {};
export function updateCompactReadouts(values) { updateCompact(values); }
export function initWorkspace() {
const SLIDERS = CONTROLS.filter(control => !control.top).map(control=>({...control}));
const SUBSYSTEMS = ['Engine', 'Transmission', 'Tires', 'Physics', 'Suspension', 'Camera', 'Rendering', 'Audio', 'Steering'];
const CARD_GROUPS = [...new Set(SLIDERS.map(s => s.group))];
const defaults = new Map(SLIDERS.map(s => [s.id, s.value]));
const search = document.getElementById('search');
const container = document.getElementById('cardsContainer');
const groups = new Map();
const rows = new Map();
let selectedSystem = 'All';
let searchOpenState = null;
let currentMatches = [];
let initialized = false;
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const activeMotions = new Map();
let layoutFrame = 0;

// Height animations stay in normal flow inside each card. Observing the changing
// card sizes lets the cards below glide upward throughout a fold or search.
function layoutCards() {
  layoutFrame = 0;
  const width = container.clientWidth;
  const columns = container.classList.contains('list-view') || innerWidth <= 700
    ? 1 : Math.max(1, Math.min(4, Math.floor((width + 12) / 402)));
  const gap = 12;
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const bottoms = Array(columns).fill(0);
  const visible = [...groups.values()].filter(group => !group.hidden);
  // Keep reading order across columns, but let each column close its own gaps.
  visible.forEach((group, index) => {
    const column = index % columns;
    group.style.width = `${cardWidth}px`;
    group.style.transform = `translate(${column * (cardWidth + gap)}px, ${bottoms[column]}px)`;
    bottoms[column] += group.getBoundingClientRect().height + gap;
  });
  container.style.height = `${Math.max(0, ...bottoms) - (visible.length ? gap : 0)}px`;
}
function scheduleLayout() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(layoutCards);
}
const cardObserver = new ResizeObserver(scheduleLayout);
new ResizeObserver(scheduleLayout).observe(container);

function finishMotion(element) {
  const motion = activeMotions.get(element);
  if (!motion) return;
  motion.animation.cancel();
  activeMotions.delete(element);
  motion.finish();
}
function transitionElement(element, from, to, finish, duration = 320, easing = 'cubic-bezier(.22, 1, .36, 1)') {
  // Callers measure the current interpolated appearance before interruption.
  const previous = activeMotions.get(element);
  if (previous) {
    previous.animation.cancel();
    activeMotions.delete(element);
  }
  if (!initialized || motionPreference.matches) { finish(); scheduleLayout(); return; }
  const animation = element.animate([from, to], { duration, easing });
  activeMotions.set(element, { animation, finish });
  animation.onfinish = () => {
    if (activeMotions.get(element)?.animation !== animation) return;
    activeMotions.delete(element);
    finish();
    scheduleLayout();
  };
}
function setRowVisible(row, visible) {
  if ((row._shown ?? true) === visible) return;
  row._shown = visible;
  const style = getComputedStyle(row);
  const from = {height: `${row.getBoundingClientRect().height}px`, opacity: style.opacity,
    paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, borderBottomWidth: style.borderBottomWidth};
  row.hidden = false;
  row.inert = !visible;
  // Measure the natural size without retaining a previous animation's height.
  const previous = activeMotions.get(row);
  if (previous) { previous.animation.cancel(); activeMotions.delete(row); }
  const natural = getComputedStyle(row);
  const to = visible ? {height: `${row.getBoundingClientRect().height}px`, opacity: 1,
    paddingTop: natural.paddingTop, paddingBottom: natural.paddingBottom, borderBottomWidth: natural.borderBottomWidth}
    : {height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', borderBottomWidth: '0px'};
  if (visible && from.height === '0px') from.opacity = 0;
  transitionElement(row, from, to, () => { row.hidden = !visible; }, visible ? 360 : 230);
}
function setGroupOpen(group, open) {
  if (group._expanded === open) return;
  group._expanded = open;
  group.dataset.expanded = String(open);
  group.querySelector('summary').setAttribute('aria-expanded', String(open));
  const body = group.querySelector('.card-sliders');
  const fromHeight = group.open ? body.getBoundingClientRect().height : 0;
  const fromOpacity = group.open ? getComputedStyle(body).opacity : 0;
  const previous = activeMotions.get(body);
  if (previous) { previous.animation.cancel(); activeMotions.delete(body); }
  group.open = true; // Native details must remain open until the closing fold finishes.
  body.inert = !open;
  if (!open && body.contains(document.activeElement)) group.querySelector('summary').focus();
  const toHeight = open ? body.scrollHeight : 0;
  transitionElement(body, {height: `${fromHeight}px`, opacity: fromOpacity},
    {height: `${toHeight}px`, opacity: open ? 1 : 0},
    () => { group.open = open; }, open ? 450 : 300,
    open ? 'cubic-bezier(.18, .85, .3, 1.08)' : 'cubic-bezier(.4, 0, .2, 1)');
  scheduleLayout();
}
function setGroupVisible(group, visible) {
  if ((group._shown ?? true) === visible) return;
  group._shown = visible;
  const fromHeight = group.hidden ? 0 : group.getBoundingClientRect().height;
  const fromOpacity = group.hidden ? 0 : getComputedStyle(group).opacity;
  const previous = activeMotions.get(group);
  if (previous) { previous.animation.cancel(); activeMotions.delete(group); }
  group.hidden = false;
  group.inert = !visible;
  const target = visible ? group.getBoundingClientRect().height : 0;
  transitionElement(group, {height: `${fromHeight}px`, opacity: fromOpacity},
    {height: `${target}px`, opacity: visible ? 1 : 0},
    () => { group.hidden = !visible; }, visible ? 360 : 220);
  scheduleLayout();
}
motionPreference.addEventListener('change', () => {
  if (motionPreference.matches) [...activeMotions.keys()].forEach(finishMotion);
  scheduleLayout();
});


function fmt(value, step) {
  const decimals = (String(step).split('.')[1] || '').length;
  return Number(value).toFixed(decimals);
}

// A small local typo matcher keeps the workspace usable without CDN libraries.
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = next;
  }
  return previous[b.length];
}
function matches(slider, query) {
  const text = `${slider.label} ${slider.subsystem} ${slider.groupLabel} ${slider.id}`.toLowerCase();
  return query.split(/\s+/).every(token => text.includes(token) ||
    (token.length >= 4 && text.split(/[^a-z0-9]+/).some(word =>
      editDistance(token, word) <= (token.length > 6 ? 2 : 1))));
}
function highlight(label, query) {
  const fragment = document.createDocumentFragment();
  const index = query ? label.toLowerCase().indexOf(query) : -1;
  if (index < 0) { fragment.append(label); return fragment; }
  const mark = document.createElement('mark');
  mark.textContent = label.slice(index, index + query.length);
  fragment.append(label.slice(0, index), mark, label.slice(index + query.length));
  return fragment;
}
function displayValue(slider, value) {
  if (slider.type === 'checkbox') return value ? 'ON' : 'OFF';
  if (slider.scale === 'log') return (0.001 * 10000 ** (value / 100)).toFixed(3) + ' s';
  const scale = slider.displayScale || slider.valueScale || 1;
  const scaledStep = Number((slider.step * scale).toPrecision(8));
  const decimals = Math.min(5, (String(scaledStep).split('.')[1] || '').length);
  return (value * scale).toFixed(decimals) + (slider.unit ? ` ${slider.unit}` : '');
}
function updateValue(slider, input, output, row) {
  slider.value = slider.type === 'checkbox' ? input.checked : Number(input.value);
  // Canonical value formatting is owned by controls.js.
  if (slider.type === 'range') input.style.setProperty('--fill', `${100 * (slider.value - slider.min) / (slider.max - slider.min)}%`);
  row.classList.toggle('edited', slider.value !== defaults.get(slider.id));
}
function updateEditStatus() {
  const edited = SLIDERS.filter(s => s.value !== defaults.get(s.id)).length;
  document.getElementById('editStatus').textContent = edited ? `${edited} modified control${edited === 1 ? '' : 's'}` : 'Default setup';
  document.getElementById('resetValues').hidden = !edited;
}
function syncFoldButton() {
  const visible = [...groups.values()].filter(group => !group.hidden);
  document.getElementById('foldAll').textContent = visible.some(group => group._expanded) ? 'Collapse all' : 'Expand all';
  document.getElementById('foldAll').disabled = !visible.length;
}

for (const [index, system] of CARD_GROUPS.entries()) {
  const sliders = SLIDERS.filter(s => s.group === system);
  const category = sliders[0].subsystem;
  const group = document.createElement('details');
  group.className = 'card';
  group.dataset.category = category;
  group.dataset.group = system;
  group.open = true;
  group._expanded = true;
  group.dataset.expanded = 'true';
  group.innerHTML = `<summary class="card-header"><span class="card-number">${String(index + 1).padStart(2, '0')}</span>
    <span class="card-title"><span class="category-caption">${category}</span>${sliders[0].groupLabel.toUpperCase()}</span><span class="card-badge">${sliders.length}</span>
    <span class="card-arrow" aria-hidden="true">▸</span></summary><div class="card-sliders"></div>`;
  group.querySelector('summary').setAttribute('aria-expanded', 'true');
  group.querySelector('summary').addEventListener('click', event => {
    event.preventDefault();
    setGroupOpen(group, !group._expanded);
    syncFoldButton();
  });
  group.addEventListener('toggle', scheduleLayout);
  cardObserver.observe(group);
  for (const slider of sliders) {
    const row = document.createElement('div');
    row.className = 'slider-row';
    row.dataset.control = slider.id;
    row.innerHTML = `<label class="slider-label" for="${slider.id}">${slider.label}</label>`;
    const input = document.createElement('input');
    input.id = slider.id;
    input.type = slider.type;
    const output = document.createElement('output');
    output.className = 'slider-value';
    output.htmlFor = slider.id;
    output.id = slider.id + 'Value';
    if (slider.type === 'checkbox') {
      row.classList.add('toggle-row');
      input.checked = slider.value;
      const toggle = document.createElement('label');
      toggle.className = 'toggle';
      toggle.htmlFor = slider.id;
      const track = document.createElement('span');
      track.className = 'toggle-track';
      track.setAttribute('aria-hidden', 'true');
      toggle.append(input, track);
      row.append(toggle, output);

    } else {
      input.min = slider.min; input.max = slider.max;
      input.step = slider.step; input.value = slider.value;
      const wrap = document.createElement('div');
      wrap.className = 'slider-wrap';
      wrap.append(input);
      const ends = document.createElement('div');
      ends.className = 'range-ends';
      ends.setAttribute('aria-hidden', 'true');
      ends.innerHTML = `<span>${displayValue(slider, slider.min)}</span><span>${displayValue(slider, slider.max)}</span>`;
      wrap.append(ends);
      row.append(wrap, output);

    }
    // Match the browser's own sanitization of off-step HTML defaults.
    defaults.set(slider.id, slider.type === 'checkbox' ? input.checked : Number(input.value));
    updateValue(slider, input, output, row);
    group.querySelector('.card-sliders').append(row);
    rows.set(slider.id, row);
  }
  if(sliders.some(control=>control.id==='dustEnabled')){
    const tools=document.createElement('div');tools.className='suspension-readout';
    tools.innerHTML='<label for="dustAppearancePreset">Dust appearance </label><select class="toolbar-button" id="dustAppearancePreset"><option value="subtle">Subtle</option><option value="cinematic">Cinematic</option><option value="custom" disabled>Custom</option></select> <button class="toolbar-button" id="resetDustAppearance" type="button">Reset appearance</button><p>Density controls ambient motes; wake visibility controls local wisps independently of airflow strength. WebGPU only.</p>';
    group.querySelector('.card-sliders').append(tools);
  }
  if(sliders.some(control=>control.id==='sceneLightAzimuth')){
    const tools=document.createElement('div');tools.className='suspension-readout';
    tools.innerHTML='<label for="environmentPreset">Lighting preset </label><select class="toolbar-button" id="environmentPreset"><option value="daylight">Daylight</option><option value="overcast">Overcast</option><option value="sunset">Low warm sun</option><option value="custom" disabled>Custom</option></select> <button class="toolbar-button" type="button" id="resetEnvironment">Reset environment</button><p>Disable coherent lighting to compare the original materials. Balloon colour choices affect new impacts; existing liquid keeps its captured colour.</p>';
    group.querySelector('.card-sliders').append(tools);
  }
  if (sliders.some(control => control.id === 'liquidQuality')) {
    const tools=document.createElement('div');tools.className='suspension-readout';
    tools.innerHTML='<label for="liquidMaterialPreset">Liquid material </label><select class="toolbar-button" id="liquidMaterialPreset"><option value="reference">Reference</option><option value="thin-film">Thin film</option><option value="deep-pool">Deep pool</option><option value="custom" disabled>Custom</option></select> <button class="toolbar-button" id="resetLiquidControls" type="button">Reset liquid</button><p>GPU liquid only. Canvas keeps legacy visuals. Volume scales balloon volume; intensity scales measured collision speed. Choose a liquid detail preset or follow the renderer quality.</p>';
    group.querySelector('.card-sliders').append(tools);
  }
  if (sliders.some(control => control.id === 'suspensionEnabled')) {
    const readout = document.createElement('output');
    readout.id = 'suspensionReadout'; readout.className = 'suspension-readout';
    readout.setAttribute('aria-live', 'off');
    group.querySelector('.card-sliders').append(readout);
  }
  container.append(group);
  groups.set(system, group);
}

for (const system of ['All', ...SUBSYSTEMS]) {
  const button = document.createElement('button');
  button.dataset.system = system;
  button.innerHTML = `${system === 'All' ? 'All subsystems' : system}<span class="nav-count"></span>`;
  button.addEventListener('click', () => { selectedSystem = system; applyFilter(); });
  document.getElementById('subsystemNav').append(button);
}

function applyFilter() {
  const query = search.value.trim().toLowerCase();
  if (query && !searchOpenState) searchOpenState = new Map([...groups].map(([system, group]) => [system, group._expanded]));
  const found = SLIDERS.filter(s => !query || matches(s, query));
  const ids = new Set(found.map(s => s.id));
  currentMatches = found.filter(s => selectedSystem === 'All' || s.subsystem === selectedSystem);
  for (const slider of SLIDERS) {
    const row = rows.get(slider.id);
    setRowVisible(row, ids.has(slider.id));
    row.querySelector('label').replaceChildren(highlight(slider.label, query));
  }
  for (const [system, group] of groups) {
    const count = found.filter(s => s.group === system).length;
    const category = group.dataset.category;
    const visible = !!count && (selectedSystem === 'All' || category === selectedSystem);
    setGroupVisible(group, visible);
    group.querySelector('.card-badge').textContent = query ? `${count}/${SLIDERS.filter(s => s.group === system).length}` : count;
    if (query && visible) setGroupOpen(group, true);
    else if (!query && searchOpenState) setGroupOpen(group, searchOpenState.get(system));
  }
  if (!query) searchOpenState = null;
  document.querySelectorAll('#subsystemNav button').forEach(button => {
    const system = button.dataset.system;
    button.setAttribute('aria-pressed', String(system === selectedSystem));
    button.querySelector('.nav-count').textContent = system === 'All' ? found.length : found.filter(s => s.subsystem === system).length;
  });
  document.getElementById('workspaceTitle').textContent = selectedSystem === 'All' ? 'ALL SUBSYSTEMS' : selectedSystem.toUpperCase();
  document.getElementById('resultCount').textContent = `${currentMatches.length} / ${SLIDERS.length} controls`;
  document.getElementById('emptyState').hidden = currentMatches.length > 0;
  document.getElementById('clearSearch').hidden = !search.value;
  const suggestion = query.length >= 3 && !SUBSYSTEMS.some(s => s.toLowerCase() === query)
    ? SUBSYSTEMS.find(s => editDistance(query, s.toLowerCase()) <= 2) : null;
  const suggestionElement = document.getElementById('suggestion');
  const suggestionChanged = suggestion && (suggestionElement.hidden || document.getElementById('suggestionButton').textContent !== suggestion);
  suggestionElement.hidden = !suggestion;
  if (suggestionChanged && initialized && !motionPreference.matches) {
    suggestionElement.animate([{opacity: 0, transform: 'translateY(-5px)'},
      {opacity: 1, transform: 'translateY(0)'}], {duration: 300, easing: 'cubic-bezier(.18,.85,.3,1.15)'});
  }
  document.getElementById('suggestionButton').textContent = suggestion || '';
  syncFoldButton();
  scheduleLayout();
}
search.addEventListener('input', applyFilter);
function clearSearch() { search.value = ''; applyFilter(); search.focus(); }
document.getElementById('clearSearch').addEventListener('click', clearSearch);
document.getElementById('suggestionButton').addEventListener('click', event => {
  search.value = event.currentTarget.textContent; applyFilter(); search.focus();
});
document.getElementById('resetFilters').addEventListener('click', () => { selectedSystem = 'All'; clearSearch(); });
document.getElementById('foldAll').addEventListener('click', () => {
  const visible = [...groups.values()].filter(group => !group.hidden);
  const open = !visible.some(group => group._expanded);
  visible.forEach(group => setGroupOpen(group, open));
  syncFoldButton();
});
for (const view of ['cards', 'list']) {
  document.getElementById(`${view}View`).addEventListener('click', () => {
    container.classList.toggle('list-view', view === 'list');
    scheduleLayout();
    document.getElementById('cardsView').setAttribute('aria-pressed', String(view === 'cards'));
    document.getElementById('listView').setAttribute('aria-pressed', String(view === 'list'));
  });
}
document.getElementById('resetValues').addEventListener('click', resetControls);
document.addEventListener('controls:changed', () => {
 for (const slider of SLIDERS) {
  const row=rows.get(slider.id), input=row.querySelector('input');
  updateValue(slider,input,row.querySelector('output'),row);
 }
 updateEditStatus();
});
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
  if (event.key === '/' && !typing) { event.preventDefault(); search.focus(); }
  if (event.key === 'Escape' && document.activeElement === search) clearSearch();
  if (event.key === 'ArrowDown' && document.activeElement === search && currentMatches.length) {
    event.preventDefault();
    const first = currentMatches[0];
    setGroupOpen(groups.get(first.group), true);
    rows.get(first.id).querySelector('input').focus();
  }
});
applyFilter();
layoutCards();
initialized = true;
if (!motionPreference.matches) {
  [...groups.values()].forEach((group, index) => {
    group.animate([{opacity: 0, translate: '0 12px'}, {opacity: 1, translate: '0 0'}],
      {duration: 420, delay: index * 35, fill: 'backwards', easing: 'cubic-bezier(.22,1,.36,1)'});
  });
}
// Fold state is scoped to the dashboard, separate from control values and presets.
const gaugeLayoutKey = 'verletdrift.gauge-layout.v1';
const dashboardFolds = new Map();
const diagnosticFolds = [];
const compactValues = new Map();
const sectionValues = new Map();
let savedGaugeLayout = {};
let gaugeStorageAvailable = true;
try {
 const saved = JSON.parse(localStorage.getItem(gaugeLayoutKey) || '{}');
 if (saved && saved.version === 1 && saved.folds && typeof saved.folds === 'object') savedGaugeLayout = saved.folds;
} catch { gaugeStorageAvailable = false; }
function persistGaugeLayout(message = '') {
 try {
  localStorage.setItem(gaugeLayoutKey, JSON.stringify({version: 1, folds: Object.fromEntries([...dashboardFolds].map(([key, fold]) => [key, fold.expanded]))}));
  gaugeStorageAvailable = true;
 } catch { gaugeStorageAvailable = false; }
 document.getElementById('gaugeLayoutStatus').textContent = message + (gaugeStorageAvailable ? 'Layout saved in this browser.' : 'Layout applies for this visit; browser storage is unavailable.');
}
function syncDiagnosticToggle() {
 const anyOpen = diagnosticFolds.some(fold => fold.expanded);
 document.getElementById('toggleDiagnostics').textContent = anyOpen ? 'Collapse diagnostics' : 'Expand diagnostics';
}
function setDashboardFold(fold, expanded, animate = true, save = true) {
 if (fold.expanded === expanded && fold.ready) return;
 fold.ready = true;
 const {element, body, button} = fold;
 const fromHeight = body.hidden ? 0 : body.getBoundingClientRect().height;
 const fromOpacity = body.hidden ? 0 : getComputedStyle(body).opacity;
 const previous = activeMotions.get(body);
 if (previous) { previous.animation.cancel(); activeMotions.delete(body); }
 fold.expanded = expanded;
 element.dataset.expanded = String(expanded);
 button.setAttribute('aria-expanded', String(expanded));
 body.hidden = false;
 body.inert = !expanded;
 if (!expanded && body.contains(document.activeElement)) button.focus();
 const finish = () => { body.hidden = !expanded; };
 // Hidden ancestors have no measurable height; their children restore immediately.
 const canAnimate = animate && body.parentElement.getClientRects().length > 0;
 if (canAnimate) {
  transitionElement(body, {height: `${fromHeight}px`, opacity: fromOpacity},
    {height: `${expanded ? body.scrollHeight : 0}px`, opacity: expanded ? 1 : 0},
    finish, expanded ? 420 : 280);
 } else { finish(); }
 syncDiagnosticToggle();
 if (save) persistGaugeLayout();
}
function createDashboardFold(key, element, button, body, defaultExpanded = true) {
 body.id = 'gauge-fold-' + key.replace(/[^a-z0-9-]/g, '-');
 button.type = 'button';
 button.id = 'gauge-toggle-' + key;
 element.setAttribute('aria-labelledby', button.id);
 button.setAttribute('aria-controls', body.id);
 const arrow = document.createElement('span');
 arrow.className = 'fold-chevron'; arrow.textContent = '▸'; arrow.setAttribute('aria-hidden','true');
 button.append(arrow);
 const fold = {element, button, body, defaultExpanded, expanded: defaultExpanded, ready: false};
 dashboardFolds.set(key, fold);
 const initial = Object.hasOwn(savedGaugeLayout,key) && typeof savedGaugeLayout[key] === 'boolean' ? savedGaugeLayout[key] : defaultExpanded;
 setDashboardFold(fold, initial, false, false);
 button.addEventListener('click', () => setDashboardFold(fold, !fold.expanded));
 return fold;
}

// Each paired wheel panel can fold as a whole; its utilization and slip plots can
// also fold independently. Motion signals retain separate fold buttons as well.
const instrumentPanels = [...document.querySelectorAll('.instrument-dashboard article.instrument')];
const panelKeys = ['speed','rpm','gear','lateral-g','yaw-stability','slip-angle','wheel-fl','wheel-fr','wheel-rl','wheel-rr','front-grip','rear-grip','drift-radar','motion-signals'];
instrumentPanels.forEach((element, index) => {
 const heading = element.querySelector(':scope > .instrument-heading');
 const button = document.createElement('button');
 button.className = 'instrument-heading gauge-toggle';
 const title = document.createElement('span'); title.className = 'instrument-name'; title.textContent = heading.querySelector('h3').textContent;
 const tag = heading.querySelector('.instrument-tag');
 const compact = document.createElement('span'); compact.className = 'gauge-compact';
 compactValues.set(panelKeys[index], compact);
 button.append(title, tag, compact);
 heading.replaceWith(button);
 const body = document.createElement('div'); body.className = 'gauge-fold-body';
 [...element.children].filter(child => child !== button).forEach(child => body.append(child));
 element.append(body);
 createDashboardFold('panel-'+panelKeys[index], element, button, body);
});
document.querySelectorAll('.wheel-card [data-instrument], .motion-meter').forEach(element => {
 const label = element.querySelector(':scope > .wheel-label');
 const button = document.createElement('button'); button.className = 'mini-toggle';
 while (label.firstChild) button.append(label.firstChild);
 label.replaceWith(button);
 const body = document.createElement('div'); body.className = 'mini-fold-body';
 [...element.children].filter(child => child !== button).forEach(child => body.append(child));
 element.append(body);
 createDashboardFold('detail-'+element.dataset.instrument, element, button, body);
});

// Independent column stacks eliminate the holes left by mixed-height panels.
function packInstrumentRow(row) {
 let frame = 0;
 function layout() {
  frame = 0;
  const width = row.clientWidth;
  if (width < 1) return;
  const isDynamics = row.classList.contains('dynamics-row');
  const maxColumns = isDynamics ? (innerWidth <= 760 ? 1 : 3) : (innerWidth <= 480 ? 1 : innerWidth <= 1100 ? 2 : 4);
  const columns = Math.max(1, Math.min(maxColumns, Math.floor((width+12)/230)));
  const cardWidth = (width-(columns-1)*12)/columns;
  const bottoms = Array(columns).fill(0);
  [...row.children].forEach((card,index) => {
   const column = index % columns;
   card.style.width = `${cardWidth}px`;
   card.style.transform = `translate(${column*(cardWidth+12)}px,${bottoms[column]}px)`;
   bottoms[column] += card.getBoundingClientRect().height+12;
  });
  row.style.height = `${Math.max(0,...bottoms)-12}px`;
 }
 function schedule() { if (!frame) frame=requestAnimationFrame(layout); }
 row.classList.add('dashboard-masonry');
 const observer = new ResizeObserver(schedule);
 observer.observe(row);
 [...row.children].forEach(child => observer.observe(child));
 layout();
}
for (const [key, selector] of [['body','.dynamics-row'], ['tires','.wheels-row'], ['analysis','.analysis-row']]) {
 const row = document.querySelector(selector);
 packInstrumentRow(row);
 const heading = row.previousElementSibling;
 const section = document.createElement('section'); section.className = 'dashboard-section';
 heading.before(section); section.append(heading);
 const button = document.createElement('button'); button.className = 'section-toggle';
 const title = document.createElement('span'); title.className = 'section-name';title.textContent = heading.querySelector('h2').textContent;
 const caption = heading.querySelector('span');caption.className = 'section-caption';
 const readout = document.createElement('span');readout.className = 'section-readout';sectionValues.set(key,readout);
 button.append(title,caption,readout);
 heading.replaceChildren(button);
 const body = document.createElement('div');body.className = 'section-fold-body';
 body.append(row);section.append(body);
 const fold = createDashboardFold('section-'+key,section,button,body,false);
 diagnosticFolds.push(fold);
}
syncDiagnosticToggle();
document.getElementById('toggleDiagnostics').addEventListener('click', () => {
 const expanded = !diagnosticFolds.some(fold => fold.expanded);
 diagnosticFolds.forEach(fold => setDashboardFold(fold,expanded,true,false));
 persistGaugeLayout();
});
document.getElementById('resetGaugeLayout').addEventListener('click', () => {
 // Finish outstanding animations before restoring parent and child defaults together.
 [...dashboardFolds.values()].forEach(fold => finishMotion(fold.body));
 dashboardFolds.forEach(fold => setDashboardFold(fold,fold.defaultExpanded,false,false));
 persistGaugeLayout('Default layout restored. ');
});
// Probe storage without relying on its presence in privacy-restricted browsers.
persistGaugeLayout();
function updateFoldedReadouts(s) {
 const setCompact = (key,text,danger=false,warning=false) => {
  const el = compactValues.get(key);if (!el) return;
  el.textContent=text;el.dataset.tone=danger?'danger':warning?'warning':'normal';
 };
 setCompact('speed',`${Math.round(s.speed)} km/h`);
 setCompact('rpm',s.engineState==='stalled'?'STALL':s.engineState==='off'?'OFF':`${Math.round(s.rpm).toLocaleString('en-US')} RPM`,s.engineState==='stalled'||s.rpm>=s.redlineRpm);
 setCompact('gear',`Gear ${s.gear}`);
 setCompact('lateral-g',`${s.lateral.toFixed(2)} g`,s.lateral>=1);
 setCompact('yaw-stability',`${s.yaw>0?'+':''}${s.yaw.toFixed(2)} rad/s`,Math.abs(s.yaw)>=1.5);
 setCompact('slip-angle',`${s.beta>0?'+':''}${s.beta.toFixed(1)}°`);
 ['fl','fr','rl','rr'].forEach((key,i)=>setCompact('wheel-'+key,`${Math.round(s.util[i]*100)}% · κ ${s.slip[i]>0?'+':''}${s.slip[i].toFixed(2)}`,s.util[i]>=.8 || Math.abs(s.slip[i])>=s.peakSlipRatio,false));
 for (const axle of ['front','rear']) setCompact(axle+'-grip',`${Math.hypot(...s[axle]).toFixed(2)} × μN`,Math.hypot(...s[axle])>1);
 setCompact('drift-radar',`Drift ${s.drift.toFixed(2)}`,s.drift>=.7);
 setCompact('motion-signals',`J ${Math.round(s.jerk)} · D ${s.drift.toFixed(2)} · B ${s.blur.toFixed(2)}`,s.jerk>=400 || s.drift>=.7 || s.blur>=.8);
 const sectionText = (key,text,danger) => {const el=sectionValues.get(key);el.textContent=text;el.dataset.tone=danger?'danger':'normal';};
 sectionText('body',`${s.lateral.toFixed(2)} g · yaw ${s.yaw.toFixed(2)} rad/s · β ${s.beta.toFixed(1)}°`,s.lateral>=1 || Math.abs(s.yaw)>=1.5);
 const nearLimit = s.util.filter((value,i)=>value>=.8 || Math.abs(s.slip[i])>=s.peakSlipRatio).length;
 sectionText('tires',`${nearLimit ? nearLimit+' / 4 tires above threshold' : '4 tires below thresholds'}`,nearLimit>0);
 sectionText('analysis',`Front ${Math.hypot(...s.front).toFixed(2)} · rear ${Math.hypot(...s.rear).toFixed(2)} · drift ${s.drift.toFixed(2)}`,Math.hypot(...s.front)>1 || Math.hypot(...s.rear)>1 || s.jerk>=400 || s.drift>=.7 || s.blur>=.8);
}


updateCompact = updateFoldedReadouts;
}
