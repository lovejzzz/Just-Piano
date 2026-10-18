// Static zero-history 88454c -> 4d3a10 -> 364a18 equalizer, types 1..4.
import {nativeScalarExp} from './native-scalar-exp.mjs';
import {nativeScalarSin,nativeScalarCos} from './native-scalar-sin.mjs';
import {buildVectorFilterTable,renderVectorFilter} from './vector-filter.mjs';
const f=Math.fround;
export function designAuxiliaryEQ(frequency,decibels,q,type,sampleRate){
 if(![frequency,decibels,q,sampleRate].every(v=>Number.isFinite(v)&&Number.isFinite(f(v)))||q<=0||sampleRate<=0||![1,2,3,4].includes(type))
  throw new RangeError('Finite static auxiliary EQ type 1..4 required');
 frequency=Math.min(f(frequency),f(f(sampleRate)/2.001));
 const normalized=Math.max(f(3e-5),Math.min(f(.99997),f(frequency/f(f(sampleRate)*.5))));
 const angle=f(normalized*Math.PI),A=nativeScalarExp(f(f(f(decibels)/40)*f(2.3025851)));
 const alpha=f(nativeScalarSin(angle)/f(f(q)+f(q))),cosine=nativeScalarCos(angle);
 let b0,b1,b2,a0,a1,a2,gain=1;
 if(type===1){
  const z=f(A*alpha),v=f(alpha/A);b0=f(z+1);b1=f(cosine*-2);b2=f(1-z);
  a0=f(v+1);a1=b1;a2=f(1-v);
 }else if(type===4){
  b1=f(1-cosine);b0=f(b1*.5);b2=b0;a0=f(alpha+1);a1=f(cosine*-2);a2=f(1-alpha);gain=f(A*A);
 }else{
  const sum=f(A+1),difference=f(A-1),product=f(difference*cosine),root=f(Math.sqrt(A)),spread=f(f(root+root)*alpha);
  if(type===2){
   const z=f(sum-product);b0=f(A*f(z+spread));b1=f(f(A+A)*f(difference-f(sum*cosine)));b2=f(A*f(z-spread));
   const z2=f(sum+product);a0=f(z2+spread);a1=f(f(difference+f(sum*cosine))*-2);a2=f(z2-spread);
  }else{
   const z=f(sum+product);b0=f(A*f(z+spread));b1=f(f(A*-2)*f(difference+f(sum*cosine)));b2=f(A*f(z-spread));
   const z2=f(sum-product);a0=f(z2+spread);a1=f(f(difference-f(sum*cosine))*2);a2=f(z2-spread);
  }
 }
 if(Math.abs(b0)<=1e-20||Math.abs(a0)<=1e-20||![b0,b1,b2,a0,a1,a2,gain].every(Number.isFinite))
  throw new RangeError('Degenerate auxiliary EQ section is unsupported');
 const invB=f(1/b0),invA=f(1/a0);
 return {gain:f(invA*f(gain*b0)),coefficients:Float32Array.of(f(b1*invB),f(b2*invB),-f(a1*invA),-f(invA*a2))};
}
export function equalizeAuxiliaryWavelet(input,controls,sampleRate){
 if(!Array.isArray(controls)||controls.length%4)
  throw new RangeError('EQ quadruples required');
 if(controls.length===0)return Float32Array.from(input);
 if(input.length%4)
  throw new RangeError('Aligned source and EQ quadruples required; scalar rendering is not implemented');
 const sections=[];
 for(let i=0;i<controls.length;i+=4)sections.push(designAuxiliaryEQ(...controls.slice(i,i+4),sampleRate));
 const table=new Float32Array(sections.length*32);
 sections.forEach((s,i)=>{const c=s.coefficients;table.set(buildVectorFilterTable(s.gain,f(c[0]*s.gain),f(s.gain*c[1]),c[2],c[3]),i*32);});
 return renderVectorFilter(input,table,new Float32Array(sections.length*4));
}
