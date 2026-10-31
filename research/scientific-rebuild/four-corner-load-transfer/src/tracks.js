import {TireObservatory as Predecessor} from '../../tire-road-observatory-prototype/src/tracks.js';
import {captureContacts} from './contact-observation.js';
export * from '../../tire-road-observatory-prototype/src/tracks.js';
export class TireObservatory extends Predecessor {constructor(options){super(options);this.capture=captureContacts;}}
