// Physical selector coordinate, magnified for the instrument. No gear assignment.
export function drawSelector(canvas,state) {
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,x=w/2-state.gearbox.q*w*8.5;
 c.clearRect(0,0,w,h);c.strokeStyle='#b9b5a3';c.fillStyle='#ebdab7';c.lineWidth=3;
 c.beginPath();c.moveTo(w*.24,h*.34);c.lineTo(w*.76,h*.34);c.stroke();
 c.font='30px Georgia';c.textAlign='center';for(const [p,label]of [[.29,'1'],[.5,'N'],[.71,'2']])c.fillText(label,w*p,h*.90);
 c.beginPath();c.moveTo(w/2,h*.76);c.lineTo(x,h*.34);c.stroke();c.beginPath();c.arc(x,h*.34,11,0,Math.PI*2);c.fill();c.textAlign='left';
}
