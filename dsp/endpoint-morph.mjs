// Scalar arithmetic used by 62d20c / 2a05c4 / 304b48.
// Mapping, sorting and source-table assembly are separate obligations.
import {nativeDoubleSinCos} from './native-double-sincos.mjs';
import {nativeDoublePow} from './native-double-pow.mjs';
import {nativeScalarExp} from './native-scalar-exp.mjs';
import {nativeScalarLogf} from './native-scalar-log.mjs';
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
const bytes=new DataView(new ArrayBuffer(4));
function word(n){bytes.setUint32(0,n);return bytes.getFloat32(0);}
const dbToLog=word(0x3debc8e3),tiny=word(0x1e3ce508);
const pi32=word(0x40490fdb),tau32=word(0x40c90fdb);
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

// 271fe0 records the original zero amplitudes before its log-domain morph.
// 1 = coupled zero, 2 = separate zero, 3 = both zero.
export function endpointAmplitudeTypes(coupled,separate){
  if(!coupled||!separate||coupled.length!==separate.length)
    throw new RangeError('Equal-length amplitude vectors required');
  return Array.from(coupled,(x,i)=>{
    const a=f(x),b=f(separate[i]);
    if(![a,b].every(Number.isFinite)||a<0||b<0)throw new RangeError('Nonnegative finite amplitudes required');
    return (a===0?1:0)+(b===0?2:0);
  });
}
// 85d368..390, 85d240..2ec: scalar and SIMD both finish in double.
// FRINTM is floor, not the integer truncation suggested by the decompiler.
export function wrapEndpointPhase(value){
  const x=f(value);
  if(!Number.isFinite(x))throw new RangeError('Finite float32 phase required');
  const shifted=f(x+pi32),quotient=Math.floor(f(shifted/tau32));
  const residual=fma32(-quotient,tau32,shifted);
  return f(residual-Math.PI);
}
export function morphPairedEndpointPhases(coupled,separate,blend,amplitudeTypes){
  if(!coupled||!separate||!amplitudeTypes||coupled.length!==separate.length||coupled.length!==amplitudeTypes.length)
    throw new RangeError('Equal-length phases and explicit amplitude types required');
  const t=blendValue(blend),u=f(1-t);
  return Array.from(coupled,(x,i)=>{
    let a=wrapEndpointPhase(x),b=wrapEndpointPhase(separate[i]);
    const type=amplitudeTypes[i];
    if(!Number.isInteger(type)||type<0||type>3)throw new RangeError('Amplitude type in [0,3] required');
    if(type===1)a=b;
    else if(type===2)b=a;
    else if(type===3)a=b=0;
    return wrapEndpointPhase(fma32(t,a,f(u*b)));
  });
}
