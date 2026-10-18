import {nativeDoubleSinCos} from './native-double-sincos.mjs';
import {nativeDoubleTan} from './native-double-tan.mjs';
const f=Math.fround;

// 951cb8..951d50: oscillator and optional first-order onset smoother.
export function constructModalOnsetInitialization({duration,square,sampleRate}){
  if(!Number.isInteger(duration)||duration<=0||duration>0xfffffff0||typeof square!=='boolean'||
    !Number.isFinite(sampleRate)||!(f(sampleRate)>0)||!Number.isFinite(f(sampleRate)))
    throw new RangeError('Positive finite onset duration and sample rate required');
  const {sin,cos}=nativeDoubleSinCos((Math.PI/2)/duration);
  let coefficients=[0,1,0],normalizedCutoff=null;
  if(!square){
    normalizedCutoff=Math.min(f(4000/f(f(sampleRate)*f(.5))),f(2/3));
    const tangent=nativeDoubleTan(Math.min(normalizedCutoff,.95)*(Math.PI/2));
    const feedback=(tangent-1)/(tangent+1),feed=(feedback+1)*.5;
    coefficients=[f(feed),f(feed),f(feedback)];
  }
  return {duration,square,step:[sin,cos],coefficients,settle:square?0:6,
    normalizedCutoff,filterCoefficientsUsed:!square,nativeInitializationUsedForPrediction:false};
}
