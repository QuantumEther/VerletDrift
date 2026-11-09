// v5's provisional trim / DC removal / 120 ms circular raised-cosine overlap.
// Preserve inter-recording loudness: no per-file RMS normalization.
export const recordings=Object.freeze([
 {rpm:775,file:'REC194.wav',start:.760,end:4.780},
 ...[2000,3000,4000,5000,6000,7000].map(rpm=>({rpm,file:rpm===2000?'2000RPM_Constant_2.wav':`${rpm}RPM_Constant.wav`,start:.6,tail:.3}))
]);
export function prepareLoop(channels,sampleRate,config){
 const a=Math.round(config.start*sampleRate),b=Math.min(channels[0].length,Math.round((config.end??channels[0].length/sampleRate-config.tail)*sampleRate)),f=Math.round(.12*sampleRate),n=b-a-f;
 if(n<sampleRate*.4||channels.some(c=>c.length!==channels[0].length))throw Error('Recording too short or malformed');
 const output=[];let power=0,peak=0,seam=0;
 for(const x of channels){let mean=0;for(let i=a;i<b;i++){if(!Number.isFinite(x[i]))throw Error('Nonfinite recording');mean+=x[i];}mean/=b-a;const y=new Float32Array(n);for(let i=0;i<n;i++)y[i]=x[a+f+i]-mean;for(let j=0;j<f;j++){const w=.5-.5*Math.cos(Math.PI*j/(f-1));y[n-f+j]=(1-w)*x[b-f+j]+w*x[a+j]-mean;}for(const v of y){power+=v*v;peak=Math.max(peak,Math.abs(v));}seam=Math.max(seam,Math.abs(y[0]-y[n-1]));output.push(y);}
 return {channels:output,sampleRate,rpm:config.rpm,file:config.file,analysis:{duration:n/sampleRate,rms:Math.sqrt(power/(n*channels.length)),peak,seamDelta:seam,normalization:1,trimStart:a/sampleRate,trimEnd:b/sampleRate,crossfade:f/sampleRate}};
}
export function anchorWeights(rpm,anchors,out=new Float64Array(anchors.length)){
 out.fill(0);if(!anchors.length)return out;if(rpm<=anchors[0].rpm){out[0]=1;return out;}for(let i=1;i<anchors.length;i++)if(rpm<=anchors[i].rpm){const t=(rpm-anchors[i-1].rpm)/(anchors[i].rpm-anchors[i-1].rpm);out[i-1]=1-t;out[i]=t;return out;}out[anchors.length-1]=1;return out;
}
