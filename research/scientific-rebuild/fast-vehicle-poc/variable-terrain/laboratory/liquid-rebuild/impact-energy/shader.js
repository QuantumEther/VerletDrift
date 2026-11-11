// REJECTED physical experiment. Not enabled in the application. See README.md.
// Telemetry preserves the baseline equations. The only experimental correction
// is a bounded, weighted-density Armijo search on the existing Jacobi direction.
export function instrument(source,safeguard=false){
 const replace=(a,b)=>{if(!source.includes(a))throw Error('Baseline shader interface changed: '+a);source=source.replace(a,b);};
 replace('motionWork:vec4f }','motionWork:vec4f, direction:vec4f, forceVelocity:vec4f }');
 replace('ledger[i].force.x+=kinetic(velocity)', 'ledger[i].forceVelocity=vec4f(velocity,0.);ledger[i].force.x+=kinetic(velocity)');
 replace('densityLambda[i]=vec2f(rho,-C/(sum+1e-6));','densityLambda[i]=vec2f(rho,-C/(sum+1e-6));ledger[i].direction.w=1./(sum+1e-6);');
 replace('let before=(p-x[i].xyz)/u.p.y;', 'ledger[i].direction=vec4f(delta,ledger[i].direction.w);let before=(p-x[i].xyz)/u.p.y;');
 if(!safeguard)return source;
 const start=source.indexOf(' ledger[i].direction=vec4f(delta,'),end=source.indexOf('\n}',start);
 source=source.slice(0,start)+' ledger[i].direction=vec4f(delta,ledger[i].direction.w);\n'+source.slice(end);
 replace('predicted[id.x]=corrected[id.x];','if(atomicLoad(&heads[32771])==0){predicted[id.x]=vec4f(corrected[id.x].xyz,1.);}');
 replace('let i=id.x;if(i<u32(u.p.x)){v[i]=', 'let i=id.x;if(atomicLoad(&heads[32771])!=0){return;}if(i<u32(u.p.x)){if(i==0u){atomicAdd(&heads[32772],1);}v[i]=');
 // A rejected attempt leaves x/v unchanged; subsequent attempted steps are inert.
 for(const name of ['predict','lambdaPass','correction'])replace(`fn ${name}(@builtin(global_invocation_id) id:vec3u){`,`fn ${name}(@builtin(global_invocation_id) id:vec3u){if(atomicLoad(&heads[32771])!=0){return;}`);
 return source+`
// Reserved cells follow the 32^3 hash heads. They are not spatial buckets.
// 0 objective; 1 alpha; 2 accepted; 3 fault; 4 accepted steps; 5 rejected trials;
// 6 total trials; 7 final maximum compression. All remain GPU-resident.
@compute @workgroup_size(1) fn startSearch(){
 if(atomicLoad(&heads[32771])!=0){return;}var cost=0.;for(var i=0u;i<u32(u.p.x);i++){let C=max(0.,densityLambda[i].x/u.fluid.x-1.);cost+=.5*C*C*ledger[i].direction.w;}
 atomicStore(&heads[32768],bitcast<i32>(cost));atomicStore(&heads[32769],bitcast<i32>(1.));atomicStore(&heads[32770],0);
}
@compute @workgroup_size(128) fn trial(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=u32(u.p.x)||atomicLoad(&heads[32770])!=0||atomicLoad(&heads[32771])!=0){return;}let alpha=bitcast<f32>(atomicLoad(&heads[32769]));corrected[i]=vec4f(boundary(predicted[i].xyz+alpha*ledger[i].direction.xyz,x[i].xyz),0.);}
@compute @workgroup_size(128) fn clearTrial(@builtin(global_invocation_id) id:vec3u){if(atomicLoad(&heads[32770])!=0||atomicLoad(&heads[32771])!=0){return;}if(id.x<32768u){atomicStore(&heads[id.x],-1);}}
@compute @workgroup_size(128) fn buildTrial(@builtin(global_invocation_id) id:vec3u){if(id.x>=u32(u.p.x)||atomicLoad(&heads[32770])!=0||atomicLoad(&heads[32771])!=0){return;}next[id.x]=atomicExchange(&heads[index(cell(corrected[id.x].xyz))],i32(id.x));}
@compute @workgroup_size(128) fn trialDensity(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(u.p.x)||atomicLoad(&heads[32770])!=0||atomicLoad(&heads[32771])!=0){return;}let p=corrected[i].xyz;let c=cell(p);var rho=0.;
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var a=-1;a<=1;a++){let nc=c+vec3i(a,y,z);if(any(nc<vec3i(0))||any(nc>=vec3i(G))){continue;}var j=atomicLoad(&heads[index(nc)]);var guard=0u;loop{if(j<0||guard>=u32(u.p.x)){break;}rho+=u.p.w*kernel(p-corrected[u32(j)].xyz);j=next[u32(j)];guard++;}}}}
 let C=max(0.,rho/u.fluid.x-1.);corrected[i].w=.5*C*C*ledger[i].direction.w;ledger[i].forceVelocity.w=rho;
}
@compute @workgroup_size(1) fn chooseTrial(){
 if(atomicLoad(&heads[32770])!=0||atomicLoad(&heads[32771])!=0){return;}var cost=0.;var dotStep=0.;for(var i=0u;i<u32(u.p.x);i++){cost+=corrected[i].w;dotStep+=dot(ledger[i].direction.xyz,corrected[i].xyz-predicted[i].xyz);}
 let base=bitcast<f32>(atomicLoad(&heads[32768]));let eps=1.1920929e-7;let gamma=f32(u.p.x)*eps/(1.-f32(u.p.x)*eps);let roundoff=4.*gamma*max(base,1e-20);atomicAdd(&heads[32774],1);
 if(cost<=base-.0001*dotStep+roundoff&&dotStep>=-roundoff){atomicStore(&heads[32770],1);}else{atomicStore(&heads[32769],bitcast<i32>(.5*bitcast<f32>(atomicLoad(&heads[32769]))));atomicAdd(&heads[32773],1);}
}
@compute @workgroup_size(1) fn requireTrial(){if(atomicLoad(&heads[32770])==0){atomicStore(&heads[32771],1);}}
@compute @workgroup_size(128) fn commitCorrection(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;if(i>=u32(u.p.x)||atomicLoad(&heads[32771])!=0){return;}let p=predicted[i].xyz;let delta=bitcast<f32>(atomicLoad(&heads[32769]))*ledger[i].direction.xyz;let before=(p-x[i].xyz)/u.p.y;let after=(p+delta-x[i].xyz)/u.p.y;
 ledger[i].density.x+=kinetic(after)-kinetic(before);ledger[i].density.y+=kinetic(delta/u.p.y);ledger[i].density.w=max(ledger[i].density.w,length(delta));recordCollision(i,after,(corrected[i].xyz-x[i].xyz)/u.p.y,1u);
}
@compute @workgroup_size(1) fn validateDensity(){
 if(atomicLoad(&heads[32771])!=0){return;}var residual=0.;for(var i=0u;i<u32(u.p.x);i++){residual=max(residual,max(0.,densityLambda[i].x/u.fluid.x-1.));}atomicStore(&heads[32775],bitcast<i32>(residual));if(residual>.001){atomicStore(&heads[32771],2);}
}
`;
}
