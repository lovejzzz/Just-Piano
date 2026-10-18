import {processVoiceMidGroups} from '../dsp/voice-mid-processing.mjs';
import {initializeRattleBurst,renderRattleBurst} from '../dsp/rattle-burst.mjs';

// All audio comes from the same-run computed cross output. Native intermediate
// groups, argument and dynamic states are comparison targets only.
export function verifyVoiceRattleAudio(data,cross,controls,check,setContext=()=>{}){
 if(!data.voiceRattleAudio||!data.earlyConsumer||data.audioPending||!cross?.outputs||!data.observedRattleTables)throw new Error('Complete same-run voice/Rattle inputs required');
 const key=r=>`${r.epoch}:${r.counter}`,sources=new Map(cross.outputs.map(r=>[key(r),r]));
 const tables=new Map(),states=new Map(),pending=new Map(),outputs=[],births=[];
 const word=new DataView(new ArrayBuffer(4));
 const bits=x=>{if(!Number.isFinite(x))throw new Error('Finite Rattle float required');word.setFloat32(0,x);return word.getUint32(0);};
 const fromBits=x=>{if(!Number.isInteger(x)||x<0||x>0xffffffff)throw new Error('Float32 word required');word.setUint32(0,x);return word.getFloat32(0);};
 const array=(name,p,a)=>{if(p.length!==a?.length)throw new Error('Incomplete '+name);p.forEach((x,i)=>check(name,x,a[i]));};
 function groups(name,p,a){if(a?.length!==3)throw new Error('Three Rattle groups required');p.forEach((g,i)=>array(name,g,a[i]));}
 function midControls(p,a){
  for(const k of ['level','gain','envelopeEnabled','filterEnabled','mergeEnabled','primaryProcessorEnabled','eqChannels','eqSections'])check('voice-mid:'+k,p[k],a[k]);
  if(p.mergeEnabled===1)for(const k of ['mergeCurrent','mergeRemaining'])check('voice-mid:'+k,p[k],a[k]);
 }
 function state(p,a){
  if(a.slots.length!==p.slots.length)throw new Error('Rattle pool changed');
  for(const [k,v] of Object.entries(p.controls))check('rattle:config:'+k,v,a.controls[k]);
  for(const k of ['elapsed','peak','floor','level','head','active'])check('rattle:state:'+k,p[k],a[k]);
  p.slots.forEach((slot,i)=>{
   if(!slot.valid)return;
   const t=a.slots[i];array('rattle:coefficient',slot.coefficients,t.coefficients.map(fromBits));
   check('rattle:gain',slot.gain,fromBits(t.gain));check('rattle:cursor',slot.cursor,t.cursor);
   if(t.history)array('rattle:history',slot.history,t.history.map(fromBits));
  });
 }
 let blocks=0,changedOutputSamples=0,zeroControlTailBlocks=0;
 for(const r of data.records){
  if(!['consumerCross','audioGain','audioEntry','audioReturn'].includes(r.stage))continue;
  setContext({stage:r.stage,epoch:r.epoch,age:r.counter});
  if(r.stage==='consumerCross'){
   const source=sources.get(key(r));if(!source||pending.has(r.thread))throw new Error('Unique computed cross source required');
   let auxiliary;
   if(cross.auxiliarySourceObserved===false){
    auxiliary=cross.auxiliaryMidSource?.get(key(r));if(!auxiliary)throw Error('Complete freshly computed auxiliary mid source required');
   }
   pending.set(r.thread,{epoch:r.epoch,counter:r.counter,voice:r.voice,phase:'cross',mid:processVoiceMidGroups(source.channels,r.midControls),config:r.midControls,auxiliary});continue;
  }
  const p=pending.get(r.thread);
  if(!p||p.epoch!==r.epoch||p.counter!==r.counter||p.voice!==r.voice)throw new Error('Misbound Rattle audio phase');
  midControls(p.config,r.midControls);
  if(r.stage==='audioGain'){
   if(p.phase!=='cross')throw new Error('Gain phase required');groups('voice-mid:gain',p.mid,r.channels);p.phase='gain';continue;
  }
  if(r.stage==='audioEntry'){
   if(p.phase!=='gain')throw new Error('Rattle entry follows gain');groups('voice-mid:entry',p.mid,r.channels);array('voice-mid:primary',p.mid[0],r.input);
   const table=r.sourceTable,tableKey=table&&`${table.pointer}:${table.count}`;
   if(table?.values){if(tables.has(tableKey)||table.values.length!==table.count)throw new Error('Invalid Rattle source initialization');tables.set(tableKey,Float32Array.from(table.values));}
   let own=states.get(r.epoch);
   if(!own){
    if(r.counter!==0||r.epoch!==states.size)throw new Error('Rattle state from age zero required');
    for(const k of ['elapsed','peak','floor','level','head','active'])if(r.state[k]!==0)throw new Error('Nonzero initial Rattle state unsupported');
    own={voice:r.voice,age:0,state:initializeRattleBurst(r.state.controls,table?Array.from(tables.get(tableKey)??[]):[],r.state.slots.length)};states.set(r.epoch,own);
   }
   if(own.voice!==r.voice||own.age!==r.counter)throw new Error('Rattle interval missing');
   if(table){
    const source=tables.get(tableKey);if(!source||source.length!==table.count||own.tableKey&&own.tableKey!==tableKey)throw new Error('Rattle source table transition unsupported');
    if(!own.tableKey){own.state.source=Float32Array.from(source);own.tableKey=tableKey;}
   }
   const control=controls.get(key(r));if(control===undefined)throw new Error('Computed same-run control commit required');
   check('rattle:argument',control,r.control);check('rattle:cached-control',control,r.cachedControl);state(own.state,r.state);
   if(control===0&&own.state.active>0)zeroControlTailBlocks++;
   const result=renderRattleBurst(p.mid[0],control,own.state);
   result.output.forEach((v,i)=>{if(bits(v)!==bits(p.mid[0][i]))changedOutputSamples++;});
   births.push(...result.births.map(event=>({epoch:r.epoch,counter:r.counter,...event})));
   Object.assign(p,{phase:'entry',own,output:result.output});continue;
  }
  if(p.phase!=='entry')throw new Error('Rattle return follows entry');
  array('rattle:output',p.output,r.output);state(p.own.state,r.state);
  const result=[p.output,p.mid[1],p.mid[2]];groups('rattle:groups',result,r.channels);
  outputs.push({epoch:r.epoch,counter:r.counter,channels:result.map(g=>Array.from(g)),auxiliary:p.auxiliary?.map(g=>Array.from(g))});p.own.age+=64;pending.delete(r.thread);blocks++;
 }
 if(pending.size||states.size!==5||!tables.size||blocks!==cross.blocks||blocks!==controls.size||['audioGain','audioEntry','audioReturn'].some(stage=>data.records.filter(r=>r.stage===stage).length!==blocks))throw new Error('Incomplete same-run Rattle chain');
 return {outputs,blocks,outputSamples:blocks*192,changedOutputSamples,zeroControlTailBlocks,births,auxiliaryFromComputedCross:cross.auxiliarySourceObserved===false,computedCrossInput:true,primaryEntryObserved:false,argumentComparisonOnly:true,initialDynamicStateComputed:true,statesCarried:true,coefficientsComputed:true,modelControlsObserved:true,sharedSourceTableObserved:true,finalStereoAudioVerified:false};
}
