import {rattleDispatchRoute} from '../dsp/rattle-dispatch-control.mjs';
const addresses={before:0x10035ef10,weights:0x100695108,final:0x100864d28,envelopeResult:0x100472fd0,copy:0x1004604d4,coefficients:0x100472f50,rattleSource:0x10085ed9c,rattleEntry:0x100278154,rattleBuffer:0x1004601a0,rattleReady:0x1004601ac,rattleSkip:0x10085ede4,rattleCommit:0x10051182c,consumer:0x100460908,consumerPost:0x100460a4c};
const gateRoles={entry:'rattleEntry',buffer:'rattleBuffer',ready:'rattleReady'};
const routeRoles={buffer:'rattleBuffer',ready:'rattleReady',skip:'rattleSkip',commit:'rattleCommit'};
export function validateCommitSlots(data){
 if(data.sourceDispatchGates!==true||data.slotBarriers!==true||data.acknowledgedTransitions!==data.slotTransitions?.length||!data.sourceCommits||!data.consumerPost||!data.consumerDelay||!data.consumerInjection||!data.workerOutputs||!data.dispatchControls||data.fixedSites!==false||data.sourcePending||data.postPending||data.sourceRole!=='rattleSource'||data.transitions?.length!==2||data.transitions[0].phase!=='source'||data.transitions[0].afterInitializations!==0||data.transitions[0].weightsSeen!==2||data.transitions[1].phase!=='consumer'||data.transitions[1].afterInitializations!==5||data.transitions[1].weightsSeen!==10||data.transitions.some(t=>t.activeSites!==6))throw new Error('Exact source/post capture phases required');
 const live=new Map(['before','weights','final','envelopeResult','copy','coefficients'].map(name=>[name,{address:addresses[name]}])),seenIds=new Set(),changes=new Map();
 for(const t of data.slotTransitions??[]){
  if(!Number.isInteger(t.callbackStopId)||!Number.isInteger(t.barrierStopId)||t.barrierStopId<t.callbackStopId||t.registered!==6||t.active!==6||!Number.isInteger(t.afterRecord)||t.afterRecord<1||t.afterRecord>data.records.length||!Number.isSafeInteger(t.newId)||t.newId<1)throw new Error('Invalid six-slot transition');
  if(!changes.has(t.afterRecord))changes.set(t.afterRecord,[]);changes.get(t.afterRecord).push(t);
 }
 let count=0,sourceStarts=0,consumerStarts=0;
 for(const [index,r] of data.records.entries()){
  const role=r.stage==='rattleGate'?gateRoles[r.kind]:r.stage==='refresh'?'final':r.stage==='duplicateEnvelopeResult'?'envelopeResult':r.stage,slot=live.get(role);
  if(!slot||!r.site||r.site.fileAddress!==slot.address||!Number.isSafeInteger(r.site.id)||r.site.id<1||!Number.isInteger(r.site.stopId))throw new Error('Observation outside its active hardware slot');
  if(slot.id===undefined){if(seenIds.has(r.site.id))throw new Error('Hardware ID reused across roles');slot.id=r.site.id;seenIds.add(slot.id);}
  if(slot.id!==r.site.id)throw new Error('Stale hardware site observation');
  for(const t of changes.get(index+1)??[]){
   const old=live.get(t.oldRole);if(!old||old.id!==t.oldId||live.has(t.newRole)||seenIds.has(t.newId)||t.address!=='0x'+addresses[t.newRole]?.toString(16))throw new Error('Invalid slot replacement identity');
   let allowed=false;
   if(role==='before'&&t.oldRole==='rattleSource'&&t.newRole==='weights')allowed=true;
   else if(role==='final'&&r.target?.initial_flag===1&&r.epoch===4&&t.oldRole==='before'&&t.newRole==='consumer'){allowed=true;consumerStarts++;}
   else if(role===t.oldRole){
    allowed=role==='weights'&&t.newRole==='rattleSource'||role==='rattleSource'&&t.newRole==='rattleEntry'||r.stage==='rattleGate'&&r.route===rattleDispatchRoute(r.kind,r.flag,r.multi)&&t.newRole===routeRoles[r.route]||role==='rattleSkip'&&t.newRole==='rattleSource'||role==='rattleCommit'&&r.caller==='0x100460260'&&t.newRole==='rattleSource'||role==='consumer'&&t.newRole==='consumerPost'||role==='consumerPost'&&t.newRole==='consumer';
    if(role==='weights'&&allowed)sourceStarts++;
   }
   if(!allowed)throw new Error('Slot replacement violates the execution phase');
   live.delete(t.oldRole);live.set(t.newRole,{id:t.newId,address:addresses[t.newRole]});seenIds.add(t.newId);count++;if(live.size!==6)throw new Error('Six active roles required');
  }
 }
 if(count!==data.slotTransitions?.length||sourceStarts!==5||consumerStarts!==1||[...live.keys()].sort().join()!==['rattleSource','consumer','final','envelopeResult','copy','coefficients'].sort().join())throw new Error('Incomplete slot transition coverage');
 return {transitions:count,weightToSourcePhases:sourceStarts,consumerStarts,registeredSlots:6};
}
