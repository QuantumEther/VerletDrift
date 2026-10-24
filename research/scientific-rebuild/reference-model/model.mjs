import {parameters,inertia,validateParameters} from './parameters.mjs';import {tire} from './tire.mjs';
export const names=['v','sigma','omega','Omega_r','Omega_f'];
export class ExperimentError extends Error{constructor(status,violations){super(`${status}: ${violations[0].field}`);this.status=status;this.violations=violations;}}
export function kinematics(x,u,p=parameters){
 const [v,s,w,Or,Of]=x,c=Math.cos(u.gamma),n=Math.sin(u.gamma);
 return {rear:[v,s-p.d*w,Or,p.mw*p.g+(p.mv*p.g*p.q+u.Md)/p.l],front:[v*c+(s+p.q*w)*n,-v*n+(s+p.q*w)*c,Of,p.mw*p.g+(p.mv*p.g*p.d-u.Md)/p.l]};
}
export function checkDomain(x,u,p=parameters){
 try{validateParameters(p);}catch(e){throw new ExperimentError('FAIL',[{field:'parameters',value:e.message,bound:'valid SI configuration'}]);}const bad=[];const limits=[[5,25],[-8,8],[-2,2],[20,200],[20,200]];
 if(x.length!==5)throw new ExperimentError('FAIL',[{field:'state.length',value:x.length,bound:5}]);
 for(let i=0;i<5;i++){const value=x[i],bound=limits[i];if(!Number.isFinite(value)||value<bound[0]||value>bound[1])bad.push({field:names[i],value:Number.isFinite(value)?value:String(value),bound});}
 for(const [key,bound]of [['gamma',[-Math.PI/12,Math.PI/12]],['Md',[-500,800]]]){const value=u[key];if(!Number.isFinite(value)||value<bound[0]||value>bound[1])bad.push({field:key,value:Number.isFinite(value)?value:String(value),bound});}
 for(const key of ['gammaDot','gammaDDot'])if(u[key]!==undefined&&u[key]!==0)bad.push({field:key,value:u[key],bound:0});
 if(bad.length)throw new ExperimentError(bad.some(b=>!Number.isFinite(b.value))?'FAIL':'OUT OF DOMAIN',bad);
 const k=kinematics(x,u,p);
 for(const name of ['rear','front']){const [Vx,Vy,O,Fz]=k[name],h=p.r*O,B=Math.hypot((h-Vx)/h,-Vy/h);
  if(!(Fz>0))bad.push({field:`${name}.Fz`,value:Fz,bound:'>0'});
  if(!Number.isFinite(B)||B>2)bad.push({field:`${name}.slip`,value:B,bound:[0,2]});
 }
 if(bad.length)throw new ExperimentError('OUT OF DOMAIN',bad);return k;
}
export function energy(x,p=parameters){const [v,s,w,Or,Of]=x,{m,p:b,J}=inertia(p);return m*(v*v+s*s)/2+b*s*w+J*w*w/2+p.D*(Or*Or+Of*Of)/2;}
export function derivative(x,p=parameters,u,counter,order=['rear','front'],detail=true){
 if(counter)counter.rhs=(counter.rhs||0)+1;
 const k=checkDomain(x,u,p),contacts={};
 for(const name of order){try{contacts[name]=tire(...k[name],p,counter);}catch(e){throw new ExperimentError('FAIL',[{field:`${name}.constitutive`,value:e.message,bound:'finite valid source intermediate'}]);}}
 if(!contacts.rear||!contacts.front||order.length!==2)throw new Error('Two distinct axles required');
 const a=contacts.rear,b=contacts.front,[v,s,w,Or,Of]=x,{m,p:h,J}=inertia(p),delta=m*J-h*h;
 const c=Math.cos(u.gamma),n=Math.sin(u.gamma),H=b.Fx*n+b.Fy*c,A=a.Mz+b.Mz; // gammaDDot=0 by domain contract
 const dx=[s*w+(h*w*w+a.Fx+b.Fx*c-b.Fy*n)/m,
 -v*w+((J+h*p.d)*a.Fy+(J-h*p.q)*H-h*A)/delta,
 (-(m*p.d+h)*a.Fy+(m*p.q-h)*H+m*A)/delta,(u.Md-p.r*a.Fx)/p.D,-p.r*b.Fx/p.D];
 if(!dx.every(Number.isFinite))throw new ExperimentError('FAIL',[{field:'derivative',value:dx,bound:'finite'}]);
 if(!detail)return {dx};
 const force=[a.Fx*(a.Vx-p.r*Or)+a.Fy*a.Vy,b.Fx*(b.Vx-p.r*Of)+b.Fy*b.Vy];
 const moment=[a.Mz*w,b.Mz*w],drive=u.Md*Or,total=drive+force[0]+force[1]+moment[0]+moment[1];
 const gradient=[m*v,m*s+h*w,J*w+h*s,p.D*Or,p.D*Of];
 const energyRate=gradient.reduce((z,g,i)=>z+g*dx[i],0);
 return {dx,diagnostics:{contacts,energy:energy(x,p),drive,force,moment,total,energyRate,identityResidual:energyRate-total,contact:force[0]+force[1]+moment[0]+moment[1]}};
}
