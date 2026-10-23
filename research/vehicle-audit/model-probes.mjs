// Source-bound math/config probes. No parameter changes in the application.
import { readFileSync, writeFileSync } from 'node:fs';
globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
const state=(await import('../../js/state.js')).default;
const summary=JSON.parse(readFileSync('docs/vehicle-audit/summary.json'));
const p=summary.branches.input.parameters;
const source=readFileSync('js/physics/tires.js','utf8');
const start=source.indexOf('function pacejkaForce('),end=source.indexOf('\n}',start)+2;
if(start<0||end<start)throw Error('Force-law source boundary changed');
const force=new Function(`${source.slice(start,end)};return pacejkaForce;`)();
const B=p.pacejkaB,C=p.pacejkaC,norm=Math.sin(C*Math.atan(B));
const peakNormalized=Math.tan(Math.PI/(2*C))/B;
const capNormalized=Math.tan(Math.asin(norm)/C)/B;
const defaults=Object.fromEntries(Object.entries(state.params).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(p[k])).map(([k,v])=>[k,{source:v,browser:p[k]}]));
const curves=[];
for(let i=0;i<=800;i++){
  const alpha=i*.025*Math.PI/180,kappa=i*.0005;
  curves.push({alphaDegrees:i*.025,lateralRaw:force(3000,1,alpha,p.peakSlipAngleDeg*Math.PI/180,B,C)/3000,
    lateralCapped:Math.min(1,force(3000,1,alpha,p.peakSlipAngleDeg*Math.PI/180,B,C)/3000),
    kappa,longitudinalRaw:force(3000,1,kappa,p.peakSlipRatio,B,C)/3000});
}
let grip='stable';const states=[];
for(let i=0;i<8;i++){
  if(grip==='stable'&&.8>p.gripLossThreshold)grip='slipping';
  else if(grip!=='stable'&&.8<p.gripRecoveryThreshold)grip='stable';
  states.push(grip);
}
const data={startupParameterDifferences:defaults,stallThresholdSource:state.params.stallRpm*(1-state.params.stallResistance*.8),
  stallThresholdBrowser:p.stallRpm*(1-p.stallResistance*.8),normalization:norm,rawPeakFactor:1/norm,
  rawPeakSlipRatio:peakNormalized*p.peakSlipRatio,rawPeakAngleDegrees:peakNormalized*p.peakSlipAngleDeg,
  firstCapSlipRatio:capNormalized*p.peakSlipRatio,firstCapAngleDegrees:capNormalized*p.peakSlipAngleDeg,
  zeroSlopePerTire:3000*B*C/(p.peakSlipAngleDeg*Math.PI/180*norm),
  pacejkaCZeroThreshold:Math.PI/Math.atan(B),allowedCMax:3,forceAtAllowedC2_5:force(3000,1,.02,.12,B,2.5),
  hysteresisAtUtilization0_8:states,curves,
  references:{externalFetch:'NASA drag equation, X-engineer tire formula and OpenStax rotation pages were attempted; session network proxy returned HTTP tunnel 403. No external vehicle measurements verified.',
    identifiedReferenceVehicle:false}};
writeFileSync('docs/vehicle-audit/model-probes.json',JSON.stringify(data,null,2));
console.log(JSON.stringify({...data,curves:undefined},null,2));
