import {mechanicalPresentation,AXIS_DISTANCE,PRIMARY,GEAR_PAIRS,DOG_FACE,SLEEVE_HALF} from './mechanical-layout.js';

// Longitudinal engineering projection plus true end-on mesh sections. Shares
// geometry and kinematics with Three.js; never integrates decorative motion.
export function drawDrivetrain(canvas,state) {
 const c=canvas.getContext('2d'),v=mechanicalPresentation(state);
 c.clearRect(0,0,canvas.width,canvas.height);c.save();c.scale(canvas.width/1100,canvas.height/650);
 const gold='#cfb278',ivory='#ecdfc5',steel='#a1b1ab',dim='#8b9486';
 const X=x=>690-x*420,Y=y=>190+y*420;
 c.font='14px Georgia';c.fillStyle=gold;c.fillText('LONGITUDINAL SECTION',40,40);c.font='12px sans-serif';c.fillStyle=dim;c.fillText('Two parallel axes · coaxial input / output · massless 1:1 layshaft illustration',40,64);
 function line(x1,y1,x2,y2,color=steel,width=3){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
 function label(text,x,y){c.fillStyle=ivory;c.font='12px sans-serif';c.textAlign='center';c.fillText(text,x,y);c.textAlign='left';}
 function plate(x,r,width,color,angle,y=0){c.fillStyle='#27322d';c.strokeStyle=color;c.lineWidth=2;c.fillRect(X(x)-width*210,Y(y)-r*420,width*420,r*840);c.strokeRect(X(x)-width*210,Y(y)-r*420,width*420,r*840);line(X(x)-width*180,Y(y)+Math.cos(angle)*r*370,X(x)+width*180,Y(y)+Math.cos(angle)*r*370,gold,3);}
 // Input terminates at the primary pinion; the coaxial output is a separate member.
 line(X(1.16),Y(0),X(1.04),Y(0),gold,7);line(X(.96),Y(0),X(.55),Y(0),steel,6);line(X(.34),Y(0),X(-.78),Y(0),steel,6);
 line(X(.65),Y(AXIS_DISTANCE),X(-.39),Y(AXIS_DISTANCE),steel,6);
 plate(.985,.235,.065,steel,v.engineAngle);plate(.94-v.clutchGap*.15,.19,.024,gold,v.inputAngle);plate(.908-v.clutchGap,.218,.04,steel,v.engineAngle);
 plate(PRIMARY.x,PRIMARY.radius,.055,steel,v.inputAngle);plate(PRIMARY.x,PRIMARY.radius,.055,steel,v.layshaftAngle,AXIS_DISTANCE);
 v.pairs.forEach(p=>{plate(p.x,p.drivenRadius,.055,p.engaged?gold:steel,p.drivenAngle);plate(p.x,p.driverRadius,.055,steel,p.driverAngle,AXIS_DISTANCE);label(`FREE ${p.gear} · ${p.ratio}:1`,X(p.x),Y(0)-p.drivenRadius*420-3);if(p.engaged)label('DOGS ENGAGED',X(p.x),Y(0)-p.drivenRadius*420-32);
  const sign=Math.sign(p.x);line(X(sign*DOG_FACE),Y(0)-42,X(p.x),Y(0)-42,p.engaged?gold:dim,8);line(X(sign*DOG_FACE),Y(0)+42,X(p.x),Y(0)+42,p.engaged?gold:dim,8);
 });
 plate(v.selectorX,.084,SLEEVE_HALF*2,v.impact?'#d18b5a':gold,v.outputAngle);
 line(X(v.selectorX),Y(0)-40,X(v.selectorX),Y(0)-115,gold,4);line(X(-.35),Y(0)-115,X(.35),Y(0)-115,steel,2);
 label('SELECTOR FORK',X(0),Y(0)-135);label(`q ${(state.gearbox.q*1000).toFixed(2)} mm`,X(0),Y(0)+75);
 label('FLYWHEEL',X(1.03),Y(0)+125);label('CLUTCH',X(.85),Y(0)+150);label('1:1 INPUT MESH',X(PRIMARY.x),Y(AXIS_DISTANCE)+85);
 label('OUTPUT → DIFFERENTIAL',X(-.67),Y(0)+110);label('LAYSHAFT · opposite rotation',X(-.03),Y(AXIS_DISTANCE)+75);
 // Actual left/right output phases, not a pair of identical animations.
 for(const [i,a] of v.rearAngles.entries()){const x=1010,y=150+i*105;line(1010,200,1010,y,steel,3);c.strokeStyle=steel;c.beginPath();c.arc(x,y,28,0,2*Math.PI);c.stroke();line(x,y,x+24*Math.cos(a),y+24*Math.sin(a),gold,3);label(i?'RR':'RL',x+50,y+4);}line(X(-.78),Y(0),1010,200,steel,3);
 c.strokeStyle='#635b45';c.lineWidth=1;c.beginPath();c.moveTo(40,410);c.lineTo(1060,410);c.stroke();
 label('END-ON MESH SECTIONS · equal tooth module / centre distance',550,439);
 for(const [i,p] of v.pairs.entries()){
  const x=235+i*420,y=537,scale=215,other=x+AXIS_DISTANCE*scale;
  function gear(cx,r,n,a,color){c.strokeStyle=color;c.lineWidth=1.5;c.beginPath();for(let j=0;j<n*4;j++){const angle=a+j*2*Math.PI/(n*4),rr=r+((j%4===1||j%4===2)?.006:-.006);const px=cx+Math.cos(angle)*rr*scale,py=y+Math.sin(angle)*rr*scale;j?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.stroke();line(cx,y,cx+Math.cos(a)*r*scale*.8,y+Math.sin(a)*r*scale*.8,gold,2);}
  gear(x,p.drivenRadius,p.drivenTeeth,p.drivenAngle,p.engaged?gold:steel);gear(other,p.driverRadius,p.driverTeeth,p.driverAngle,steel);
  label(`${p.drivenTeeth} / ${p.driverTeeth} teeth · ${p.ratio}:1`,x+30,620);
 }
 c.restore();
}
