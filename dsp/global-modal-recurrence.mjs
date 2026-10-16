// 657dfc/667fc4, inspected vector counts divisible by four; coefficient production is external.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround,clipWord=new DataView(new ArrayBuffer(4));clipWord.setUint32(0,0x219392ef);const threshold=clipWord.getFloat32(0);
// 3ca148 coefficient refresh after its control selection and decay limiting.
// mode fields are storage offsets, not inferred physical parameter names.
export function globalModeCoefficientArguments(timeScale,fields){
 const values=[timeScale,...[12,16,20,24,32].map(o=>fields['0x'+o.toString(16)])];
 if(!values.every(Number.isFinite))throw new Error('Invalid global coefficient source fields');
 const [dt,a,b,c,d,decay]=values,t=f(-f(dt*decay)),scale=f(t+1);
 const dc=f(d*scale),cc=f(c*scale);
 return [f(b),fma32(a,cc,-f(b*dc)),f(dc*-2),f(f(t+t)+1)];
}
export class GlobalModalRecurrence64 {
 constructor(config){
  const n=config.vectorCount,s=config.initial;
  if(!Number.isInteger(n)||n<4||n%4||config.coefficients.length!==n*16||s.states.length!==n*8||s.disabled||s.counter!==0||!Object.is(s.previousInput,0)||s.states.some(x=>!Object.is(x,0)))throw new Error('Unverified initial global modal profile');
  this.vectorCount=n;this.coefficients=Float32Array.from(config.coefficients);this.states=new Float32Array(n*8);this.previousInput=0;this.counter=0;this.clips=0;
 }
 setCoefficients(values){
  if(values.length!==this.vectorCount*16||!values.every(Number.isFinite))throw new Error('Invalid global modal coefficient table');
  this.coefficients=Float32Array.from(values);
 }
 setModeCoefficients(index,values){
  if(!Number.isInteger(index)||index<0||index>=this.vectorCount*4||values.length!==4||!values.every(Number.isFinite))throw new Error('Invalid global modal coefficient write');
  const offset=Math.floor(index/4)*16+index%4;
  for(let c=0;c<4;c++)this.coefficients[offset+c*4]=c<2?values[c]:-values[c];
 }
 process64(input,before){
  if(input.length!==64||before.length!==64)throw new Error('64 global modal samples required');
  if(this.counter===4){for(let i=0;i<this.states.length;i++)if(!(Math.abs(this.states[i])>threshold))this.states[i]=0;this.counter=0;this.clips++;}else this.counter++;
  const scratch=new Float32Array(64*4),values=new Float32Array(16),c=this.coefficients,s=this.states;
  for(let batch=0;batch<this.vectorCount;batch+=4){
   for(let i=0;i<64;i++){
    const x=input[i],previous=i?input[i-1]:this.previousInput;
    for(let v=0;v<4;v++)for(let lane=0;lane<4;lane++){
     const co=(batch+v)*16+lane,st=(batch+v)*8+lane;
     const currentFirst=i%4!==2&&(i%4!==0||v===0);
     let y=currentFirst?f(c[co]*x):f(c[co+4]*previous);
     y=currentFirst?fma32(c[co+4],previous,y):fma32(c[co],x,y);y=fma32(s[st+4],c[co+8],y);y=fma32(s[st],c[co+12],y);
     values[v*4+lane]=y;s[st]=s[st+4];s[st+4]=y;
    }
    for(let lane=0;lane<4;lane++)scratch[i*4+lane]=f(scratch[i*4+lane]+f(f(f(values[lane]+values[4+lane])+values[8+lane])+values[12+lane]));
   }
  }
  const output=Float32Array.from(before,(x,i)=>f(x+f(f(scratch[i*4]+scratch[i*4+2])+f(scratch[i*4+1]+scratch[i*4+3]))));
  this.previousInput=f(input[63]);return output;
 }
}
