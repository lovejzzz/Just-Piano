// macOS 25F80 arm64 _simd_cos_f4, used by Accelerate vcosf.
// Vector-wide fast/slow selection matters even for the small lanes.
import {fma32} from './modal-kernel.mjs';
import {fma64} from './modal-poles.mjs';
const f=Math.fround,view=new DataView(new ArrayBuffer(8));
const word=x=>{view.setUint32(0,x);return view.getFloat32(0);};
const double=x=>{view.setBigUint64(0,BigInt('0x'+x));return view.getFloat64(0);};
const TABLE=`
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
3fd45f306e000000 bdeb1bbead603d8b 3fd45f306e000000 bdeb1bbead603d8b
bfc7419f24000000 bdeb1bbead603d8b bfad067c92000000 3dc391054a7f09d6
3f77cc1b72000000 3d9c882a53f84eb0 bf6067c91b000000 bd6bbead603d8a83
bf09f246c7000000 3d0054a7f09d5f48 bf09f246c7000000 3d0054a7f09d5f48
bf09f246c7000000 3d0054a7f09d5f48 3ee836e4e4000000 3d0054a7f09d5f48
becf246c6f000000 3ca529fc2757d1f5 3e7b727221000000 bc95ac07b1505c16
3e7b727221000000 bc95ac07b1505c16 be5236377d000000 bc76b01ec5417056
3e4b939105000000 3c629fc2757d1f53 be21b1bbeb000000 3c34fe13abe8fa9a
bdeb1bbead000000 bc080f62a0b82b2d bdeb1bbead000000 bc080f62a0b82b2d
3dc391054a000000 3befc2757d1f534e 3d9c882a54000000 bb7ec54170565912
bd6bbead60000000 bb7ec54170565912 bd6bbead60000000 bb7ec54170565912
3d41054a7f000000 3b33abe8fa9a6ee0 3d0054a7f1000000 bb28a82e0acb223f
3d0054a7f1000000 bb28a82e0acb223f 3ca529fc27000000 3ac5f47d4d377037
3ca529fc27000000 3ac5f47d4d377037 3ca529fc27000000 3ac5f47d4d377037
3c84a7f09d000000 3aa7d1f534ddc0db 3c629fc275000000 3a8f47d4d377036e
3c34fe13ac000000 ba370565911f924f bc2603d8a8000000 ba370565911f924f
bc080f62a1000000 3a21f534ddc0db63 3befc2757d000000 39ef534ddc0db629
bb7ec54170000000 b99596447e493ad5 bb7ec54170000000 b99596447e493ad5
bb7ec54170000000 b99596447e493ad5 3b33abe8fb000000 b9596447e493ad4d
3b33abe8fb000000 b9596447e493ad4d bb28a82e0b000000 393a6ee06db14acd
3b0d5f47d5000000 b916447e493ad4ce bad505c159000000 b8f911f924eb5336
3ac5f47d4d000000 38dbb81b6c52b328 3aa7d1f535000000 b8b11f924eb53362
3a8f47d4d3000000 38adc0db6295993c ba37056591000000 b83f924eb53361de
ba37056591000000 b83f924eb53361de 3a21f534de000000 b83f924eb53361de
39ef534ddc000000 37db6c52b3278872 39ef534ddc000000 37db6c52b3278872
b99596447e000000 b7b24eb53361de38 b99596447e000000 b7b24eb53361de38
3984d37703000000 37ab6295993c4390 39634ddc0e000000 b78275a99b0ef1bf
`.trim().split(/\s+/).map(double);
function roundEven(x){const a=Math.floor(x),d=x-a;return d<.5?a:d>.5?a+1:a%2?a+1:a;}
function polynomial(r,slow){
 const squared=f(r*r);
 let p=fma32(squared,word(slow?0x362ec33b:0x362ec335),word(slow?0xb94fb6c5:0xb94fb6cf));
 p=fma32(squared,p,word(slow?0x3c088767:0x3c088764));
 p=fma32(squared,p,word(0xbe2aaaa6));
 return slow?fma32(f(squared*p),r,r):fma32(p,f(squared*r),r);
}
export function nativeVectorCos(angles){
 if(angles?.length!==4)throw new RangeError('Four cosine lanes required');
 const input=Array.from(angles,f),fast=input.every(x=>Math.abs(x)<=word(0x49742400));
 return Float32Array.from(input,x=>{
  if(!Number.isFinite(x))return NaN;
  let r,n;
  if(fast){
   const absolute=Math.abs(x),z=f(f(absolute+word(0x3fc90fdb))*word(0x3ea2f983));
   n=roundEven(z);const k=f(n-.5);
   r=fma32(k,word(0xc0490fdb),absolute);
   r=fma32(k,word(0x33bbbd2e),r);
   r=fma32(k,word(0x27772ced),r);
   if(n%2)r=-r;
  }else{
   view.setFloat32(0,x);const index=(view.getUint32(0)>>>23)&0xfe;
   const z=fma64(TABLE[index],x,.5);n=roundEven(z);
   r=fma64(TABLE[index+1],x,z-n);if(n%2)r=-r;
   r=f(f(r)*word(0x40490fdb));
  }
  return polynomial(r,!fast);
 });
}
