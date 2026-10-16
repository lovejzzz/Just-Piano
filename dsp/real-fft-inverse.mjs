// Native real inverse pre-combination for the inspected fixed unordered plans.
import {fma32} from './modal-kernel.mjs';
import {buildRealCoreTwiddles32} from './real-fft-core.mjs';
import {buildRealFinalizeCoefficients128} from './real-fft-finalize.mjs';
const f=Math.fround,root2=f(Math.SQRT2);
function preprocessInverseReal(input,e){
 if(![128,1024].includes(input.length)||e.length!==input.length*3/4)throw new Error('Unverified inverse real FFT size');
 const out=new Float32Array(input.length);
 for(let block=0;block<input.length/32;block++)for(let lane=block?0:1;lane<4;lane++){
  const base=block*32,z=j=>input[base+4*j+lane];
  const a=f(z(0)+z(6)),b=f(z(0)-z(6)),c=f(z(1)+z(7)),d=f(z(1)-z(7));
  const t=f(z(2)+z(4)),u=f(z(2)-z(4)),v=f(z(3)+z(5)),w=f(z(3)-z(5));
  const re=[f(t+a),f(b-v),f(a-t),f(v+b)],im=[f(d-w),f(c-u),f(w+d),f(u+c)];
  for(let j=1;j<4;j++){
   const co=e[block*24+(j-1)*8+lane],si=e[block*24+(j-1)*8+4+lane],r=re[j],i=im[j];
   re[j]=!block?f(f(r*co)+f(si*i)):j===1?fma32(r,co,f(si*i)):fma32(si,i,f(r*co));im[j]=fma32(-si,r,f(i*co));
  }
  for(let j=0;j<4;j++){out[base-4+lane*8+j]=re[j];out[base+lane*8+j]=im[j];}
 }
 const a=f(input[0]+input[4]),b=f(input[0]-input[4]),c=f(input[16]+input[16]),d=f(input[20]+input[20]);
 out[0]=f(a+c);out[1]=f(b-d);out[2]=f(a-c);out[3]=f(b+d);
 const t=f(input[8]+input[24]),u=f(input[8]-input[24]),v=f(f(input[12]+input[28])*root2),w=f(input[28]-input[12]);
 const n=input.length;out[n-4]=f(t+t);out[n-3]=fma32(u,root2,-v);out[n-2]=f(w+w);out[n-1]=fma32(u,-root2,-v);
 return out;
}

function backwardStage(input,ido,l1,radix,wa,offset){
 const out=new Float32Array(input.length);
 for(let lane=0;lane<4;lane++)for(let k=0;k<l1;k++){
  const c=(j,i)=>input[((k*radix+j)*ido+i)*4+lane];
  const set=(j,i,x)=>{out[((j*l1+k)*ido+i)*4+lane]=f(x);};
  if(radix===2){
   set(0,0,f(c(0,0)+c(1,ido-1)));set(1,0,f(c(0,0)-c(1,ido-1)));
   for(let i=2;i<ido;i+=2){
    const tr=f(c(0,i-1)-c(1,ido-i-1)),ti=f(c(0,i)+c(1,ido-i)),wr=wa[offset+i-2],wi=wa[offset+i-1];
    set(0,i-1,f(c(0,i-1)+c(1,ido-i-1)));set(0,i,f(c(0,i)-c(1,ido-i)));
    set(1,i-1,fma32(-wi,ti,f(wr*tr)));set(1,i,fma32(wi,tr,f(wr*ti)));
   }
   if(ido>1&&ido%2===0){set(0,ido-1,f(c(0,ido-1)+c(0,ido-1)));set(1,ido-1,f(-c(1,0)-c(1,0)));}
  }else{
   const tr1=f(c(0,0)-c(3,ido-1)),tr2=f(c(0,0)+c(3,ido-1)),tr3=f(c(1,ido-1)+c(1,ido-1)),tr4=f(c(2,0)+c(2,0));
   set(0,0,f(tr2+tr3));set(1,0,f(tr1-tr4));set(2,0,f(tr2-tr3));set(3,0,f(tr1+tr4));
   for(let i=2;i<ido;i+=2){
    const a=f(c(0,i-1)+c(3,ido-i-1)),b=f(c(0,i-1)-c(3,ido-i-1)),cc=f(c(0,i)-c(3,ido-i)),d=f(c(0,i)+c(3,ido-i));
    const e=f(c(2,i-1)+c(1,ido-i-1)),ff=f(c(2,i-1)-c(1,ido-i-1)),g=f(c(2,i)+c(1,ido-i)),h=f(c(2,i)-c(1,ido-i));
    const re=[f(a+e),f(b-g),f(a-e),f(b+g)],im=[f(cc+h),f(d+ff),f(cc-h),f(d-ff)];
    set(0,i-1,re[0]);set(0,i,im[0]);
    for(let j=1;j<4;j++){
     const wr=wa[offset+(j-1)*ido+i-2],wi=wa[offset+(j-1)*ido+i-1];
     set(j,i-1,fma32(-wi,im[j],f(wr*re[j])));set(j,i,fma32(wi,re[j],f(wr*im[j])));
    }
   }
   if(ido>1&&ido%2===0){
    const a=f(c(0,ido-1)+c(2,ido-1)),b=f(c(0,ido-1)-c(2,ido-1)),cc=f(c(1,0)+c(3,0)),d=f(c(3,0)-c(1,0));
    set(0,ido-1,f(a+a));set(1,ido-1,f(root2*f(b-cc)));set(2,ido-1,f(d+d));set(3,ido-1,f(-root2*f(b+cc)));
   }
  }
 }
 return out;
}
export function inverseRealCore32(input,wa){
 if(input.length!==128||wa.length!==32)throw new Error('Unverified inverse FFT core size');
 return backwardStage(backwardStage(backwardStage(input,16,1,2,wa,0),4,2,4,wa,16),1,8,4,wa,28);
}

export function inverseReal128(input){return inverseRealCore32(preprocessInverseReal128(input),buildRealCoreTwiddles32());}

export function preprocessInverseReal128(input,e=buildRealFinalizeCoefficients128()){
 if(input.length!==128)throw new Error('128-point input required');return preprocessInverseReal(input,e);
}
export function preprocessInverseReal1024(input,e){
 if(input.length!==1024)throw new Error('1024-point input required');return preprocessInverseReal(input,e);
}
export function inverseRealCore256(input,wa){
 if(input.length!==1024||wa.length!==256)throw new Error('Unverified inverse FFT256 core size');
 let a=backwardStage(input,64,1,4,wa,0);
 a=backwardStage(a,16,4,4,wa,192);
 a=backwardStage(a,4,16,4,wa,240);
 return backwardStage(a,1,64,4,wa,252);
}
