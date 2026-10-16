import {nativeScalarSinCos} from './native-scalar-sincos.mjs';
const f=Math.fround;
// Fixed real N=1024 plan: four lanes, core 256=4*4*4*4.
export function buildReal1024Coefficients(){
 const twiddle=new Float32Array(256),usedTwiddle=new Uint8Array(256),e=new Float32Array(768);
 const unit=f(2*Math.PI/256);let l1=1,offset=0;
 for(const radix of [4,4,4,4]){
  const ido=256/(l1*radix);
  for(let j=1;j<radix;j++){
   const base=f(j*l1*unit);
   for(let i=1;i<Math.floor((ido+1)/2);i++){
    const angle=f(i*base),index=offset+2*(i-1);
    const pair=nativeScalarSinCos(angle);twiddle[index]=pair.cos;twiddle[index+1]=pair.sin;usedTwiddle[index]=usedTwiddle[index+1]=1;
   }offset+=ido;
  }l1*=radix;
 }
 const finalUnit=f(-2*Math.PI/1024);
 for(let block=0;block<32;block++)for(let j=1;j<4;j++){
  const base=f(finalUnit*j),index=block*24+(j-1)*8;
  for(let lane=0;lane<4;lane++){
   const angle=f(base*(block*4+lane)),pair=nativeScalarSinCos(angle);e[index+lane]=pair.cos;e[index+4+lane]=pair.sin;
  }
 }
 return {twiddle,usedTwiddle,e};
}
