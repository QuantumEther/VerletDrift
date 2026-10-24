export function drawDrivetrain(canvas,s){
 const ctx=canvas.getContext('2d'),f=s.flywheel,w=s.wheels;
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#8293a1';ctx.fillStyle='#e8eef4';ctx.font='13px system-ui';
 const outputAngle=f.ratio*(w[2].angle+w[3].angle)/2;
 const parts=[[65,f.angle,'Flywheel'],[200,f.angle,'Clutch input'],[280+(1-f.engagement)*35,outputAngle,'Output'],[460,(w[2].angle+w[3].angle)/2,'Carrier'],[610,w[2].angle,'RL']];
 ctx.beginPath();ctx.moveTo(65,75);ctx.lineTo(610,75);ctx.stroke();
 for(const [x,angle,label] of parts){ctx.beginPath();ctx.arc(x,75,25,0,2*Math.PI);ctx.fillStyle=f.state==='locked'?'#286b59':'#263747';ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(x,75);ctx.lineTo(x+Math.cos(angle)*22,75+Math.sin(angle)*22);ctx.stroke();ctx.fillStyle='#e8eef4';ctx.fillText(label,x-30,125);}
 ctx.fillText(`Ideal G=${f.ratio}`,365,35);ctx.fillText(`RR angle ${w[3].angle.toFixed(2)} rad`,550,150);
 // Separate output marker: no synchronization of independent shaft speeds.
 ctx.beginPath();ctx.arc(660,75,20,0,2*Math.PI);ctx.stroke();ctx.beginPath();ctx.moveTo(660,75);ctx.lineTo(660+18*Math.cos(w[3].angle),75+18*Math.sin(w[3].angle));ctx.stroke();ctx.fillText('RR',650,125);
}
