// 1c5b40..1c5c14 and 718010..7180b0: final duration and terminal model fields.
// Source decay row, reference frequency and instrument flag remain explicit inputs.
import {archiveDampingDuration} from './archive-damping-duration.mjs';
import {fma32} from './modal-kernel.mjs';
const f=Math.fround,word=new DataView(new ArrayBuffer(4));
const fromBits=x=>{word.setUint32(0,x);return word.getFloat32(0);};
export function terminalSlopesFromDecayRow({columns,rows,selectedRow,decayRow}){
 if(![columns,rows,selectedRow].every(x=>Number.isInteger(x)&&x>=0)||!Array.isArray(decayRow)||!decayRow.every(x=>Number.isFinite(x)&&Number.isFinite(f(x))))throw new Error('Finite terminal decay row required');
 if(rows===0?decayRow.length!==0:columns<1||selectedRow>=rows||decayRow.length!==columns)throw new Error('Complete selected decay row required');
 let minimum=null;
 if(rows!==0){minimum=f(decayRow[0]);for(let i=1;i<decayRow.length;i++)if(minimum>f(decayRow[i]))minimum=f(decayRow[i]);}
 return {primary:minimum===null?1:Math.max(minimum,1),secondary:0,minimum,selectedRow,columns,rows};
}
export function archiveTerminalVoiceModel({archive,note,modelSources}){
 const {columns,rows,selectedRow,decayRow,referenceFrequency,instrumentDurationFlag}=modelSources;
 if(![columns,rows,selectedRow].every(x=>Number.isInteger(x)&&x>=0)||!Number.isFinite(referenceFrequency)||!Number.isInteger(instrumentDurationFlag)||instrumentDurationFlag<0||instrumentDurationFlag>255||!Array.isArray(decayRow)||!decayRow.every(Number.isFinite))throw new Error('Finite terminal model source context required');
 if(rows===0?decayRow.length!==0:columns<1||selectedRow>=rows||decayRow.length!==columns)throw new Error('Complete selected decay row required');
 const helper=archiveDampingDuration({...archive,note}),frequency=f(referenceFrequency);
 const frequencyFloor=frequency>0?f(2/frequency):0;
 let duration=Math.max(frequencyFloor,helper.duration);
 const slopes=terminalSlopesFromDecayRow({columns,rows,selectedRow,decayRow});
 const instrumentOverride=instrumentDurationFlag===1;
 if(instrumentOverride){
  const low=f(note)<60,ratio=f(f(f(note)+(low?-21:-60))/(low?39:48));
  // FMSUB: addend minus product, with a single float32 rounding.
  duration=fma32(-ratio,fromBits(low?0x3fa147ae:0x3df5c288),fromBits(low?0x40066666:0x3f570a3d));
 }
 return {helper,frequencyFloor,frequencyFloorActive:frequencyFloor>helper.duration,instrumentOverride,duration,primary:{slope:slopes.primary,scale:Math.min(duration,1)},secondary:{slope:0,scale:duration},lateDurationOverridesProduced:false};
}
