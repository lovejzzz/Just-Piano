// macOS arm64 libsystem_m sinf fast finite range, inspected on build 25F80.
// Arguments at |x| >= 120 and nonfinite inputs are deliberately unsupported.
import { fma64 } from './modal-poles.mjs';
import { fma32 } from './modal-kernel.mjs';
const f = Math.fround;
const view = new DataView(new ArrayBuffer(8));
const from64 = bits => { view.setBigUint64(0,bits); return view.getFloat64(0); };
const scale = from64(0x3fe45f306dc9c883n);
const halfPi = from64(0x3ff921fb54442d18n);
const cosine = [0x3ef99169fc938f4an,0xbf56c07f16945df4n,0x3fa55553c7899699n,0xbfdffffffcb82e97n].map(from64);
const sine = [0xbf29943e0fc4818fn,0x3f811073afd145ebn,0xbfc555545268a02an].map(from64);
function roundEven(value) {
  const low=Math.floor(value), delta=value-low;
  return delta<.5 ? low : delta>.5 ? low+1 : low%2 ? low+1 : low;
}
function sinePolynomial(x) {
  const square=x*x, cubic=x*square, fifth=square*cubic;
  return fma64(fifth,fma64(square,sine[0],sine[1]),fma64(cubic,sine[2],x));
}
function cosinePolynomial(x) {
  const square=x*x;
  const high=fma64(square,cosine[0],cosine[1]);
  const low=fma64(square,cosine[2],cosine[3]);
  return fma64(square,fma64(square*square,high,low),1);
}
export function nativeScalarSin(value) {
  value=f(value);
  if(!Number.isFinite(value) || Math.abs(value)>=120) throw new RangeError('Outside inspected scalar sinf fast range');
  if(Math.abs(value)<2**-12) return f(fma32(value,2**26,value)*2**-26);
  if(Math.abs(value)<f(Math.PI/4)) return f(sinePolynomial(value));
  const n=roundEven(value*scale);
  const reduced=fma64(-n,halfPi,value);
  const result=(n&1) ? cosinePolynomial(reduced) : sinePolynomial(reduced);
  return f((n>>1)&1 ? -result : result);
}
