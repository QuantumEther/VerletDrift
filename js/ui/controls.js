import {validateEngineTorqueParameters} from '../physics/engine-torque.js';
import {SMOKE_MATERIAL_DEFAULTS} from '../renderer/smoke-material-controls.js';
import {SMOKE_AIRFLOW_DEFAULTS} from '../renderer/vehicle-airflow.js';
import { SCENE_DEFAULTS, LIGHT_PRESETS } from '../renderer/environment.js';
import { DUST_DEFAULTS, DUST_PRESETS } from '../renderer/dust-controls.js';
// One bidirectional binding per control. Presets and imports use the same path.
import state from '../state.js';
import { requestEngineToggle } from '../physics/engine.js';
import { logger } from '../debug/logger.js';
import { updateSoundParam } from '../soundStateManager.js';
import { CONTROLS } from './control-data.js';
import { LIQUID_DEFAULTS, liquidPreset } from '../renderer/liquid-controls.js';
import { PRESETS } from './presets.js';
const APPEARANCE_DEFAULTS={...LIQUID_DEFAULTS,...SCENE_DEFAULTS,...DUST_DEFAULTS,...SMOKE_AIRFLOW_DEFAULTS,...SMOKE_MATERIAL_DEFAULTS};
const appearancePrefix=key=>(Object.hasOwn(SMOKE_AIRFLOW_DEFAULTS,key)||Object.hasOwn(SMOKE_MATERIAL_DEFAULTS,key))?'smokeParam_':Object.hasOwn(DUST_DEFAULTS,key)?'dustParam_':Object.hasOwn(SCENE_DEFAULTS,key)?'sceneParam_':'liquidParam_';

