// Synthetic mean engine with explicit torque sources; existing crank inertia only.
export const E=Object.freeze({idle:90,fire:30,extinction:18,stallDelay:.06,limit:500,starter:18,noLoad:70});
export const createEngine=()=>({mode:'stopped',lowTime:0,combustionWork:0,starterWork:0,lossWork:0});
export function torque(e,w,input,config){
 if(config)return configuredTorque(e,w,input,config);
 if(input.starter!==undefined&&typeof input.starter!=='boolean')throw Error('Invalid starter request');
 if(!Number.isFinite(w)||!['stopped','starting','running','stalled'].includes(e.mode))throw Error('Invalid engine state');
 const ignition=input.ignition!==false,running=e.mode==='running'&&ignition;
 const idle=Math.max(0,Math.min(1,(E.idle-w)*.012));
 const opening=Math.max(input.throttle??0,idle),cut=w>=E.limit||w<=0;
 const combustion=running&&!cut?32*(.1+.9*opening)/(1+(w/450)**2)*Math.max(0,Math.min(1,(E.limit-w)/20)):0;
 const friction=1.1*Math.tanh(w/5)+.012*w+.00005*w*Math.abs(w),pumping=2*(1-opening)*w/(Math.abs(w)+20);
 // Overrunning drive: no starter torque at/above no-load speed or while firing.
 const starter=input.starter&&!running&&w<E.noLoad?E.starter*Math.max(0,1-Math.max(w,0)/E.noLoad):0;
 return {combustion,starter,loss:friction+pumping,idleOpening:idle,overspeed:Math.abs(w)>=E.limit,netTorque:combustion+starter-friction-pumping};
}
export function finish(e,w,input,h,flow,travel,config=E){
 if(input.ignition===false){e.mode=input.starter?'starting':'stopped';e.lowTime=0;}
 else if(e.mode!=='running'){if(w>=config.fire)e.mode='running';else if(input.starter)e.mode='starting';else if(e.mode==='starting')e.mode='stopped';}
 else {e.lowTime=w<config.extinction?e.lowTime+h:0;if(w<=0||e.lowTime>=config.stallDelay){e.mode='stalled';e.lowTime=0;}}
 e.combustionWork+=flow.combustion*travel;e.starterWork+=flow.starter*travel;e.lossWork+=flow.loss*travel;e.diagnostics=flow;if(![e.combustionWork,e.starterWork,e.lossWork,e.lowTime].every(Number.isFinite))throw Error('Nonfinite engine ledger');
}

// Same mean-engine/source-work interface with a selectable, documented brake curve.
export function brakeCurve(w,c){const rpm=Math.max(0,w*30/Math.PI),a=c.curve;for(let i=1;i<a.length;i++)if(rpm<=a[i][0]){const t=(rpm-a[i-1][0])/(a[i][0]-a[i-1][0]);return a[i-1][1]+t*(a[i][1]-a[i-1][1]);}return 0;}
function configuredTorque(e,w,input,c){
 if(!Number.isFinite(w)||!['stopped','starting','running','stalled'].includes(e.mode)||input.starter!==undefined&&typeof input.starter!=='boolean')throw Error('Invalid engine request');
 const running=e.mode==='running'&&input.ignition!==false,idleOpening=Math.max(0,Math.min(1,(c.idle-w)*c.idleGain)),opening=Math.max(input.throttle??0,idleOpening),[a,b,d]=c.friction;
 const friction=a*Math.tanh(w/5)+b*w+d*w*Math.abs(w),pumping=c.pumping*(1-opening)*w/(Math.abs(w)+20),loss=friction+pumping;
 const fuelCut=Math.max(0,Math.min(1,(c.limit-w)/c.cutWidth));
 // Published brake torque already includes full-load friction. Add it back only
 // to infer indicated torque, then subtract the actual losses exactly once.
 const combustion=running&&w>0?opening*(brakeCurve(w,c)+friction)*fuelCut:0;
 const starter=input.starter&&!running&&w<c.noLoad?c.starter*Math.max(0,1-Math.max(w,0)/c.noLoad):0;
 return {combustion,starter,loss,idleOpening,overspeed:Math.abs(w)>=c.limit,netTorque:combustion+starter-loss};
}
