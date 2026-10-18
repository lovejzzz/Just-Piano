import {generateAuxiliaryWaveform} from './auxiliary-generated-waveform.mjs';
import {createSoundboardResamplingPlan,resampleSoundboardResponse} from './soundboard-resampling.mjs';
export function generateAuxiliaryBank(group,targetRate=48000){
 if(group?.version!==1||group.integer20!==1||group.sub0?.version!==2||
    !Number.isInteger(group.sub0.integer18)||group.sub0.integer18<1||group.sub0.integer18>64||
    !Array.isArray(group.vector28)||!group.vector28.length||group.vector28.length>128||
    new Set(group.vector28).size!==group.vector28.length||group.vector28.some(k=>!Number.isInteger(k)||k<0||k>127)||
    !Array.isArray(group.sub0.records)||targetRate!==48000)
  throw new RangeError('Supported kind1 descriptor bank and explicit 48kHz output required');
 const bank=new Map();
 for(const key of group.vector28){
  const matches=group.sub0.records.filter(d=>d.integer0===key);
  if(matches.length!==1)throw new RangeError('Each selected source key requires one generated descriptor; resource fallback unsupported');
  const descriptor=matches[0];
  if(!Number.isInteger(descriptor.integerc)||descriptor.integerc<0||descriptor.integerc>0xffffffff)
   throw new RangeError('Unsigned descriptor seed required before variant addition');
  for(let variant=0;variant<group.sub0.integer18;variant++){
   const generated=generateAuxiliaryWaveform({...descriptor,integerc:(descriptor.integerc+variant)>>>0});
   const resampled=resampleSoundboardResponse(generated.samples,createSoundboardResamplingPlan(Math.fround(targetRate/generated.sampleRate),10));
   if(!resampled.output.every(Number.isFinite))throw new RangeError('Non-finite generated bank waveform');
   const identity=`kind1:key${key}:variant${variant}`;
   bank.set(identity,{identity,kind:1,key,variant,sourceRate:generated.sampleRate,sampleRate:targetRate,
    frames:resampled.frames,samples:resampled.output});
  }
 }
 return bank;
}
