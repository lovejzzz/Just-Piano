import {rattleDispatchRoute} from '../dsp/rattle-dispatch-control.mjs';
const addresses={before:0x10035ef10,weights:0x100695108,final:0x100864d28,envelopeResult:0x100472fd0,copy:0x1004604d4,coefficients:0x100472f50,rattleSource:0x10085ed9c,rattleEntry:0x100278154,rattleBuffer:0x1004601a0,rattleReady:0x1004601ac,rattleSkip:0x10085ede4,rattleCommit:0x10051182c,consumer:0x100460908,consumerPost:0x100460a4c,consumerCross:0x100460acc};
const gateRoles={entry:'rattleEntry',buffer:'rattleBuffer',ready:'rattleReady'};
const routeRoles={buffer:'rattleBuffer',ready:'rattleReady',skip:'rattleSkip',commit:'rattleCommit'};
export function observationResumeKeys(records,resumes){
  if(!Array.isArray(resumes)||!resumes.length)throw new Error('Complete observation resume audit required');
  const auditedObservations=new Set();let previousStop=-1;
  for(const event of resumes){
   if(!Number.isInteger(event.stopId)||event.stopId<=previousStop||!Number.isInteger(event.records)||event.records<0||event.records>records.length||!Array.isArray(event.threads))throw new Error('Invalid observation resume audit');
   previousStop=event.stopId;
   for(const thread of event.threads){
    const site=thread.lastOwned;if(!site||!Number.isInteger(site.stopId)||site.stopId>event.stopId)continue;
    const pc=Number(thread.pc);
    if(pc!==site.fileAddress&&pc!==site.fileAddress+4)continue;
    auditedObservations.add(`${thread.thread}:${site.id}:${site.stopId}`);
   }
  }
 return auditedObservations;
}
export function validateCommitSlots(data,resumes){
 if(data.earlyConsumer===true)return validateEarlyCommitSlots(data,resumes);
 if(data.consumerCross===true&&data.allObservationBarriers!==true||data.sourceDispatchGates!==true||data.slotBarriers!==true||data.acknowledgedTransitions!==data.slotTransitions?.length||!data.sourceCommits||!data.consumerPost||!data.consumerDelay||!data.consumerInjection||!data.workerOutputs||!data.dispatchControls||data.fixedSites!==false||data.sourcePending||data.postPending||data.sourceRole!=='rattleSource'||data.transitions?.length!==2||data.transitions[0].phase!=='source'||data.transitions[0].afterInitializations!==0||data.transitions[0].weightsSeen!==2||data.transitions[1].phase!=='consumer'||data.transitions[1].afterInitializations!==5||data.transitions[1].weightsSeen!==10||data.transitions.some(t=>t.activeSites!==6))throw new Error('Exact source/post capture phases required');
 const auditedObservations=data.consumerCross?observationResumeKeys(data.records,resumes):undefined;
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
  if(auditedObservations&&!auditedObservations.has(`${r.thread}:${r.site.id}:${r.site.stopId}`))throw new Error('Observation lacks an audited normal Continue barrier');
  for(const t of changes.get(index+1)??[]){
   const old=live.get(t.oldRole);if(!old||old.id!==t.oldId||live.has(t.newRole)||seenIds.has(t.newId)||t.address!=='0x'+addresses[t.newRole]?.toString(16))throw new Error('Invalid slot replacement identity');
   let allowed=false;
   if(role==='before'&&t.oldRole==='rattleSource'&&t.newRole==='weights')allowed=true;
   else if(role==='final'&&r.target?.initial_flag===1&&r.epoch===4&&t.oldRole==='before'&&t.newRole==='consumer'){allowed=true;consumerStarts++;}
   else if(role===t.oldRole){
    allowed=role==='weights'&&t.newRole==='rattleSource'||role==='rattleSource'&&t.newRole==='rattleEntry'||r.stage==='rattleGate'&&r.route===rattleDispatchRoute(r.kind,r.flag,r.multi)&&t.newRole===routeRoles[r.route]||role==='rattleSkip'&&t.newRole==='rattleSource'||role==='rattleCommit'&&r.caller==='0x100460260'&&t.newRole==='rattleSource'||role==='consumer'&&t.newRole==='consumerPost'||role==='consumerPost'&&t.newRole===(data.consumerCross?'consumerCross':'consumer')||data.consumerCross===true&&role==='consumerCross'&&t.newRole==='consumer';
    if(role==='weights'&&allowed)sourceStarts++;
   }
   if(!allowed)throw new Error('Slot replacement violates the execution phase');
   live.delete(t.oldRole);live.set(t.newRole,{id:t.newId,address:addresses[t.newRole]});seenIds.add(t.newId);count++;if(live.size!==6)throw new Error('Six active roles required');
  }
 }
 if(count!==data.slotTransitions?.length||sourceStarts!==5||consumerStarts!==1||[...live.keys()].sort().join()!==['rattleSource','consumer','final','envelopeResult','copy','coefficients'].sort().join())throw new Error('Incomplete slot transition coverage');
 return {transitions:count,weightToSourcePhases:sourceStarts,consumerStarts,registeredSlots:6,observationResumes:resumes?.length};
}

