import {suspensionDiagnostics as previous} from '../../four-corner-load-transfer/src/suspension-diagnostics.js';
import {evaluateSuspension} from './vertical.js';
import {evaluateTerrainNormal} from './normal-contact.js';
import {terrainSampler,terrainContacts} from './application-vehicle.js';
export {modalFrequencies,modalDampingReference} from '../../four-corner-load-transfer/src/suspension-diagnostics.js';
export function suspensionDiagnostics(state){
 const result=previous(state);
 if(!state.terrainLedger)return result; // unchanged flat-ground reference
 result.corners.forEach((corner,i)=>corner.normal=state.wheels[i].normal);
 const terrain=terrainSampler(),elastic=terrainContacts(state).reduce((sum,c,i)=>sum+evaluateTerrainNormal(terrain,[...c.world,c.wheelHeight],state.wheels[i].radius,state.vertical.kt).elasticEnergy,0);
 result.verticalEnergy=evaluateSuspension(state.vertical).energy+elastic;
 result.terrainElasticEnergy=elastic;result.ledger=state.terrainLedger;
 result.modalReference='Symmetric flat all-contact reference; not measured terrain modes';
 return result;
}
