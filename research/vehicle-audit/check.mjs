// Check preserved browser evidence. Physical expectations fail normally.
import { readFileSync,writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const load=p=>JSON.parse(readFileSync(`docs/vehicle-audit/${p}`));
const summary=load('summary.json'),causal=load('causal-input.json'),keyboard=load('browser-input.json'),model=load('model-probes.json');
const integrity={};
for(const name of ['realtime','repair','input']){
  const data=JSON.parse(gunzipSync(readFileSync(`docs/vehicle-audit/telemetry-${name}.json.gz`)));
  integrity[name]={scenarios:data.runs.length===33,
    schema:data.runs.every(r=>r.rows.every(row=>row.length===data.columns.length)),
    finite:data.runs.every(r=>r.rows.every(row=>row.every(v=>typeof v!=='number'||Number.isFinite(v)))),
    noSolverExceptions:data.runs.every(r=>r.anomalies.length===0),
    repeatExact:summary.branches[name].deterministicRepeat};
}
const physical={
  straightLineMirrorSymmetry:summary.scenarios['engine-braking'].input.maxYaw<=1e-6,
  wheelOrderDoesNotSelectYawDirection:summary.branches.input.orderProbe.normal.maxYaw<=1e-6,
  rendererPreservesPendingMouseInput:causal.pendingCommand.wheelAngle===causal.afterRenderOnlyFrame.wheelAngle,
  onePixelRegrabHasContinuousAngle:Math.abs(causal.regrab.roadAngle-causal.regrab.initialRoadAngle)<.004,
  modifiedRPreservesReload:keyboard['Control+r'].reloaded&&keyboard['Control+Shift+r'].reloaded,
  coherentGripHysteresis:model.startupParameterDifferences.gripRecoveryThreshold.browser<model.startupParameterDifferences.gripLossThreshold.browser,
  launchOutcomeStableAcrossTestedRates:summary.branches.input.convergence['gentle-launch']['50'].finalMode===summary.branches.input.convergence['gentle-launch']['400'].finalMode,
};
const dataValid=Object.values(integrity).every(v=>Object.values(v).every(Boolean));
const result={dataValid,integrity,repairInputAllExact:Object.values(summary.comparison).every(x=>x.exactRepairInput),physical};
writeFileSync('docs/vehicle-audit/checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
if(!dataValid||!Object.values(physical).every(Boolean))process.exitCode=1;
