// 460fc4..461120: terminal mono/auxiliary rows -> mono coupling and spatial rows.
import {fma32} from './modal-kernel.mjs';
import {combineThenRestoreGroups,distributeAuxiliary} from './voice-spatial-output.mjs';
import {initializeSpatialSleep,renderSpatialWithSleep} from './voice-spatial-sleep.mjs';
const f=Math.fround,word=new DataView(new ArrayBuffer(4));
const fromBits=x=>{word.setUint32(0,x,true);return word.getFloat32(0,true);};
export function voiceCouplingMono64(combined,auxiliary,fraction,otherFraction){
 if(combined.length!==64||auxiliary.length!==64||![fraction,otherFraction,...combined,...auxiliary].every(Number.isFinite))throw Error('Finite complete coupling input required');
 const keepFirst=f(1-fraction),keepSecond=f(1-otherFraction);
 const direct=f(keepSecond+keepSecond),a=f(fraction*keepSecond),b=f(otherFraction*keepFirst),sum=f(a+b),auxGain=f(sum+sum);
 return Float32Array.from(combined,(value,i)=>fma32(value,direct,f(auxiliary[i]*auxGain)));
}
export class VoiceSpatialEndpoint64{
 constructor(profile){
  const c=profile.configuration;
  if(profile.rows.length!==3||c.monoNonlinearity!==0||c.auxNonlinearity!==0||c.rowGainWords.length!==3||c.rowGainWords.map(fromBits).some(x=>x!==1)||
    Object.entries({'0x88':1,'0xb0':1,'0xbc':1,'0xbd':0,'0xfc':1}).some(([key,value])=>c.flags[key]!==value))throw Error('Inspected constant linear spatial profile required');
  this.configuration=structuredClone(c);this.fade={...c.fade,counter:0};this.sleep=initializeSpatialSleep(c.sleepThreshold);
  this.rows=profile.rows.map(row=>{
   if(row.tapWords.length!==20||!row.ringAllPositiveZero)throw Error('Cold five-tap spatial profile required');
   const taps=Array.from({length:5},(_,i)=>({start:row.tapWords[i*4],end:row.tapWords[i*4+1],c:fromBits(row.tapWords[i*4+2]),g:fromBits(row.tapWords[i*4+3])}));
   return {vectors:row.vectors,counter:taps[0].end,taps,ring:new Float32Array(row.vectors*4)};
  });
  this.blocks=0;this.mixedBlocks=0;this.inactiveBlocks=0;
 }
 process64(groups,auxiliary){
  if(groups.length!==3||auxiliary.length!==3||[...groups,...auxiliary].some(row=>row.length!==64||!row.every(Number.isFinite)))throw Error('Complete finite terminal audio required');
  const merged=combineThenRestoreGroups(groups),c=this.configuration;
  const mono=voiceCouplingMono64(merged.combined,auxiliary[0],c.fraction,c.otherFraction);
  const spatial=renderSpatialWithSleep(merged.groups,this.rows,this.fade,this.sleep);
  const split=distributeAuxiliary(spatial.output[0],auxiliary,c.fraction);
  this.blocks++;if(spatial.mixed)this.mixedBlocks++;if(spatial.allInactive)this.inactiveBlocks++;
  return {mono,spatial:[split.primary,...spatial.output.slice(1)].flat().concat(split.auxiliary)};
 }
}
