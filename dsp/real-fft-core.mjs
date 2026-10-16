// Four-lane real FFT core for the inspected 32 = 2*4*4 factorization.
import {fma32} from './modal-kernel.mjs';
const f=Math.fround,halfRoot=f(Math.SQRT1_2);
function stage(input,ido,l1,radix,twiddle,offset){
 const out=new Float32Array(input.length);
 for(let lane=0;lane<4;lane++)for(let k=0;k<l1;k++){
  const c=(j,i)=>input[((j*l1+k)*ido+i)*4+lane];
  const set=(j,i,v)=>{out[((k*radix+j)*ido+i)*4+lane]=f(v);};
  if(radix===2){
   set(0,0,f(c(0,0)+c(1,0)));set(1,ido-1,f(c(0,0)-c(1,0)));
   for(let i=2;i<ido;i+=2){
    const wr=twiddle[offset+i-2],wi=twiddle[offset+i-1];
    const tr=fma32(wi,c(1,i),f(wr*c(1,i-1))),ti=fma32(-wi,c(1,i-1),f(wr*c(1,i)));
    set(0,i-1,f(c(0,i-1)+tr));set(1,ido-i-1,f(c(0,i-1)-tr));
    set(0,i,f(c(0,i)+ti));set(1,ido-i,f(ti-c(0,i)));
   }
   if(ido>1&&ido%2===0){set(0,ido-1,c(0,ido-1));set(1,0,-c(1,ido-1));}
  }else{
   const tr1=f(c(1,0)+c(3,0)),tr2=f(c(0,0)+c(2,0));
   set(0,0,f(tr1+tr2));set(3,ido-1,f(tr2-tr1));
   set(1,ido-1,f(c(0,0)-c(2,0)));set(2,0,f(c(3,0)-c(1,0)));
   for(let i=2;i<ido;i+=2){
    const re=[c(0,i-1)],im=[c(0,i)];
    for(let j=1;j<4;j++){
     const wr=twiddle[offset+(j-1)*ido+i-2],wi=twiddle[offset+(j-1)*ido+i-1];
     re[j]=fma32(wr,c(j,i-1),f(wi*c(j,i)));im[j]=fma32(-wi,c(j,i-1),f(wr*c(j,i)));
    }
    const tr1=f(re[1]+re[3]),tr4=f(re[3]-re[1]),ti1=f(im[1]+im[3]),ti4=f(im[1]-im[3]);
    const tr2=f(re[0]+re[2]),tr3=f(re[0]-re[2]),ti2=f(im[0]+im[2]),ti3=f(im[0]-im[2]);
    set(0,i-1,f(tr1+tr2));set(0,i,f(ti1+ti2));
    set(3,ido-i-1,f(tr2-tr1));set(3,ido-i,f(ti1-ti2));
    set(2,i-1,f(ti4+tr3));set(2,i,f(tr4+ti3));
    set(1,ido-i-1,f(tr3-ti4));set(1,ido-i,f(tr4-ti3));
   }
   if(ido>1&&ido%2===0){
    const ti1=f(-halfRoot*f(c(1,ido-1)+c(3,ido-1))),tr1=f(halfRoot*f(c(1,ido-1)-c(3,ido-1)));
    set(0,ido-1,f(tr1+c(0,ido-1)));set(2,ido-1,f(c(0,ido-1)-tr1));
    set(1,0,f(ti1-c(2,ido-1)));set(3,0,f(ti1+c(2,ido-1)));
   }
  }
 }
 return out;
}
export function forwardRealCore32(input,twiddle){
 if(input.length!==128||twiddle.length!==32)throw new Error('Unverified FFT core size');
 let a=stage(input,1,8,4,twiddle,28);
 a=stage(a,4,2,4,twiddle,16);
 return stage(a,16,1,2,twiddle,0);
}

// Fixed-plan coefficients numerically checked against native setup; setup call path remains open.
export function buildRealCoreTwiddles32(){
 const result=new Float32Array(32),unit=f(2*Math.PI/32);
 let l1=1,offset=0;
 for(const radix of [2,4]){
  const ido=32/(l1*radix);
  for(let j=1;j<radix;j++){
   const base=f(j*l1*unit);
   for(let i=1;i<Math.floor((ido+1)/2);i++){
    const angle=f(i*base);
    result[offset+2*(i-1)]=f(Math.cos(angle));result[offset+2*(i-1)+1]=f(Math.sin(angle));
   }
   offset+=ido;
  }
  l1*=radix;
 }
 return result;
}
