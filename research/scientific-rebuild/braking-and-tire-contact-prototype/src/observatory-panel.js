// Force and slip are kept distinct: filled brass is F/(mu*N), pale is the
// normalized slip direction. Unloaded / zero-capacity wheels have no percentage.
export function drawFrictionCircles(canvas,latest){
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
 latest.forEach((c,i)=>{const x=75+i*150,y=65,r=38;ctx.strokeStyle='#736442';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.stroke();ctx.fillStyle='#e8d6ae';ctx.font='12px monospace';ctx.textAlign='center';ctx.fillText(c.name,x,15);
  if(c.utilization!==null){const cap=c.mu*c.normal;ctx.strokeStyle=c.saturated?'#db9b67':'#cfb578';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+c.fx/cap*r,y-c.fy/cap*r);ctx.stroke();ctx.fillText((100*c.utilization).toFixed(1)+'%',x,119);}
  else ctx.fillText(c.supported?'zero capacity':'unloaded',x,119);
  if(c.slidingSpeed>1e-6&&c.supported){ctx.strokeStyle='#aecbd1';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+c.sx/c.slidingSpeed*r,y-c.sy/c.slidingSpeed*r);ctx.stroke();}
 });
}
export function updateObservatory(panel,canvas,observatory,state){
 panel.textContent=observatory.latest.map((c,i)=>`${c.name} | ω ${state.wheels[i].omega.toFixed(2)} rad/s (force stage ${c.forceStageOmega.toFixed(2)}) | N ${c.normal.toFixed(2)} N\n  slip (${c.sx.toFixed(3)}, ${c.sy.toFixed(3)}) m/s | F (${c.fx.toFixed(2)}, ${c.fy.toFixed(2)}) N\n  ${c.supported?(c.saturated?'AT FRICTION LIMIT':'inside envelope'):'UNLOADED'} | ${c.significantSliding?'significant sliding':'low / transient slip'} | U ${c.utilization===null?'undefined':c.utilization.toFixed(4)}\n  slide ${c.power.toFixed(2)} W / ${c.totalWork.toFixed(3)} J session | brake ${c.brakeTorque.toFixed(2)} Nm${c.warning?'\n  WARNING: '+c.warning:''}`).join('\n\n');
 drawFrictionCircles(canvas,observatory.latest);
}
