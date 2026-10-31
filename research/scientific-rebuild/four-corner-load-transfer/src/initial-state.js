import {movingSecond as predecessor} from '../../tire-road-observatory-prototype/src/initial-state.js';
import {createVertical} from './vertical.js';
export function movingSecond(options){const s=predecessor(options);s.vertical=createVertical();s.roll=0;s.rollRate=0;s.verticalLedger={residual:0,dampingWork:0};return s;}
