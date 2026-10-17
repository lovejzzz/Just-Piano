// 41e5b4: editable duration/curve, base note table and condition variation.
// This helper precedes 1c5320 frequency-floor and instrument-specific overrides.
import {linearModelCurve} from './model-curves.mjs';
import {fma64} from './modal-poles.mjs';
const f=Math.fround,word=new DataView(new ArrayBuffer(4));
const bits=x=>{word.setFloat32(0,x);return word.getUint32(0);};
function field(rows,offset,kind){
 const found=rows?.filter(r=>r.object_offset===offset);
 if(found?.length!==1||found[0].kind!==kind)throw new Error('Unique decoded damping field required: '+offset.toString(16));
 return found[0].value;
}
const uint=x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff;
function conditionHash(hostSeed,conditionSeed,note){
 const m=0x5bd1e995,mix=x=>Math.imul((Math.imul(x,m)^(Math.imul(x,m)>>>24)),m)>>>0;
 let h=(Math.imul(hostSeed,m)+0x9f0b1419)>>>0;
 h=(Math.imul(h^(h>>>24),m)^0xc84259c2)>>>0;
 h=(Math.imul(h,m)^mix(conditionSeed))>>>0;
 // FMOV w10,s8 hashes the float32 word; it does not convert the note to int.
 h=(Math.imul(h,m)^mix(bits(note)))>>>0;
 h=Math.imul(h^(h>>>13),m)>>>0;
 return (h^(h>>>15))>>>0;
}
export function archiveDampingDuration({editFields,baseFields,note,runtimeMode,hostSeed}){
 if(!Number.isFinite(note))throw new Error('Finite model note required');
 note=f(note);
 const enabled=field(editFields,0x10a8,'u32'),duration=field(editFields,0x1334,'f32'),curve=field(editFields,0x1338,'curve');
 const condition=field(editFields,0x1398,'f32'),conditionSeed=field(editFields,0x139c,'u32'),mode=field(editFields,0x45c,'u32');
 if(![enabled,conditionSeed,mode].every(uint)||![duration,condition].every(Number.isFinite))throw new Error('Finite decoded damping controls required');
 const table=field(baseFields,0x1c10,'vf');
 if(!Array.isArray(table)||!table.length||!table.every(Number.isFinite))throw new Error('Finite base damping table required');
 // FCVTAU: nearest integer, halfway away from zero, then subtract one.
 const index=Math.round(note)-1;
 if(index<0||index>=table.length)throw new Error('Damping note outside base table');
 let multiplier=1,curveValue;
 if(enabled!==0){
  const values=linearModelCurve(curve,note,{runtimeMode});
  if(values.length!==1)throw new Error('Scalar damping curve required');
  curveValue=values[0];multiplier=Math.min(15,Math.max(f(.01),f(f(duration)*curveValue)));
 }
 let value=f(multiplier*f(table[index])),hash;
 if(f(condition)!==0&&mode!==2){
  if(!uint(hostSeed))throw new Error('Explicit host condition seed required for active condition');
  hash=conditionHash(hostSeed,conditionSeed,note);
  const random=f(hash/2**32),square=f(random*random);
  const scaled=f(condition)*.1,extent=(scaled*scaled)*3;
  value=f(fma64(extent,square,value));
 }
 return {note,index,curveValue,multiplier,hash,duration:Math.min(50,Math.max(f(.005),value)),conditionActive:f(condition)!==0&&mode!==2,globalFrequencyFloorApplied:false,instrumentOverridesApplied:false};
}