function validateEarlyCommitSlots(data,resumes){
 if(!data.consumerCross||!data.allObservationBarriers||!data.sourceDispatchGates||!data.slotBarriers||!data.sourceCommits||!data.consumerPost||!data.consumerDelay||!data.consumerInjection||!data.workerOutputs||!data.dispatchControls||data.fixedSites!==false||data.sourcePending||data.postPending||data.groupControlPending||data.pendingSlotUpdates||!data.groupEnvelopeControl||data.sourceRole!=='rattleSource'||data.acknowledgedTransitions!==data.slotTransitions?.length)throw new Error('Complete early consumer/control capture required');
 const a={...addresses,groupControl:0x1006edcf8,groupControlAfter:0x1006edd74};
 if(data.workerInteriorSites===true){
  if(data.slotUpdatesDeferred!==true)throw new Error('Interior worker sites require deferred updates');
  a.coefficients=0x100472f54;a.envelopeResult=0x100472fd4;
 }
 const audited=observationResumeKeys(data.records,resumes),live=new Map(['before','weights','final','envelopeResult','copy','coefficients'].map((k,i)=>[k,{address:a[k],id:i+1}])),seenIds=new Set([1,2,3,4,5,6]),changes=new Map();
 const stoppedFrames=new Map();
 for(const event of resumes)for(const thread of event.threads)if(thread.observedFrame===true){
  const site=thread.lastOwned;
  if(!site||Number(thread.pc)!==site.fileAddress||site.stopId!==event.stopId)throw new Error('Stopped-frame observation must match actual PC and current stop');
  stoppedFrames.set(`${thread.thread}:${site.id}:${site.stopId}`,thread.reason);
 }
 const recovered=new Map();
 for(const event of data.stoppedWorkerReads??[]){
  if(!Number.isInteger(event.record)||event.record<1||event.record>data.records.length||recovered.has(event.record))throw new Error('Invalid stopped-worker record identity');
  recovered.set(event.record,event);
 }
 const roleOf=r=>r.stage==='refresh'?'final':r.stage==='duplicateEnvelopeResult'?'envelopeResult':r.stage==='rattleGate'?gateRoles[r.kind]:r.stage;
 const stops=new Map();
 for(const [i,r] of data.records.entries()){
  const id=r.site?.stopId;if(!stops.has(id))stops.set(id,{first:i+1,last:i+1,rows:[]});
  const s=stops.get(id);s.last=i+1;s.rows.push(r);
 }
 for(const t of data.slotTransitions){
  if(!Number.isInteger(t.afterRecord)||t.afterRecord<1||t.afterRecord>data.records.length||t.registered!==6||t.active!==6||t.barrierStopId!==t.callbackStopId||data.slotUpdatesDeferred===true&&t.deferred!==true)throw new Error('Invalid early transition barrier');
  let after=t.afterRecord,owner;
  if(data.slotUpdatesDeferred===true){
   const stop=stops.get(t.callbackStopId);
   if(!stop||after<stop.first-1||after>stop.last)throw new Error('Queued replacement outside its callback stop');
   const role=t.oldRole==='copy'&&t.newRole==='groupControl'||t.oldRole==='rattleSource'&&t.newRole==='weights'?'before':t.oldRole==='groupControl'&&t.newRole==='copy'?'rattleSource':t.oldRole;
   const owners=stop.rows.filter(r=>roleOf(r)===role&&(role!==t.oldRole||r.site.id===t.oldId));
   if(owners.length!==1)throw new Error('Unique observed replacement owner required');
   owner=owners[0];after=stop.last;
  }
  if(!changes.has(after))changes.set(after,[]);changes.get(after).push({...t,owner});
 }
 let count=0,sourceStarts=0,controls=0,consumerStarts=0;
 const epochs=new Map();
 for(const [i,r] of data.records.entries()){
  const role=roleOf(r);
  const s=live.get(role);if(!s||r.site?.fileAddress!==s.address||!audited.has(`${r.thread}:${r.site.id}:${r.site.stopId}`))throw new Error('Unaudited or stale early slot');
  if(r.site.delivery==='stopped-frame'){
   const key=`${r.thread}:${r.site.id}:${r.site.stopId}`,event=recovered.get(i+1);
   if(!data.readStoppedWorkerFrames||!['coefficients','envelopeResult'].includes(role)||stoppedFrames.get(key)!==r.site.reason||!stoppedFrames.has(key)||!event||event.thread!==r.thread||event.stage!==role||event.epoch!==r.epoch||event.counter!==r.counter||event.stopId!==r.site.stopId)throw new Error('Unproven stopped-worker frame observation');
   recovered.delete(i+1);
  }else if(recovered.has(i+1))throw new Error('Stopped-worker provenance missing');
  if(s.id===null){if(seenIds.has(r.site.id))throw new Error('Reused early slot ID');s.id=r.site.id;seenIds.add(s.id);}
  if(s.id!==r.site.id)throw new Error('Changed early slot identity');
  if(role==='consumer'){
   const prev=epochs.get(r.epoch);if(prev===undefined?r.counter!==0:r.counter!==prev+64)throw new Error('Early consumer must cover each voice from zero');epochs.set(r.epoch,r.counter);
  }
  for(const t of changes.get(i+1)??[]){
   const event=t.owner??r,role=roleOf(event);
   const old=live.get(t.oldRole);
   if(!old||old.id!==t.oldId||live.has(t.newRole)||seenIds.has(t.newId)||t.address!=='0x'+a[t.newRole]?.toString(16))throw new Error('Invalid early replacement');
   let allowed=false;
   if(role==='before')allowed=t.oldRole==='rattleSource'&&t.newRole==='weights'||t.oldRole==='copy'&&t.newRole==='groupControl';
   else if(role==='rattleSource'&&t.oldRole==='groupControl'&&t.newRole==='copy')allowed=true;
   else if(role===t.oldRole){
    allowed=role==='weights'&&t.newRole==='rattleSource'||role==='rattleSource'&&t.newRole==='rattleEntry'||event.stage==='rattleGate'&&event.route===rattleDispatchRoute(event.kind,event.flag,event.multi)&&t.newRole===routeRoles[event.route]||role==='rattleSkip'&&t.newRole==='rattleSource'||role==='rattleCommit'&&event.caller==='0x100460260'&&t.newRole==='consumer'||role==='consumer'&&t.newRole==='consumerPost'||role==='consumerPost'&&t.newRole==='consumerCross'||role==='consumerCross'&&t.newRole==='rattleSource'||role==='groupControl'&&t.newRole==='groupControlAfter'||role==='groupControlAfter'&&t.newRole==='groupControl';
    if(role==='weights'&&allowed)sourceStarts++;
    if(role==='rattleCommit'&&allowed)consumerStarts++;
    if(role==='groupControl'&&allowed)controls++;
   }
   if(!allowed)throw new Error('Invalid early execution transition: '+JSON.stringify({record:i,role,old:t.oldRole,next:t.newRole}));
   live.delete(t.oldRole);live.set(t.newRole,{id:t.newId,address:a[t.newRole]});seenIds.add(t.newId);count++;
   if(live.size!==6)throw new Error('Six early slots required');
  }
 }
 if(recovered.size||count!==data.slotTransitions.length||sourceStarts!==5||epochs.size!==5||!controls||consumerStarts!==data.records.filter(r=>r.stage==='consumer').length||[...live.keys()].sort().join()!==['before','rattleSource','final','envelopeResult','copy','coefficients'].sort().join())throw new Error('Incomplete early slot trajectory');
 return {transitions:count,weightToSourcePhases:sourceStarts,consumerStarts,groupControls:controls,earlyConsumer:true,registeredSlots:6,observationResumes:resumes.length};
}
