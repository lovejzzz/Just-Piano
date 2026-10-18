// 6568bc..656d38: ceil-sized sine-squared edge windows and source peak scaling.
const f=Math.fround;
export function shapeAuxiliaryWaveform(input,sampleRate,targetPeak){
 sampleRate=f(sampleRate);targetPeak=f(targetPeak);
 const samples=Float32Array.from(input);
 if(!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(targetPeak)||targetPeak<0||!samples.length||!samples.every(Number.isFinite))
  throw new RangeError('Finite waveform/rate and nonnegative source peak required');
 const leading=Math.min(samples.length,Math.ceil(f(sampleRate*f(.0005))));
 const trailing=Math.min(samples.length,Math.ceil(f(sampleRate*f(.01))));
 for(const [count,reverse] of [[leading,false],[trailing,true]]){
  const divisor=f(count*2);
  for(let i=0;i<count;i++){
   const sine=Math.sin(((i+1)*Math.PI)/divisor),index=reverse?samples.length-1-i:i;
   samples[index]=f((sine*sine)*samples[index]);
  }
 }
 let peak=0;for(const sample of samples)peak=Math.max(peak,Math.abs(sample));
 const scale=f(targetPeak/peak);
 if(!Number.isFinite(scale))throw new RangeError('Degenerate auxiliary waveform peak is unsupported');
 for(let i=0;i<samples.length;i++)samples[i]=f(samples[i]*scale);
 return {samples,leading,trailing,peak,scale};
}
