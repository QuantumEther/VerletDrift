import {visualState} from './visual-state.js';
import {RATIOS, GEOMETRY} from './gearbox.js';

// Presentation dimensions, not new mechanical coordinates/inertias. Two parallel
// axes: split coaxial input/output and a rigid layshaft. The extra 1:1 mesh is a
// massless kinematic illustration of the source's positive transmission ratios.
export const MODULE = .008;
export const AXIS_DISTANCE = 72 * MODULE / 2;
export const PRIMARY = Object.freeze({x:.57, teeth:36, radius:36*MODULE/2});
export const GEAR_PAIRS = Object.freeze([
  Object.freeze({gear:'1', x:.27, driverTeeth:16, drivenTeeth:56, ratio:RATIOS['1']}),
  Object.freeze({gear:'2', x:-.27, driverTeeth:24, drivenTeeth:48, ratio:RATIOS['2']})
]);
export const SELECTOR_SCALE = 8;
export const DOG_RADIUS = GEOMETRY.radius * 2.5;
export const SLEEVE_HALF = .05;
export const DOG_FACE = SLEEVE_HALF + GEOMETRY.mouth * SELECTOR_SCALE;

export function mechanicalPresentation(state, exploded=false) {
  const v=visualState(state),q=state.gearbox.q;
  // Equal module and tooth sums give the same centre distance for EVERY pair.
  // The half-tooth phase on each driven gear puts a tooth opposite a space.
  const pairs=GEAR_PAIRS.map(p=>({...p,
    driverRadius:p.driverTeeth*MODULE/2, drivenRadius:p.drivenTeeth*MODULE/2,
    driverAngle:-v.shaftAngle+Math.PI/PRIMARY.teeth,
    drivenAngle:v.shaftAngle/p.ratio+Math.PI/p.drivenTeeth-Math.PI/(PRIMARY.teeth*p.ratio),
    freeAngle:v.shaftAngle/p.ratio, freeSpeed:v.shaftSpeed/p.ratio,
    engaged:v.gear===p.gear
  }));
  return {...v,pairs,inputAngle:v.shaftAngle,layshaftAngle:-v.shaftAngle+Math.PI/PRIMARY.teeth,
    outputAngle:v.carrierAngle,selectorX:q*SELECTOR_SCALE,
    clutchGap:v.gap*.10,impact:state.time-(state.gearbox.lastEventTime??-Infinity)<.15 && (state.gearbox.lastEventEnergy||0)>.01,
    // Exploded offsets belong exclusively to render groups. Shaft angles never change.
    offsets:exploded?{clutch:.38,layshaft:.35,casing:.52}:{clutch:0,layshaft:0,casing:0}
  };
}
