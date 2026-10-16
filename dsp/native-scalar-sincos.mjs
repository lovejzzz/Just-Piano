// macOS arm64 __sincosf_stret finite fast branch; distinct from separate sinf/cosf.
import {fma64} from './modal-poles.mjs';
import {fma32} from './modal-kernel.mjs';
const f=Math.fround,view=new DataView(new ArrayBuffer(8));
const number=bits=>{view.setBigUint64(0,bits);return view.getFloat64(0);};
const scale=number(0x3fe45f306dc9c883n);
const a=[0xc02c3d3ee4f8713fn,0xc020bc0396540c13n].map(number);
const b=[0xc02ef09ab49e3a5bn,0xc02d6f5ade6c8c37n].map(number);
const c=[0x3f24bc899499342cn,0x3f4d9c364e9721d5n].map(number);
const d=[0x40444921a30f0d80n,0x401d78212789bc11n].map(number);
const e=[0x406e97264e36bd93n,0x4062c6b9c7f88fa0n].map(number);
function roundEven(x){const low=Math.floor(x),part=x-low;return part<.5?low:part>.5?low+1:low%2?low+1:low;}
export function nativeScalarSinCos(value){
 value=f(value);
 if(!Number.isFinite(value)||Math.abs(value)>=120)throw new RangeError('Outside inspected sincosf fast range');
 if(Math.abs(value)<2**-12)return {sin:f(fma32(value,2**26,value)*2**-26),cos:f(f(2**26-Math.abs(value))*2**-26)};
 const scaled=value*scale,n=roundEven(scaled),r=scaled-n,q=r*r;
 const result=c.map((v,i)=>f(((i===0?r*v:v)*fma64(q,q+a[i],d[i]))*fma64(q,q+b[i],e[i])));
 if(n&2){result[0]=-result[0];result[1]=-result[1];}
 return n&1?{sin:result[1],cos:-result[0]}:{sin:result[0],cos:result[1]};
}
