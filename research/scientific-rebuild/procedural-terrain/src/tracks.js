import {TireObservatory as Previous} from '../../four-corner-load-transfer/src/tracks.js';
import {captureContacts} from './contact-observation.js';
export * from '../../four-corner-load-transfer/src/tracks.js';
export class TireObservatory extends Previous {constructor(options){super(options);this.capture=captureContacts;}}
