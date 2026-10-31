// Contact-frame row construction for Experiment 10's 18-velocity ordering.
// The caller supplies three world-space point-velocity Jacobian rows. Wheel
// spin is relative to the tire tangent; it must not enter the normal row.
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalized=v=>{const n=Math.hypot(...v);if(!(n>1e-10&&Number.isFinite(n)))throw Error('Degenerate terrain contact frame');return v.map(x=>x/n);};
export function terrainContactFrame(sample,heading,pointRows,wheelIndex,radius){
 if(pointRows.length!==3||pointRows.some(r=>r.length!==18||!r.every(Number.isFinite))||!Number.isInteger(wheelIndex)||wheelIndex<0||wheelIndex>3||!(radius>0)||!Number.isFinite(heading))throw Error('Invalid terrain contact mapping');
 const normal=normalized(sample.normal),forward=[Math.cos(heading),Math.sin(heading),0],projection=dot(forward,normal),longitudinal=normalized(forward.map((v,i)=>v-projection*normal[i])),lateral=normalized(cross(normal,longitudinal));
 const row=axis=>pointRows[0].map((_,i)=>axis.reduce((s,a,k)=>s+a*pointRows[k][i],0));
 const normalRow=row(normal),longitudinalRow=row(longitudinal),lateralRow=row(lateral);longitudinalRow[wheelIndex]-=radius;
 const rows=[longitudinalRow,lateralRow,normalRow];
 return {normal,longitudinal,lateral,rows,velocity:v=>rows.map(r=>dot(r,v)),reaction:forces=>rows[0].map((_,i)=>rows.reduce((s,r,k)=>s+r[i]*forces[k],0))};
}
