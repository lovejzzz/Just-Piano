import {initializeTerminalVoiceEnvelope,renderTerminalVoiceEnvelope,renderVoiceTimeEnvelope} from '../dsp/voice-tail-envelopes.mjs';

export function verifyVoiceTailEnvelopes(data,rattle,check,checkDouble,setContext=()=>{},slopeModels){
 if(slopeModels!==undefined&&(!(slopeModels instanceof Map)||slopeModels.size!==5))throw new Error('Five same-run computed terminal slope models required');
 if(typeof checkDouble!=='function')throw new Error('Exact double state comparator required');
 if(!data.voiceTailEnvelopes||!data.voiceRattleAudio||!rattle?.outputs)throw new Error('Same-run computed Rattle output required');
 const key=r=>`${r.epoch}:${r.counter}`,sources=new Map(rattle.outputs.map(r=>[key(r),r]));
 const states=new Map(),pending=new Map(),outputs=[];
 const sampleRate=data.records.find(r=>r.stage==='weights')?.selectionSource?.sampleRate;
 let blocks=0,primaryActiveBlocks=0,secondaryActiveBlocks=0,timeActiveBlocks=0,observedEnableChanges=0;
 const array=(name,p,a)=>{if(p.length!==a?.length)throw new Error('Complete terminal comparison required');p.forEach((v,i)=>check(name,v,a[i]));};
 const matrices=(name,p,a)=>{if(a?.length!==3||p.length!==3)throw new Error('Three terminal rows required');p.forEach((g,i)=>array(name,g,a[i]));};
 const compareState=(p,a)=>{
  for(const k of ['special','specialReady','specialLevel','specialLimit','secondaryEnabled','activationAge'])check('tail:control:'+k,Number(p[k]),Number(a[k]));
  for(const part of ['primary','secondary'])for(const k of Object.keys(p[part]))check('tail:'+part+':'+k,p[part][k],a[part][k]);
  for(const k of ['attackRate','decayRate','value'])checkDouble('tail:time:'+k,p.time[k],a.time[k]);
  for(const k of ['enabled','delay','attack','decay','counter'])check('tail:time:'+k+':exact',Number(p.time[k]===a.time[k]),1);
 };
 for(const [recordIndex,r] of data.records.entries()){
  if(!['audioReturn','audioAfterGains','audioTail'].includes(r.stage))continue;
  setContext({stage:r.stage,epoch:r.epoch,age:r.counter});
  if(r.stage==='audioReturn'){
   const source=sources.get(key(r));if(!source||pending.has(r.thread)||!r.tail||r.auxiliary?.rows!==3||r.auxiliary.samples!==64)throw new Error('Complete terminal source/boundary required');
   let own=states.get(r.epoch);
   if(!own){
    if(r.counter!==0||r.epoch!==states.size||r.tail.time.counter!==0)throw new Error('Terminal voices must begin at zero');
    const model=slopeModels?.get(r.epoch);
    const sourceRecord=model&&data.records[model.sourceRecordIndex];
    if(slopeModels&&(!model||model.voice!==r.voice||!Number.isInteger(model.sourceRecordIndex)||model.sourceRecordIndex<0||model.sourceRecordIndex>=recordIndex||sourceRecord?.stage!=='final'||sourceRecord.epoch!==r.epoch||sourceRecord.voice!==r.voice))throw new Error('Terminal slope source must precede this voice audio');
    if(slopeModels&&(!model.slopes||!['primary','secondary'].every(part=>Number.isFinite(model.slopes[part]))))throw new Error('Complete computed terminal slopes required');
    const state=structuredClone(r.tail);
    for(const part of ['primary','secondary'])state[part]=initializeTerminalVoiceEnvelope(sampleRate,slopeModels?model.slopes[part]:r.tail[part].slope,r.tail[part].scale);
    own={voice:r.voice,age:0,state};states.set(r.epoch,own);
   }
   if(own.voice!==r.voice||own.age!==r.counter)throw new Error('Terminal interval missing or rebound');
   for(const part of ['primary','secondary']){
    if(own.state[part].enabled!==r.tail[part].enabled)observedEnableChanges++;
    own.state[part].enabled=r.tail[part].enabled;
   }
   if(own.state.secondaryEnabled!==r.tail.secondaryEnabled)observedEnableChanges++;
   own.state.secondaryEnabled=r.tail.secondaryEnabled;
   compareState(own.state,r.tail);
   if(own.state.special)throw new Error('Special terminal processor not implemented');
   let result={groups:source.channels.map(g=>Float32Array.from(g)),auxiliary:r.auxiliary.values.map(g=>Float32Array.from(g))};
   if(own.state.secondaryEnabled===1){result=renderTerminalVoiceEnvelope(result.groups,result.auxiliary,own.state.secondary);secondaryActiveBlocks++;}
   if(r.counter>own.state.activationAge&&!(own.state.primary.enabled&1))own.state.primary.enabled=1;
   if(own.state.primary.enabled||own.state.primary.gain!==1)primaryActiveBlocks++;
   result=renderTerminalVoiceEnvelope(result.groups,result.auxiliary,own.state.primary);
   pending.set(r.thread,{epoch:r.epoch,counter:r.counter,voice:r.voice,phase:'gains',own,result});
  }else{
   const p=pending.get(r.thread);if(!p||p.epoch!==r.epoch||p.counter!==r.counter||p.voice!==r.voice)throw new Error('Terminal stage identity mismatch');
   if(r.stage==='audioAfterGains'){
    if(p.phase!=='gains')throw new Error('Terminal gain stage missing');
    matrices('tail:gain-groups',p.result.groups,r.channels);matrices('tail:gain-auxiliary',p.result.auxiliary,r.auxiliary.values);compareState(p.own.state,r.tail);
    if(p.own.state.time.enabled===1)timeActiveBlocks++;
    p.result=renderVoiceTimeEnvelope(p.result.groups,p.result.auxiliary,p.own.state.time);p.phase='time';
   }else{
    if(p.phase!=='time')throw new Error('Terminal time stage missing');
    matrices('tail:time-groups',p.result.groups,r.channels);matrices('tail:time-auxiliary',p.result.auxiliary,r.auxiliary.values);compareState(p.own.state,r.tail);
    outputs.push({epoch:r.epoch,counter:r.counter,channels:p.result.groups.map(g=>Array.from(g)),auxiliary:p.result.auxiliary.map(g=>Array.from(g))});
    p.own.age+=64;pending.delete(r.thread);blocks++;
   }
  }
 }
 if(pending.size||states.size!==5||blocks!==rattle.blocks||['audioAfterGains','audioTail'].some(stage=>data.records.filter(r=>r.stage===stage).length!==blocks))throw new Error('Incomplete terminal observation coverage');
 return {outputs,blocks,outputSamples:blocks*192,auxiliarySamples:blocks*192,primaryActiveBlocks,secondaryActiveBlocks,timeActiveBlocks,observedEnableChanges,enableControlsObserved:true,sameRunComputedGroups:true,auxiliaryEntryObserved:true,modelControlsObserved:true,terminalSlopesComputed:slopeModels!==undefined,terminalScaleObserved:true,nonunitPrimarySlopeModels:slopeModels?[...slopeModels.values()].filter(m=>m.slopes.primary!==1).length:undefined,initialEnvelopeStateObserved:false,initialTimeStateObserved:true,initialTerminalGainComputed:true,subsequentStateCarried:true,finalStereoAudioVerified:false};
}
