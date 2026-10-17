// Finite nonzero denominator branch of 9b39e0 (__divdc3), numerator 1+i0.
import {fma64} from './native-double-fma.mjs';
const view=new DataView(new ArrayBuffer(8));
const word=x=>{view.setFloat64(0,x);return view.getBigUint64(0);};
const number=w=>{view.setBigUint64(0,w);return view.getFloat64(0);};
const fractionMask=0xfffffffffffffn,signMask=0x8000000000000000n;
// Exact power-of-two scaling, including one ties-even subnormal rounding.
function scale(x,n){
  if(x===0||!Number.isFinite(x))return x;
  const w=word(x),sign=w&signMask,exponent=Number((w>>52n)&2047n);
  let mantissa=w&fractionMask;
  if(exponent)mantissa|=1n<<52n;
  const power=(exponent?exponent-1075:-1074)+n;
  const size=mantissa.toString(2).length,top=power+size-1;
  if(top>1023)return number(sign|0x7ff0000000000000n);
  if(top>=-1022)return number(sign|(BigInt(top+1023)<<52n)|((mantissa<<BigInt(53-size))&fractionMask));
  const shift=power+1074;
  if(shift>=0)mantissa<<=BigInt(shift);
  else{
    const k=BigInt(-shift),tail=mantissa&((1n<<k)-1n),half=1n<<(k-1n);
    mantissa>>=k;if(tail>half||(tail===half&&(mantissa&1n)))mantissa++;
  }
  return number(sign|mantissa);
}
function exponentOf(x){
  const w=word(x),exponent=Number(w>>52n);
  return exponent?exponent-1023:(w&fractionMask).toString(2).length-1-1074;
}
export function nativeComplexReciprocal(real,imaginary){
  if(![real,imaginary].every(Number.isFinite)||(real===0&&imaginary===0))
    throw new RangeError('Finite nonzero complex denominator required');
  const exponent=exponentOf(Math.max(Math.abs(real),Math.abs(imaginary)));
  const c=scale(real,-exponent),d=scale(imaginary,-exponent);
  const denominator=fma64(c,c,d*d);
  const re=fma64(1,c,0*d)/denominator;
  const im=fma64(0,c,-d)/denominator;
  return {real:scale(re,-exponent),imaginary:scale(im,-exponent)};
}