export const controlBindings = new Map();
const view = { canvasResolutionScale: 1 };
const defaults = new Map();
let writingSound = false;
const pairs = [
 ['smokeLifetimeMin','smokeLifetimeMax'], ['smokeSizeMin','smokeSizeMax'],
 ['skidWidthMin','skidWidthMax'], ['skidAlphaMin','skidAlphaMax'],
 ['blurOpacityMin','blurOpacityMax'], ['decalMinRadius','decalMaxRadius'],
 ['gripLossThreshold','gripRecoveryThreshold'], ['mainFltLow','mainFltHigh'], ['noiseLow','noiseHigh'],
];
const status = message => { document.getElementById('actionStatus').textContent = message; };
const changed = () => document.dispatchEvent(new Event('controls:changed'));
function scopeFor(control) {
 if(control.id==='canvasResolutionSlider') return view;
 return Object.hasOwn(state.soundParams,control.id) ? state.soundParams : state.params;
}
function keyFor(control) { return control.id==='canvasResolutionSlider'?'canvasResolutionScale':control.id; }
export function decodeControl(control, raw) {
 if(control.type==='checkbox') return Boolean(raw);
 if(control.scale==='log') return .001 * 10000 ** (Number(raw)/100);
 return Number(raw)*(control.valueScale||1);
}
export function encodeControl(control, value) {
 if(control.type==='checkbox') return value;
 if(control.scale==='log') return 100*Math.log(value/.001)/Math.log(10000);
 return value/(control.valueScale||1);
}
export function formatControl(control,value) {
 if(control.type==='checkbox') return value?'ON':'OFF';
 if(control.labels) return control.labels[value] ?? String(value);
 if(control.scale==='log') return value.toFixed(3)+' s';
 // Values are already converted to simulator units. Percentage is display-only.
 if(control.id==='tireSlidingFrictionRatio') return (value*100).toFixed(0)+'%';
 const step=Number((control.step*(control.valueScale||1)).toPrecision(8));
 const decimals=Math.min(5,(String(step).split('.')[1]||'').length);
 return value.toFixed(decimals)+(control.unit?' '+control.unit:'');
}
function syncBinding(binding) {
 const {control,input,scope,key}=binding, value=scope[key];
 if(control.type==='checkbox') input.checked=value;
 else input.value=encodeControl(control,value);
 document.getElementById(control.id==='canvasResolutionSlider'?'canvasResolutionValue':control.id+'Value').textContent=formatControl(control,value);
 if(control.type==='range') input.style.setProperty('--fill',`${100*(Number(input.value)-control.min)/(control.max-control.min)}%`);
}
function writeBinding(binding,value,persist=true) {
 const {control,input,scope,key}=binding;
 if(control.type==='checkbox') input.checked=value;
 else {
  const raw=Math.max(control.min,Math.min(control.max,encodeControl(control,value)));
  input.value=raw; // Native range sanitization applies its documented min/step.
 }
 const canonical=decodeControl(control,control.type==='checkbox'?input.checked:input.value);
 if(scope===state.soundParams && persist) {
  writingSound=true;
  try {updateSoundParam(key,canonical);} finally {writingSound=false;}
 } else scope[key]=canonical;
 if(persist && Object.hasOwn(APPEARANCE_DEFAULTS,key)) {try{localStorage.setItem(appearancePrefix(key)+key,String(canonical));}catch{/* Storage may be disabled. */}}
 syncBinding(binding);
}
function validateValue(binding,value) {
 const c=binding.control;
 if(c.type==='checkbox') {if(typeof value!=='boolean')throw Error(`${c.label} must be on or off.`);return;}
 if(typeof value!=='number'||!Number.isFinite(value))throw Error(`${c.label} must be a finite number.`);
 const raw=encodeControl(c,value);
 if(!Number.isFinite(raw)||raw<c.min-1e-7||raw>c.max+1e-7)throw Error(`${c.label} is outside its supported range.`);
}
function enforcePair(id) {
 for(const [lowId,highId] of pairs) {
  if(id!==lowId && id!==highId)continue;
  const low=controlBindings.get(lowId),high=controlBindings.get(highId);
  if(low.scope[low.key]>high.scope[high.key])writeBinding(id===lowId?high:low,(id===lowId?low:high).scope[(id===lowId?low:high).key]);
 }
}
function syncLiquidPreset(){
 const select=document.getElementById('liquidMaterialPreset');if(!select)return;
 select.value=['reference','thin-film','deep-pool'].find(name=>Object.entries(liquidPreset(name)).every(([key,value])=>Math.abs(state.params[key]-value)<1e-7))??'custom';
}
function syncEnvironmentPreset(){const select=document.getElementById('environmentPreset');if(select)select.value=Object.keys(LIGHT_PRESETS).find(name=>Object.entries(LIGHT_PRESETS[name]).every(([key,v])=>Math.abs(state.params[key]-v)<1e-7))??'custom';}
function syncDustPreset(){const select=document.getElementById('dustAppearancePreset');if(select)select.value=Object.keys(DUST_PRESETS).find(name=>Object.entries(DUST_PRESETS[name]).every(([key,v])=>Math.abs(state.params[key]-v)<1e-7))??'custom';}
export function refreshControls() {controlBindings.forEach(syncBinding);syncLiquidPreset();syncEnvironmentPreset();syncDustPreset();changed();}
export function resetControls() {
 controlBindings.forEach(binding=>writeBinding(binding,defaults.get(binding.control.id)));
 clearSelection();refreshControls();status('All controls restored to startup defaults.');
}
function clearSelection(){document.querySelectorAll('[data-preset]').forEach(button=>button.setAttribute('aria-pressed','false'));}
export function exportSettings() {
 // Include supported runtime parameters as well as the visible control values.
 return {version:1,params:{...state.params},soundParams:{...state.soundParams},view:{...view}};
}
export function importSettings(data) {
 if(!data||typeof data!=='object'||Array.isArray(data)||!data.params||!data.soundParams)throw Error('Choose a simulator preset with params and soundParams.');
 // Accept older exports containing unused aliases left by the former presets.
 if(data.version!==undefined&&data.version!==1)throw Error('Unsupported preset version.');
 for(const name of ['params','soundParams'])if(typeof data[name]!=='object'||Array.isArray(data[name]))throw Error(`Invalid ${name} section.`);
 const params={...data.params};
 for(const [legacy,key] of Object.entries({mass:'carMassKg',rollResistCoeff:'rollingResistanceCoeff'})) {
  if(Object.hasOwn(params,legacy)) {if(!Object.hasOwn(params,key))params[key]=params[legacy];delete params[legacy];}
 }
 for(const key of ['yawDampingCoeff','brakeForceMult','aeroDownforce'])delete params[key];
 data={...data,params};
 const staged=[];
 for(const [name,target] of [['params',state.params],['soundParams',state.soundParams],['view',view]]) {
  const source=data[name];if(source===undefined)continue;
  if(!source||typeof source!=='object'||Array.isArray(source))throw Error(`Invalid ${name} section.`);
  for(const [key,value] of Object.entries(source)) {
   if(!Object.hasOwn(target,key))throw Error(`Unknown setting: ${key}`);
   const binding=[...controlBindings.values()].find(b=>b.scope===target&&b.key===key);
   if(binding)validateValue(binding,value);
   else if(typeof value!==typeof target[key] || (typeof value==='number'&&!Number.isFinite(value)))throw Error(`Invalid setting: ${key}`);
   if(typeof value!=='number'&&typeof value!=='boolean'&&!(key==='debugFontColor'&&typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)))throw Error(`Unsupported setting: ${key}`);
   // Non-control physics tuning has no HTML bounds; keep numeric tuning nonnegative.
   if(!binding&&typeof value==='number'&&value<0&&key!=='smokeLockedThreshold')throw Error(`Invalid negative setting: ${key}`);
   staged.push({target,key,value,binding});
  }
 }
 const candidate = binding => staged.find(x=>x.target===binding.scope&&x.key===binding.key)?.value ?? binding.scope[binding.key];
 for(const [lowId,highId] of pairs)if(candidate(controlBindings.get(lowId))>candidate(controlBindings.get(highId)))throw Error(`${lowId} must not exceed ${highId}.`);
 if(staged.some(x=>x.key==='smokeLockedThreshold'&&(x.value < -1 || x.value > 0)))throw Error('Smoke lock threshold must be between -1 and 0.');
 validateEngineTorqueParameters({...state.params,...Object.fromEntries(staged.filter(x=>x.target===state.params).map(x=>[x.key,x.value]))});
 // No mutations before the entire file has passed validation.
 for(const item of staged) {
  if(item.binding)writeBinding(item.binding,item.value);
  else item.target[item.key]=item.value;
 }
 clearSelection();refreshControls();status('Preset imported. All controls are synchronized with the simulator.');
}
function applyPreset(key,button) {
 const preset=PRESETS[key];if(!preset)return;
 for(const [section,values] of Object.entries({params:preset.params,soundParams:preset.soundParams})) {
  const target=state[section];
  for(const [id,value] of Object.entries(values)) {
   const binding=controlBindings.get(id);
   if(!binding||binding.scope!==target)throw Error(`Unbound preset setting: ${id}`);
   validateValue(binding,value);writeBinding(binding,value);
  }
 }
 clearSelection();button.setAttribute('aria-pressed','true');refreshControls();status(`${button.textContent} applied to vehicle and sound settings.`);
}
export function initControls() {
 for(const control of CONTROLS) {
  const input=document.getElementById(control.id),scope=scopeFor(control),key=keyFor(control);
  if(!input||!Object.hasOwn(scope,key))throw Error(`Missing control binding: ${control.id}`);
  const binding={control,input,scope,key};controlBindings.set(control.id,binding);
  const initial=decodeControl(control,control.type==='checkbox'?input.checked:input.value);
  defaults.set(control.id,initial);
  let value=initial;
  if(scope===state.soundParams || Object.hasOwn(APPEARANCE_DEFAULTS,key)) {
   try {const stored=localStorage.getItem((scope===state.soundParams?'soundParam_':appearancePrefix(key))+key);if(stored!==null){const parsed=control.type==='checkbox'?stored==='true':Number(stored);validateValue(binding,parsed);value=parsed;}} catch { /* Keep the finite HTML default. */ }
  }
  writeBinding(binding,value,false);
  input.addEventListener(control.type==='checkbox'?'change':'input',()=>{
   writeBinding(binding,decodeControl(control,control.type==='checkbox'?input.checked:input.value));
   enforcePair(control.id);clearSelection();if(Object.hasOwn(APPEARANCE_DEFAULTS,key)&&!Object.hasOwn(DUST_DEFAULTS,key)&&!Object.hasOwn(SMOKE_AIRFLOW_DEFAULTS,key)&&!Object.hasOwn(SMOKE_MATERIAL_DEFAULTS,key))syncLiquidPreset();if(Object.hasOwn(SCENE_DEFAULTS,key))syncEnvironmentPreset();if(Object.hasOwn(DUST_DEFAULTS,key))syncDustPreset();changed();
  });
 }
 document.getElementById('dustAppearancePreset').addEventListener('change',event=>{
  for(const [key,value] of Object.entries(DUST_PRESETS[event.target.value]??{}))writeBinding(controlBindings.get(key),value);
  refreshControls();status('Dust appearance applied; airflow unchanged.');
 });
 document.getElementById('resetDustAppearance').addEventListener('click',()=>{
  for(const [key,value] of Object.entries(DUST_PRESETS.cinematic))writeBinding(controlBindings.get(key),value);refreshControls();
 });
 document.getElementById('environmentPreset').addEventListener('change',event=>{
  for(const [key,value] of Object.entries(LIGHT_PRESETS[event.target.value]??{}))writeBinding(controlBindings.get(key),value);
  writeBinding(controlBindings.get('sceneLightingEnabled'),true);refreshControls();status('Environment lighting applied.');
 });
 document.getElementById('resetEnvironment').addEventListener('click',()=>{
  for(const [key,value] of Object.entries(SCENE_DEFAULTS))writeBinding(controlBindings.get(key),value);
  document.getElementById('environmentPreset').value='daylight';refreshControls();status('Environment appearance reset.');
 });
 document.getElementById('liquidMaterialPreset').addEventListener('change',event=>{
  for(const [key,value] of Object.entries(liquidPreset(event.target.value)))writeBinding(controlBindings.get(key),value);
  refreshControls();status('Liquid material preset applied to running effects.');
 });
 document.getElementById('resetLiquidControls').addEventListener('click',()=>{
  for(const [key,value] of Object.entries(LIQUID_DEFAULTS))writeBinding(controlBindings.get(key),value);
  document.getElementById('liquidMaterialPreset').value='reference';refreshControls();status('Liquid controls restored to laboratory defaults.');
 });
 document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>applyPreset(button.dataset.preset,button)));
 document.getElementById('engineToggle').addEventListener('click',()=>{
  requestEngineToggle();
 });
 document.getElementById('exportPreset').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(exportSettings(),null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='verlet-preset.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('Vehicle and sound settings exported.');
 });
 const fileInput=document.getElementById('importPreset');
 document.getElementById('importButton').addEventListener('click',()=>fileInput.click());
 fileInput.addEventListener('change',async()=>{
  const file=fileInput.files[0];if(!file)return;
  try {if(file.size>1024*1024)throw Error('Choose a preset smaller than 1 MB.');importSettings(JSON.parse(await file.text()));}
  catch(error){status(`Import failed: ${error.message}`);}
  finally {fileInput.value='';}
 });
 window.addEventListener('soundparamchange',event=>{
  if(writingSound)return;
  const binding=controlBindings.get(event.detail.paramName);
  if(binding){enforcePair(binding.control.id);syncBinding(binding);changed();}
 });
 pairs.forEach(([low])=>enforcePair(low));
 refreshControls();
 logger.info('ui','Controls initialized',{count:controlBindings.size});
}
