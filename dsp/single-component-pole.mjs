// 6d2f50..6d2fb8; the native N=1 branch does not solve a polynomial or apply
// the N>=2 frequency absolute-value / decay-floor / sorting operations.
// The legacy argument name `mode` denotes d2. At 194d5c that register holds
// the fixed base * coordinateScale reference, not the row coordinate in d4.
import {nativeComplexReciprocal} from './native-complex-reciprocal.mjs';
import {fma64} from './native-double-fma.mjs';
export function singleComponentPole({p,q,mode,center}){
  if(![p,q,mode,center].every(Number.isFinite)||mode<=0)
    throw new RangeError('Finite impedance, positive modal coordinate and finite center required');
  const reciprocal=nativeComplexReciprocal(p,q);
  const frequency=Math.fround(fma64(mode/-Math.PI,reciprocal.imaginary,center));
  const decay=Math.fround((mode+mode)*reciprocal.real);
  if(![frequency,decay].every(Number.isFinite))throw new RangeError('Finite float32 single-mode outputs required');
  return {frequency:[frequency],decay:[decay],reciprocal,
    solver:{algorithm:'recovered-single-component-fast-path',nativeVoiceTrajectoryVerified:false}};
}
