// 951c80 preparation and 29d444 samplewise onset oscillator / optional filter.
// Double oscillator step and filter coefficients remain explicit inputs.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround;
export function modalOnsetDuration({models,expression,balance,noteIndex},source,header,sampleRate){
 if(models?.length!==4||![...models,expression,balance,sampleRate].every(Number.isFinite)||!Number.isInteger(noteIndex)||noteIndex<0||sampleRate<=0)throw new RangeError('Finite onset source controls required');
 const [a,b,c,d]=models.map(f),low=fma32(f(expression),f(d-b),b),high=fma32(f(expression),f(c-a),a);
 const mixed=fma32(high,f(1-f(balance)),f(f(balance)*low));
 const scale=f(f(mixed*f(noteIndex))/21),columns=header[0],row=header[4];
 if(!Number.isInteger(columns)||columns<1||!Number.isInteger(row)||row<0||row>=header[1])throw new RangeError('Valid onset reference row required');
 let sum=0;for(let i=0;i<columns;i++)sum=f(sum+source.frequency[row*columns+i]);
 const average=f(sum/f(columns)),duration=Math.trunc(f(f(sampleRate)*f(scale/average)))+1;
 if(!Number.isFinite(average)||average<=0||!Number.isInteger(duration)||duration<=0||duration>0xfffffff0)throw new RangeError('Positive finite onset duration required');
 return {duration,scale,average};
}
export class ModalOnsetEnvelope{
 constructor({duration,square,step,coefficients}){
  if(!Number.isInteger(duration)||duration<=0||duration>0xfffffff0||typeof square!=='boolean'||step?.length!==2||coefficients?.length!==3||![...step,...coefficients].every(Number.isFinite))throw new RangeError('Complete numerical onset initialization required');
  this.settle=square?0:6;this.remaining=duration+this.settle;this.delay=0;this.square=square;this.filtered=!square;
  this.sine=0;this.cosine=1;this.step=[...step];this.coefficients=coefficients.map(f);this.history=[0,0];
 }
 process(samples){
  if(!Number.isInteger(samples)||samples<=0)throw new RangeError('Positive onset block required');
  const output=new Float32Array(samples);output.fill(1);
  let i=0;while(i<samples&&this.delay){output[i++]=0;this.delay--;}
  for(;i<samples&&this.remaining;i++){
   let value;
   if(this.remaining<this.settle){this.sine=1;value=1;}
   else{
    const a=this.sine*this.step[1],b=this.cosine*this.step[0],c=this.cosine*this.step[1],d=this.sine*this.step[0];
    this.sine=a+b;this.cosine=c-d;value=f(this.sine);
   }
   if(this.square)value=f(value*value);
   if(this.filtered){
    const [b1,b0,a1]=this.coefficients;
    const y=fma32(-a1,this.history[0],fma32(value,b0,f(b1*this.history[1])));
    this.history=[y,value];value=y;
   }
   output[i]=value;this.remaining--;
  }
  return output;
 }
}
