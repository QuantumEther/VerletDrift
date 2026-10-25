import {visualState} from './visual-state.js';
export function drawDrivetrain(canvas,s){
 const ctx=canvas.getContext('2d'),v=visualState(s),colors={disengaged:'#8293a1',slipping:'#f4a44c',locked:'#55d6be'};
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.font='14px system-ui';ctx.lineWidth=3;
 const input=230,output=282+v.gap*45,y=115;
 ctx.strokeStyle='#8293a1';ctx.beginPath();ctx.moveTo(65,y);ctx.lineTo(input,y);ctx.moveTo(output,y);ctx.lineTo(590,y);ctx.stroke();
 if(v.neutral){ctx.clearRect(345,y-8,60,16);ctx.fillStyle='#e8eef4';ctx.fillText('NEUTRAL',345,y+30);}
 for(const [i,G] of [3.5,2].entries()){const x=370+i*55,active=v.gear===String(i+1);ctx.strokeStyle=active?'#55d6be':'#657886';ctx.lineWidth=active?3:1;for(const [cy,angle,rad] of [[72,v.shaftAngle,10],[100,v.shaftAngle/G,16]]){ctx.beginPath();ctx.arc(x,cy,rad,0,2*Math.PI);ctx.stroke();ctx.beginPath();ctx.moveTo(x,cy);ctx.lineTo(x+rad*Math.cos(angle),cy+rad*Math.sin(angle));ctx.stroke();}ctx.fillStyle='#e8eef4';ctx.fillText(String(i+1),x-3,55);}
 function disk(x,angle,label,r=32){ctx.fillStyle='#263747';ctx.strokeStyle=colors[v.state];ctx.beginPath();ctx.ellipse(x,y,r*.55,r,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*r*.5,y+Math.sin(angle)*r*.9);ctx.stroke();ctx.fillStyle='#e8eef4';ctx.fillText(label,x-35,y+65);}
 disk(90,v.engineAngle,'Flywheel',45);disk(input,v.engineAngle,'Input plate');disk(output,v.shaftAngle,'Output plate');disk(465,v.carrierAngle,'Carrier');disk(595,v.rearAngles[0],'RL',25);disk(670,v.rearAngles[1],'RR',25);
 if(v.state==='locked'){ctx.fillStyle='#55d6be';ctx.fillRect(input+5,y-12,output-input-10,24);}else if(v.state==='slipping'){ctx.fillStyle=v.heating?'#df6e31':'#f4a44c';ctx.fillRect(input+22,y-25,Math.max(2,output-input-44),50);}
 const arrowY=40,reverse=v.flow==='wheels to engine',from=reverse?550:110,to=reverse?110:550;
 ctx.strokeStyle=v.flow==='no transmitted power'?'#657886':'#55d6be';ctx.lineWidth=1+Math.min(9,Math.abs(v.torque)/4);ctx.beginPath();ctx.moveTo(from,arrowY);ctx.lineTo(to,arrowY);ctx.stroke();ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(to+(reverse?12:-12),arrowY-8);ctx.lineTo(to,arrowY);ctx.lineTo(to+(reverse?12:-12),arrowY+8);ctx.stroke();
 ctx.fillStyle='#e8eef4';ctx.fillText(`${v.state.toUpperCase()} · ${v.flow} · ${v.mode} differential`,20,20);ctx.fillText(`Engine ${v.engineRPM.toFixed(0)} rpm`,25,220);ctx.fillText(`Input shaft ${v.shaftRPM.toFixed(0)} rpm · gear ${v.gear}, G=${s.flywheel.ratio||'N'}`,230,220);
 ctx.fillStyle='#df6e31';ctx.fillRect(20,245,Math.min(660,v.heatPower/5),12);ctx.fillStyle='#e8eef4';ctx.fillText(`Slip ${v.slip.toFixed(2)} rad/s | heat ${v.heatPower.toFixed(2)} W | accumulated ${v.heat.toFixed(2)} J`,20,285);
}
