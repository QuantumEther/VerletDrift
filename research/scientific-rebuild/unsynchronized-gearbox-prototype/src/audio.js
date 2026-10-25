// Contact-generated, opt-in synthesized feedback. No shift-request sounds.
export function createMechanicalAudio(enable,volume){
 let context,master,count=0,lastTime=-Infinity,voices=0;
 enable.addEventListener('change',()=>{if(enable.checked){context??=new AudioContext();if(!master){master=context.createGain();const limiter=context.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=20;master.connect(limiter);limiter.connect(context.destination);}context.resume();}else if(master)master.gain.value=0;});
 return {update(g){if(g.impactCount<count)count=0;if(g.impactCount===count)return;count=g.impactCount;if(!enable.checked||!context||voices>=6||context.currentTime-lastTime<.025)return;
  lastTime=context.currentTime;master.gain.value=Math.min(.3,Math.max(0,Number(volume.value)));
  const severity=Math.min(1,Math.sqrt(Math.max(0,g.lastImpactEnergy))),osc=context.createOscillator(),gain=context.createGain();
  osc.type=severity>.3?'triangle':'sine';osc.frequency.value=severity>.3?100+120*severity:600;
  gain.gain.setValueAtTime(.004+.035*severity,context.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.045);
  osc.connect(gain);gain.connect(master);voices++;osc.onended=()=>{voices--;gain.disconnect();};osc.start();osc.stop(context.currentTime+.05);
 }};
}
