// 288f38 position weights, including the frequency curve for p < .125.
import {nativeVectorCos} from './native-vector-cos.mjs';
import {nativeVectorExpLane} from './native-vector-exp.mjs';
import {fma32} from './modal-kernel.mjs';
import {positionExtraCurve} from './position-extra-curve.mjs';
const f=Math.fround;
// 43dcb0 initializes V+92c from the model note index, not from audio fitting.
export function positionWeightWarmupBlocks(noteIndex){
 if(!Number.isInteger(noteIndex)||noteIndex<0||noteIndex>127)throw new RangeError('MIDI-range model note index required');
 return ((noteIndex^0x3a9)%40)+8;
}
export function modalPositionWeights({frequency,indexStorage,layout,position,referenceFrequency,rolloff,cutoffIndex,extraCurve}){
 if(!frequency?.length||!Array.from(frequency).every(Number.isFinite)||![position,referenceFrequency,rolloff].every(Number.isFinite)||referenceFrequency<=0||rolloff<=0||position<0||!Number.isInteger(cutoffIndex)||cutoffIndex<0||cutoffIndex>0xffffffff)throw new RangeError('Finite numerical position controls required');
 const scale=f((f(position)*(2*Math.PI))/f(referenceFrequency)),decay=f(-1/f(rolloff)),limit=f(f(cutoffIndex)-1);
 const result=new Float32Array(frequency.length),extraScale=fma32(f(position),-8,1);
 if(extraScale>0&&!extraCurve)throw new RangeError('Extra position curve required below .125');
 for(const [start,padded,,count] of layout){
  const end=Math.ceil((start+count)/4)*4;
  if(![start,padded,count].every(Number.isInteger)||start<0||start%4||count<0||end>padded||end>frequency.length)throw new RangeError('Complete four-lane position groups required');
  for(let lane=start;lane<end;lane+=4){
   const angles=Array.from({length:4},(_,i)=>f(frequency[lane+i]*scale));
   const cosine=nativeVectorCos(angles);
   for(let i=0;i<4;i++){
    const index=lane+i;
    if(!Number.isFinite(indexStorage?.[index])||indexStorage[index]<0)throw new RangeError('Complete native index storage required');
    const weight=f(f(0-cosine[i])*nativeVectorExpLane(f(frequency[index]*decay)));
    // Inter-group sentinels are masked, but the final storage tail is zero
    // and can pass this mask even though its amplitude and energy are zero.
    result[index]=f(indexStorage[index])<=limit?weight:0;
   }
  }
  if(extraScale>0)for(let lane=start;lane<start+count;lane++)result[lane]=fma32(extraScale,positionExtraCurve(extraCurve,frequency[lane]),result[lane]);
 }
 return result;
}
