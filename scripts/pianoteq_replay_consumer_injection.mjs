import {renderVoiceGroupEnvelope} from '../dsp/voice-group-envelope.mjs';
// Same-run calculated delay groups -> release source -> filter -> primary add.
import {initializeReleaseSource,generateReleaseInjection,modulateReleaseInjection,addReleaseInjection} from '../dsp/release-injection.mjs';
import {initializeReleaseFilters} from '../dsp/release-filter-design.mjs';
import {renderVectorFilter} from '../dsp/vector-filter.mjs';

export function verifyConsumerInjection(data,calculated,check,setContext=()=>{}){
 const view=new DataView(new ArrayBuffer(4));
 const fromBits=x=>{view.setUint32(0,x);return view.getFloat32(0);};
 const array=(name,a,b)=>{if(a.length!==b?.length)throw new Error(`Incomplete ${name}`);a.forEach((v,i)=>check(name,v,b[i]));};
 const sources=new Map(calculated.map(r=>[`${r.epoch}:${r.counter}`,r.channels]));
 const entryObserved=data.injectionEntryObserved===true,postMode=data.consumerPost===true;
 const observed=new Map();
 for(const r of data.records.filter(r=>['injectionEntry','injectionMixed','consumerPost'].includes(r.stage))){
  const key=`${r.epoch}:${r.counter}`;
  if(!observed.has(key))observed.set(key,{});
  const stages=observed.get(key);if(stages[r.stage])throw new Error('Duplicate release injection observation');stages[r.stage]=r;
 }
 if(!entryObserved)for(const r of data.records.filter(r=>r.stage==='consumer')){
  if(!r.injectionPre)throw new Error('Complete pre-injection observation required');
  const key=`${r.epoch}:${r.counter}`;if(!observed.has(key))observed.set(key,{});
  if(observed.get(key).injectionEntry)throw new Error('Ambiguous pre-injection observation');
  observed.get(key).injectionEntry={...r.injectionPre,primary:r.channels[0]};
 }
 const outputs=[],coverage=[];let generatedBlocks=0,skippedBlocks=0,inferredControlBlocks=0,entryBlocks=0,mixedBlocks=0,postComparedBlocks=0,groupEnvelopeBypassBlocks=0;const groupEnvelopeInitialStates=[];
 const releasePositionBridges=[];
 const compareState=(state,target,after)=>{
  for(const key of Object.keys(state))if(!after||key!=='lastMagnitude')check('injection:state:'+key,state[key],target[key]);
 };
 for(let epoch=0;epoch<5;epoch++){
  setContext({stage:'releaseSeed',epoch,age:0});
  const copies=data.records.filter(r=>r.stage==='copy'&&r.epoch===epoch);
  const first=copies[0],seed=first?.releaseSeed;
  if(!seed||first.counter!==0)throw new Error('Release initialization from age zero required');
  if(seed.curveMode!==0||seed.flags['0x18']===1||seed.flags['0x1a']&1||seed.flags['0x1d']&1||seed.flags['0x1e']&1||seed.modelMode===2)throw new Error('Unverified release initialization branch');
  const g=seed.global;
  const state=initializeReleaseSource({amplitude:g['0xfc4'],shape:g['0xfc8'],sampleRate:g['0x98'],timeScale:g['0xe48'],frequency:g['0x78'],decibels:seed.curveValue});
  compareState(state,seed.state,false);
  const setup=seed.filter;
  if(setup.fast!==1||![0,1].includes(setup.updating)||setup.channelGainWords[3]||setup.controls.length!==setup.sections*15)throw new Error('Unverified release filter smoothing');
  const controls=[];
  for(let i=0;i<setup.sections;i++){
   const w=setup.controls.slice(i*15,(i+1)*15);
   if(w[4]||w[8]||w[12])throw new Error('Live release coefficient smoothing unsupported');
   controls.push({type:w[0],frequency:fromBits(w[1]),q:fromBits(w[5]),decibels:fromBits(w[9])});
  }
  const filter=initializeReleaseFilters(controls,setup.sampleRate,fromBits(setup.channelGainWords[0]));
  let filterReady=setup.updating===0;
  const compareFilter=t=>{
   if(t.fast!==setup.fast||t.updating!==(filterReady?0:1)||t.sections!==setup.sections||t.sampleRate!==setup.sampleRate||t.controls.length!==setup.controls.length||t.channelGainWords.length!==6)throw new Error('Release filter configuration changed');
   for(let i=0;i<t.controls.length;i++){
    const field=i%15;
    if(field===13)check('injection:sectionGain',filterReady?filter.sections[Math.floor(i/15)].gain:0,fromBits(t.controls[i]));
    else if(field===14){if(t.controls[i]!== (filterReady?0:1))throw new Error('Filter section dirty state differs');}
    else if(t.controls[i]!==setup.controls[i])throw new Error('Release filter controls changed');
   }
   for(let i=0;i<4;i++)if(t.channelGainWords[i]!==setup.channelGainWords[i])throw new Error('Release channel gain source changed');
   if(t.channelGainWords[5]!== (filterReady?0:1))throw new Error('Channel gain dirty state differs');
   check('injection:channelGain',filterReady?filter.totalGain:0,fromBits(t.channelGainWords[4]));
   array('injection:coefficients',filterReady?filter.sections.flatMap(s=>Array.from(s.coefficients)):Array(setup.sections*4).fill(0),t.coefficients);
   array('injection:table',filterReady?Array.from(filter.table):Array(setup.sections*32).fill(0),t.table);
   array('injection:history',Array.from(filter.history),t.history);
  };
  compareFilter(setup);
  let groupEnvelope;
  const comparePost=(channels,actual,age,begin)=>{
   if(!postMode||age<begin)return;
   const pre=actual.injectionEntry,post=actual.consumerPost;
   if(!pre||!post||pre.preGain?.currentGain!==1||pre.preGain.active!==0||!pre.envelope||!post.envelope)throw new Error('Verified unit pre-gain and group-envelope observations required');
   if(!groupEnvelope){groupEnvelope={...pre.envelope};groupEnvelopeInitialStates.push({epoch,age,...groupEnvelope});}
   else{
    check('group-envelope:pre-gain',groupEnvelope.gain,pre.envelope.gain);
    check('group-envelope:pre-step',groupEnvelope.step,pre.envelope.step);
    for(const key of ['active','elapsed','duration'])if(groupEnvelope[key]!==pre.envelope[key])throw new Error('Unobserved group-envelope control transition');
   }
   // 460914 and 460970 can bypass 428784 entirely. In particular an
   // inactive envelope may still hold a non-unit gain when dispatch skips it.
   const groupEnabled=!!(pre.controls.voiceFlags&4)&&!(pre.controls.skip&1);
   const scaled=groupEnabled?renderVoiceGroupEnvelope(channels,groupEnvelope):channels.map(x=>Float32Array.from(x));
   if(!groupEnabled)groupEnvelopeBypassBlocks++;
   for(const key of ['gain','step'])check('group-envelope:post-'+key,groupEnvelope[key],post.envelope[key]);
   for(const key of ['active','elapsed','duration'])if(groupEnvelope[key]!==post.envelope[key])throw new Error('Group-envelope post state differs');
   if(post.channels.length!==3)throw new Error('Three complete post-release groups required');
   scaled.forEach((group,i)=>array('consumer-post:output',Array.from(group),post.channels[i]));
   compareState(state,post.state,false);compareFilter(post.filter);postComparedBlocks++;return scaled;
  };

  const targets=data.records.filter(r=>r.stage==='consumer'&&r.epoch===epoch);
  if(!targets.length)throw new Error('Missing release observation interval');
  const begin=targets[0].counter,end=targets.at(-1).counter;
  let index=0,voiceEntries=0,voiceMixed=0,positionBridge;
  function redundantPosition(age){
   if(!positionBridge){
    const reads=data.records.filter(r=>r.stage==='coefficients'&&r.epoch===epoch),byAge=new Map(reads.map(r=>[r.counter,r.u]));
    const anchors=copies.filter(r=>r.releaseControls.position>0&&r.releaseControls.position<1);
    if(new Set(anchors.map(r=>r.releaseControls.position)).size<2)throw new Error('Insufficient independent position alignment anchors');
    const candidates=reads.filter(r=>r.u===anchors[0].releaseControls.position).map(r=>r.counter-anchors[0].counter).filter(offset=>offset>=0&&offset%64===0).filter(offset=>anchors.every(r=>byAge.get(r.counter+offset)===r.releaseControls.position)&&copies.every(r=>!byAge.has(r.counter+offset)||byAge.get(r.counter+offset)===r.releaseControls.position));
    if(candidates.length!==1)throw new Error('Ambiguous same-run release position clock bridge');
    positionBridge={offset:candidates[0],byAge,comparedCopies:copies.filter(r=>byAge.has(r.counter+candidates[0])).length,anchors:anchors.length};
   }
   const position=positionBridge.byAge.get(age+positionBridge.offset);
   if(position===undefined)throw new Error('Missing redundant release source observation');
   releasePositionBridges.push({epoch,age,workerAge:age+positionBridge.offset,position,comparedCopies:positionBridge.comparedCopies,anchors:positionBridge.anchors,clockAlignmentObserved:true});
   return position;
  }

  for(let age=0;age<=end;age+=64){
   setContext({stage:'releaseConsumer',epoch,age});
   while(index+1<copies.length&&copies[index+1].counter<=age)index++;
   let c=copies[index].releaseControls;
   if(!c)throw new Error('Missing release controls');
   if(copies[index].counter!==age&&(age<begin||entryObserved)){
    const next=copies[index+1];
    if(!next)throw new Error('Unobserved release control transition');
    if(JSON.stringify({...c,skip:undefined})!==JSON.stringify({...next.releaseControls,skip:undefined})){
     if(JSON.stringify({...c,skip:undefined,position:undefined})!==JSON.stringify({...next.releaseControls,skip:undefined,position:undefined}))throw new Error('Unobserved release branch transition');
     c={...c,position:redundantPosition(age)};
    }else inferredControlBlocks++;
   }
   const key=`${epoch}:${age}`,input=sources.get(key),actual=observed.get(key)??{};
   if(!input||input.length!==3)throw new Error('Same-run calculated delay source required');
   if(age>=begin&&!entryObserved)c=actual.injectionEntry?.controls;
   if(!c)throw new Error('Missing actual pre-injection controls');
   const enabled=!!(c.voiceFlags&4)&&!(c.voiceSkip&1)&&(age<begin||entryObserved||!(c.skip&1));
   if(!enabled){
    if(entryObserved&&actual.injectionEntry||actual.injectionMixed)throw new Error('Unexpected disabled injection observation');
    if(age>=begin&&!entryObserved){compareState(state,actual.injectionEntry.state,false);compareFilter(actual.injectionEntry.filter);entryBlocks++;voiceEntries++;}
    const scaled=comparePost(input,actual,age,begin);outputs.push({epoch,counter:age,channels:scaled?scaled.map(x=>Array.from(x)):input,enabled:false});continue;
   }
   let target=c.mode===1?(c.modeSwitch?0:1):c.position;
   if(c.overrideMode===1&&c.overrideSwitch)target=1;
   if(age>=begin){
    const entry=actual.injectionEntry;if(!entry)throw new Error('Missing expected injection entry');
    if(entryObserved)check('injection:target',target,entry.target);compareState(state,entry.state,false);compareFilter(entry.filter);array('injection:input',input[0],entry.primary);entryBlocks++;voiceEntries++;
   }else if(actual.injectionEntry||actual.injectionMixed)throw new Error('Injection target outside enabled observation interval');
   const result=generateReleaseInjection(input[0],target,state);
   let primary=input[0];
   if(result.skipped){
    if(actual.injectionMixed)throw new Error('Unexpected skipped injection mixed target');
    skippedBlocks++;
   }else{
    filterReady=true;
    const filtered=renderVectorFilter(result.generated,filter.table,filter.history);
    const injection=modulateReleaseInjection(filtered,state);primary=Array.from(addReleaseInjection(input[0],injection));
    if(age>=begin&&!postMode){
     const mixed=actual.injectionMixed;if(!mixed)throw new Error('Missing active injection mixed target');
     compareState(state,mixed.state,true);compareFilter(mixed.filter);array('injection:primary',primary,mixed.primary);mixedBlocks++;voiceMixed++;
    }
    state.lastMagnitude=Math.max(0,...injection.map(x=>Math.abs(x)));generatedBlocks++;
   }
   const channels=[Array.from(primary),input[1],input[2]],scaled=comparePost(channels,actual,age,begin);outputs.push({epoch,counter:age,channels:scaled?scaled.map(x=>Array.from(x)):channels,enabled:true});
  }
  coverage.push({epoch,firstComparedAge:begin,lastComparedAge:end,entryBlocks:voiceEntries,mixedBlocks:voiceMixed});
 }
 if(postMode&&(postComparedBlocks!==entryBlocks||postComparedBlocks!==data.records.filter(r=>r.stage==='consumerPost').length))throw new Error('Incomplete post-release observations');
 if(entryBlocks!==data.records.filter(r=>r.stage===(entryObserved?'injectionEntry':'consumer')).length||mixedBlocks!==data.records.filter(r=>r.stage==='injectionMixed').length)throw new Error('Unconsumed release injection observations');
 return {outputs,coverage,postMode,postComparedBlocks,postOutputSamples:postComparedBlocks*3*64,unitPreGainBypassOnly:postMode,groupEnvelopeSeedObservedOnce:postMode,groupEnvelopeControlsObservedOnce:postMode,groupEnvelopeGainCarried:postMode,groupEnvelopeDispatchControlsObserved:postMode,groupEnvelopeBypassBlocks,groupEnvelopeInitialStates,releasePositionBridges,releasePositionProducerComputed:false,entryBlocks,mixedBlocks,preStateObservations:entryBlocks,mixedPrimarySamples:mixedBlocks*64,generatedBlocks,skippedBlocks,inferredControlBlocks,initialSourceComputed:true,initialFilterComputed:true,globalSourceControlsObserved:true,entryObserved,preConsumerSkipWordNotConsumed:true,fullDispatchGateVerified:false,completePhysicsVerified:false};
}
