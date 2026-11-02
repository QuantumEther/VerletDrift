// Declarative SI configurations. One shared lifecycle integrator, no vehicle equations here.
const rpm=x=>x*Math.PI/30;
export const reference=Object.freeze({id:'reference',label:'Experimental reference',visual:{style:'reference'}});
export const mustang=Object.freeze({
 id:'mustang-1969',label:'1969 Mustang Mach 1 · 428 CJ / modified 6-speed',
 physical:{mass:1660,Iz:2900,H:.55,R:.335,Iw:1.9,Ie:.65,clutch:750},
 vertical:{mass:1492,pitchInertia:2550,rollInertia:580,wheelMass:42,ks:33000,kt:220000,damping:2600,radius:.335,length:.35,
 corners:[[1.1274331367292225,.74676],[1.1274331367292225,-.74676],[-1.6157668632707773,.74676],[-1.6157668632707773,-.74676]]},
 tire:{stiffness:200000,viscosity:800},brakes:{service:[1500,1500,1000,1000],hand:[0,0,1100,1100]},
 ratios:{forward:[2.66,1.78,1.30,1,.80,.63],reverse:-2.90,finalDrive:3.50},inputInertia:.12,outputInertia:.18,synchronizerCapacity:40,exactConstraintCoordinates:true,
 engineConfig:{idle:rpm(750),fire:rpm(250),extinction:rpm(400),stallDelay:.08,limit:rpm(6000),cutWidth:rpm(300),starter:110,noLoad:rpm(450),idleGain:.018,friction:[8,.035,.00004],pumping:18,
  // Brake-torque anchors: only 3400/5200 rpm are published rating anchors;
  // intervening/endpoint values are disclosed interpolation estimates, not dyno data.
  curve:[[0,0],[800,260],[1500,420],[2400,550],[3400,440*1.3558179483],[4200,560],[5200,335*745.699872/rpm(5200)],[5600,360],[6000,0]]},
 visual:{style:'mustang',datumHeight:.12,length:4.75996,width:1.81102,height:1.28016,wheelWidth:.215,rimRadius:.1778,front:2.04,rear:-2.71996,roofHeight:1.28016,color:0xb63420}
});
export const vehicles=Object.freeze([reference,mustang]);
export function definition(id='reference'){const v=vehicles.find(v=>v.id===id);if(!v)throw Error('Unknown vehicle');return v;}
export function configuration(id='reference'){const v=definition(id);return v===reference?{}:structuredClone(v);}
