import { audioState as state } from './state.js';
import { setSoundParam } from './sound.js';
import { CONTROLS } from './ui/control-data.js';

/**
 * Sound State Manager
 *
 * Manages cross-window synchronization of sound parameters via localStorage.
 * Serves as the mediator between UI sliders (in both index.html and engine_sound.html)
 * and the audio synthesis module (sound.js).
 *
 * How it works:
 * - initSoundStateManager() sets up a 'storage' event listener
 * - When one window updates localStorage, the 'storage' event fires in OTHER windows
 * - updateSoundParam() writes to localStorage (triggers 'storage' in other windows) and applies locally
 * - Both windows call the same functions, creating automatic bidirectional sync
 */

/**
 * Initialize the sound state manager.
 * Sets up event listener for localStorage changes from other windows.
 * Call this once from main.js on page load.
 */
export function initSoundStateManager() {
  // Listen for storage events triggered by OTHER WINDOWS
  window.addEventListener('storage', (event) => {
    // Only respond to sound parameter changes
    if (event.key && event.key.startsWith('soundParam_')) {
      const paramName = event.key.replace('soundParam_', '');
      const newValue = event.newValue === 'true' ? true : event.newValue === 'false' ? false : parseFloat(event.newValue);

      const control = CONTROLS.find(control => control.id === paramName);
      if (!control || !Object.hasOwn(state.soundParams,paramName)) return;
      if (control.type === 'checkbox' ? !['true','false'].includes(event.newValue) :
          !Number.isFinite(newValue) || newValue < control.min || newValue > control.max) return;
      // Update local state
      state.soundParams[paramName] = newValue;

      // Apply to audio nodes immediately (if engine is running)
      setSoundParam(paramName, newValue);

      // Notify UI sliders in THIS window (if they exist)
      updateUISliderForParam(paramName, newValue);
    }
  });
}

/**
 * Update a sound parameter, persist it to localStorage, and apply it to audio nodes.
 * Called when:
 * - A slider in index.html changes
 * - A slider in engine_sound.html changes
 * - Code manually wants to adjust a parameter
 *
 * @param {string} paramName - Parameter key (e.g., 'masterVol', 'mainGain')
 * @param {number|boolean} newValue - New value for the parameter
 */
export function updateSoundParam(paramName, newValue) {
  // Update local state
  state.soundParams[paramName] = newValue;

  // Persist to localStorage (triggers 'storage' event in OTHER windows)
  try { localStorage.setItem(`soundParam_${paramName}`, String(newValue)); } catch { /* Audio still works without persistence. */ }

  // Apply to audio nodes immediately (if engine is running)
  setSoundParam(paramName, newValue);

  // Update local UI slider if it exists
  updateUISliderForParam(paramName, newValue);
}

/**
 * Sync a specific parameter value to its HTML slider element (if it exists).
 * Called when another window changes a parameter.
 * @private
 */
function updateUISliderForParam(paramName, newValue) {
  const slider = document.getElementById(paramName);
  if (slider) {
    if (slider.type === 'checkbox') slider.checked = newValue;
    else slider.value = newValue;
  }
  window.dispatchEvent(new CustomEvent('soundparamchange', {detail: {paramName,newValue}}));
}

/**
 * Format a sound parameter value for display.
 * @private
 */
function formatValue(value, paramName) {
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  if (paramName.includes('Low') || paramName.includes('High') || paramName.includes('Freq') || paramName === 'noiseLow' || paramName === 'noiseHigh') {
    return Math.round(value); // Frequencies as integers
  }
  // All others: 1 decimal place
  return value.toFixed(1);
}

export { formatValue };
