import {processVoiceConsumerCross} from '../dsp/voice-consumer-cross.mjs';

export function verifyConsumerCross(data,injection,check,setContext=()=>{},auxiliarySource,auxiliaryMidSource){
 if(data.consumerCross!==true||!data.consumerPost||!injection?.postMode)throw new Error('Same-run post-release and cross observations required');
 const key=r=>`${r.epoch}:${r.counter}`,post=new Map(),cross=new Map();
 for(const r of data.records){
  const map=r.stage==='consumerPost'?post:r.stage==='consumerCross'?cross:undefined;
  if(map){if(map.has(key(r)))throw new Error('Duplicate cross interval');map.set(key(r),r);}
 }
 if(!post.size||post.size!==cross.size||post.size!==injection.postComparedBlocks)throw new Error('Incomplete cross observation coverage');
 const array=(name,a,b)=>{if(a.length!==b?.length)throw new Error('Incomplete '+name);a.forEach((x,i)=>check(name,x,b[i]));};
 const outputs=[];let samples=0,clearedGroupBlocks=0,clearedAuxiliaryBlocks=0;
 for(const source of injection.outputs){
  const before=post.get(key(source));if(!before)continue;
  const target=cross.get(key(source));if(!target||target.voice!==before.voice)throw new Error('Missing or misbound cross output');
  setContext({stage:'consumerCross',epoch:source.epoch,age:source.counter});
  const aux=before.auxiliary;
  if(!aux||aux.samples!==64||aux.rows!==aux.values.length||!target.auxiliary||target.auxiliary.rows!==aux.rows||target.auxiliary.samples!==64)throw new Error('Complete same-run auxiliary matrix required');
  const calculatedAuxiliary=auxiliarySource?auxiliarySource.get(key(source)):aux.values;
  if(!calculatedAuxiliary)throw Error('Missing calculated auxiliary interval');
  const result=processVoiceConsumerCross(source.channels,calculatedAuxiliary,before.crossControls);
  if(target.channels.length!==3||target.auxiliary.values.length!==result.auxiliary.length)throw new Error('Cross matrix dimensions differ');
  result.channels.forEach((row,i)=>array('consumer-cross:output',Array.from(row),target.channels[i]));
  result.auxiliary.forEach((row,i)=>array('consumer-cross:auxiliary',Array.from(row),target.auxiliary.values[i]));
  if(!(before.crossControls.keepGroups&1))clearedGroupBlocks++;
  if(!(before.crossControls.keepAuxiliary&1))clearedAuxiliaryBlocks++;
  samples+=3*64;
  outputs.push({epoch:source.epoch,counter:source.counter,channels:result.channels.map(x=>Array.from(x)),auxiliary:result.auxiliary.map(x=>Array.from(x))});
 }
 if(outputs.length!==post.size)throw new Error('Missing calculated post-release cross source');
 return {auxiliaryMidSource,outputs,blocks:outputs.length,outputSamples:samples,clearedGroupBlocks,clearedAuxiliaryBlocks,sameRunComputedGroupInputs:true,controlsObserved:true,auxiliarySourceObserved:!auxiliarySource,activeProcessorsImplemented:false,fullConsumerTailImplemented:false};
}
