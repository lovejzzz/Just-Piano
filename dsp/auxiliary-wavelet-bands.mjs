// Detail bands through 6562fc: pre-envelope, AR, post-envelope, norm and dB gain.
// Synthesis filters and final EQ/windows remain separate, unimplemented stages.
import {auxiliaryWaveletNoise} from './auxiliary-wavelet-noise.mjs';
import {filterAuxiliaryAR} from './auxiliary-ar-filter.mjs';
import {fma32} from './modal-kernel.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
const f=Math.fround;
const bytes=new DataView(new ArrayBuffer(4));bytes.setUint32(0,0x3debc8e3,true);
const dbToLog=bytes.getFloat32(0,true);
export function auxiliaryBandEnergy(samples) {
 let sum=0,i=0;
 const end=Math.floor(samples.length/4)*4;
 for(;i<end;i++)sum=f(sum+f(samples[i]*samples[i]));
 for(;i<samples.length;i++)sum=fma32(samples[i],samples[i],sum);
 return sum;
}
export function auxiliaryWaveletBands(descriptor) {
 const precursor=auxiliaryWaveletNoise(descriptor);
 const bands=precursor.bands.map(band=>{
  const record=descriptor.records50[band.band],target=f(record.scalar38);
  if(!Number.isFinite(target)||target<0)throw new RangeError('Finite nonnegative detail-band norm required');
  const samples=filterAuxiliaryAR(band.excitation,record.vector20,record.vector8);
  let envelope=1;
  for(let i=0;i<samples.length;i++){
   samples[i]=f(envelope*samples[i]);
   const next=f(envelope*band.afterFilterDecay);envelope=Math.abs(next)<1e-15?0:next;
  }
  const energy=auxiliaryBandEnergy(samples),scale=f(target/f(Math.sqrt(energy)));
  if(!Number.isFinite(energy)||energy<=0||!Number.isFinite(scale))
   throw new RangeError('Degenerate or non-finite detail-band energy is unsupported');
  for(let i=0;i<samples.length;i++)samples[i]=f(samples[i]*scale);
  const gain=band.bandGainDb===0?1:nativeScalarExp(f(band.bandGainDb*dbToLog));
  if(!Number.isFinite(gain))throw new RangeError('Non-finite detail-band gain is unsupported');
  for(let i=0;i<samples.length;i++)samples[i]=f(samples[i]*gain);
  if(!samples.every(Number.isFinite))throw new RangeError('Non-finite detail-band output is unsupported');
  return {band:band.band,reconstructedLength:band.reconstructedLength,samples,energy,scale,gain};
 });
 return {frames:precursor.frames,sampleRate:precursor.sampleRate,bands,fullWaveformImplemented:false};
}
