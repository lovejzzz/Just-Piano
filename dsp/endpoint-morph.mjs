// Scalar arithmetic used by 62d20c / 2a05c4 / 304b48.
// Mapping, sorting, phase and source-table assembly are separate obligations.
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
import {nativeDoublePow} from './native-double-pow.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
const bytes=new DataView(new ArrayBuffer(4));
function word(n){bytes.setUint32(0,n);return bytes.getFloat32(0);}
const dbToLog=word(0x3debc8e3),tiny=word(0x1e3ce508);
function blendValue(value){
  const b=f(value);
  if(!Number.isFinite(b)||b<0||b>1)throw new RangeError('Finite float32 blend in [0,1] required');
  return b;
}
export function endpointSineWeights(blend){
  const b=blendValue(blend),s=nativeDoubleSinCos((b*Math.PI)*0.5).sin;
  const coupled=f(s*s);
  return {coupled,separate:f(1-coupled)};
}
// Already paired frequency and decay values; no implicit correspondence or sort.
export function morphPairedEndpointValue(coupled,separate,blend){
  const a=f(coupled),b=f(separate);
  if(![a,b].every(Number.isFinite))throw new RangeError('Finite float32 endpoint values required');
  const w=endpointSineWeights(blend);
  return fma32(a,w.coupled,f(b*w.separate));
}
// 304bd8..304d08: log interpolation with distinct zero-endpoint rules.
// Uses raw blend, not the sin-squared weight of frequency/decay.
export function morphEndpointAmplitudes(coupled,separate,blend,floorDb=-40){
  if(!coupled||!separate||coupled.length!==separate.length)
    throw new RangeError('Equal-length amplitude vectors required');
  const a=Array.from(coupled,f),b=Array.from(separate,f),t=blendValue(blend),u=f(1-t),db=f(floorDb);
  if(!Number.isFinite(db)||a.some(x=>!Number.isFinite(x)||x<0)||b.some(x=>!Number.isFinite(x)||x<0))
    throw new RangeError('Nonnegative finite float32 amplitudes and finite dB floor required');
  if(!a.length)return [];
  const floor=db===0?1:nativeScalarExp(f(db*dbToLog));
  const fadeCoupled=f(nativeDoublePow(t,0.25)),fadeSeparate=f(nativeDoublePow(u,0.25));
  return a.map((left,i)=>{
    const right=b[i];
    if(left===0&&right===0)return 0;
    const p=left===0?f(right*floor):left,q=right===0?f(left*floor):right;
    const weightedLeft=f(t*nativeScalarLogf(p));
    let value=nativeScalarExp(fma32(u,nativeScalarLogf(q),weightedLeft));
    if(left===0){value=f(value*fadeSeparate);if(Math.abs(value)<tiny)value=tiny;}
    if(right===0){value=f(value*fadeCoupled);if(Math.abs(value)<tiny)value=tiny;}
    return value;
  });
}
