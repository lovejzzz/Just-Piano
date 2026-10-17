"""Six hardware slots for initialized DSP, source commits and pre/post output.
Experimental capture; requires complete source-aware replay before any equivalence claim.
"""
import os,json,traceback,sys
from pathlib import Path
sys.path.insert(0,'/Users/tianxing/Documents/ChatGPT/Just Piano/scripts')
assert os.environ.get('PIANOTEQ_CONSUMER_INJECTION')=='1'
import pianoteq_capture_release_continuous_chain as base
from pianoteq_damper_runtime_capture import scalar,unpack
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_key_mix import matrix as auxiliary_matrix
CROSS=os.environ.get('PIANOTEQ_CONSUMER_CROSS')=='1'
EARLY=os.environ.get('PIANOTEQ_EARLY_CONSUMER')=='1'
assert not EARLY or CROSS
DEFER=os.environ.get('PIANOTEQ_DEFER_SLOT_UPDATES')=='1'
assert not DEFER or EARLY
INTERIOR=os.environ.get('PIANOTEQ_WORKER_INTERIOR_SITES')=='1'
assert not INTERIOR or DEFER
POLL_WORKER=os.environ.get('PIANOTEQ_READ_STOPPED_WORKERS')=='1'
assert not POLL_WORKER or DEFER
AUDIO=os.environ.get('PIANOTEQ_VOICE_RATTLE_AUDIO')=='1'
assert not AUDIO or EARLY and DEFER
if AUDIO:
 from pianoteq_capture_voice_mid import controls as mid_controls,groups as mid_groups
 from pianoteq_capture_rattle_burst import state as rattle_state,samples as audio_samples
if INTERIOR:
 base.POINTS['coefficients']=0x100472f54
 base.POINTS['envelopeResult']=0x100472fd4
ROOT=base.ROOT;hooks=base.hooks;records=base.records;errors=base.errors;last_seen={};slot_transitions=[]
source_role='weights';source_pending=None;post_pending=None;main_thread=None;source_started=False;window_complete=False;acknowledged_transitions=0;last_saved_rows=-256
group_pending=None
slot_updates=[]
worker_seen={};stopped_worker_reads=[];STOPPED_FRAME=object()
audio_pending={};audio_tables=set()

def save(force=False):
 global last_saved_rows
 if not force and not errors and not base.complete and len(records)-last_saved_rows<256:return
 data={'schema':1,'sourceCommits':True,'sourceDispatchGates':True,'consumerCross':CROSS,'allObservationBarriers':CROSS,'consumerPost':True,'consumerDelay':True,'consumerInjection':True,'injectionEntryObserved':False,'dispatchControls':True,'workerOutputs':True,'windowBlocks':None,'fixedSites':False,'siteCount':6,'records':records,'errors':errors,'starts':base.starts,'spectrumCount':base.spectrum_calls,'finalCount':base.final_calls,'copyCount':base.copies,'initializations':len(base.initialized),'envelopeBlocks':base.blocks,'duplicateEnvelopeReturns':base.duplicates,'envelopePending':len(base.envelope_pending),'coefficientCount':base.coefficients,'refreshCount':sum(r['stage']=='refresh' for r in records),'renderCount':sum(r['stage']=='envelopeResult' and 'render' in r for r in records),'pending':len(base.pending),'complete':base.complete,'activeSites':sum(h.IsEnabled() for h in hooks.values()),'transitions':base.transitions,'slotTransitions':slot_transitions,'sourceRole':source_role,'sourcePending':source_pending,'postPending':post_pending,'slotBarriers':True,'acknowledgedTransitions':acknowledged_transitions}
 if EARLY:data.update(earlyConsumer=True,groupControlPending=group_pending,groupEnvelopeControl=True,slotUpdatesDeferred=DEFER,pendingSlotUpdates=len(slot_updates),workerInteriorSites=INTERIOR,readStoppedWorkerFrames=POLL_WORKER,stoppedWorkerReads=stopped_worker_reads)
 if AUDIO:data.update(voiceRattleAudio=True,audioPending=len(audio_pending),observedRattleTables=True,rattleTableCount=len(audio_tables))
 (ROOT/'runtime.json').write_text(json.dumps(data,indent=None if CROSS else 2,allow_nan=False));last_saved_rows=len(records)
base.save=save

def replace(frame,old_name,new_name,address):
 if DEFER:
  slot_updates.append((frame,old_name,new_name,address,len(records),frame.GetThread().GetProcess().GetStopID()))
 else:replace_now(frame,old_name,new_name,address)

def replace_now(frame,old_name,new_name,address,after_record=None,callback_stop=None):
 import lldb
 t=frame.GetThread().GetProcess().GetTarget();old=hooks.pop(old_name);old_id=old.GetID();assert t.BreakpointDelete(old_id);del base.POINTS[old_name]
 result=lldb.SBCommandReturnObject();t.GetDebugger().GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded(),result.GetError()
 h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');h.SetAutoContinue(False);hooks[new_name]=h;base.POINTS[new_name]=address
 assert t.GetNumBreakpoints()==len(hooks)==6 and all(h.IsEnabled() and h.IsHardware() for h in hooks.values())
 slot_transitions.append({'afterRecord':len(records) if after_record is None else after_record,'oldRole':old_name,'oldId':old_id,'newRole':new_name,'newId':h.GetID(),'address':hex(address),'registered':6,'active':6,'callbackStopId':frame.GetThread().GetProcess().GetStopID() if callback_stop is None else callback_stop,'deferred':DEFER})

def activate_consumer(frame):
 assert base.final_calls==5 and base.spectrum_calls==10
 if EARLY:
  base.transitions.append({'phase':'consumer','afterInitializations':5,'weightsSeen':10,'activeSites':6,'alreadyActive':True})
  return
 replace(frame,'before','consumer',0x100460908)
 base.transitions.append({'phase':'consumer','afterInitializations':5,'weightsSeen':10,'activeSites':6})
base.activate_consumer=activate_consumer

def pre_gain(frame,h):
 return {'currentGain':scalar(frame,h+0xcc4),'active':scalar(frame,h+0xcd0,'B'),'ready':scalar(frame,h+0xcd1,'B'),'words':list(unpack(frame,h+0xcb8,'IIIIII'))}

def envelope(frame,h):
 r={'gain':scalar(frame,h+0xcf0),'step':scalar(frame,h+0xcf4),'active':scalar(frame,h+0xcfc,'B'),'elapsed':scalar(frame,h+0xd00,'I'),'duration':scalar(frame,h+0xd04,'I')}
 if EARLY:r['rate']=scalar(frame,h+0xcf8)
 return r

def channels(frame):
 m=register(frame,'x23');count=scalar(frame,m,'Q');assert count==3;result=[]
 for i in range(count):
  d=m+8+56*i;rows,stride,n,sample_stride=unpack(frame,d,'IIII');assert rows==1 and n==64
  result.append(list(unpack(frame,scalar(frame,d+16,'Q'),'f'*64)))
 return result

def observed(frame,location,_):
 global source_role,source_pending,post_pending,main_thread,source_started,group_pending
 try:
  changes_before=len(slot_transitions)
  pc=frame.GetPCAddress().GetFileAddress();name=next(k for k,v in base.POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID();hook=hooks[name]
  site={'id':hook.GetID(),'fileAddress':pc,'loadAddress':frame.GetPC(),'hits':hook.GetHitCount(),'stopId':frame.GetThread().GetProcess().GetStopID()};last_seen[thread]=site
  if _ is STOPPED_FRAME:site.update(delivery='stopped-frame',reason=frame.GetThread().GetStopReason())
  if name=='rattleSource':
   h=register(frame,'x21')
   if h not in base.voices:return False
   assert thread==main_thread and source_pending is None
   if EARLY and 'groupControl' in hooks:
    assert group_pending is None
    replace(frame,'groupControl','copy',0x1004604d4)
   owner=register(frame,'x8');assert owner==base.owners[h]
   x=regfloat(frame,'s0','f');records.append({'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'owner':hex(owner),'frozenX':x,'sourceMemoryX':scalar(frame,owner+0xe4),'currentX':scalar(frame,h+0x2f38),'consumerAge':scalar(frame,h+0x6c,'I'),'workerAge':scalar(frame,h+0x178,'I')})
   source_pending={'voice':hex(h),'epoch':base.voices[h]};replace(frame,name,'rattleEntry',0x100278154);source_role='rattleEntry'
  elif name in ('rattleEntry','rattleBuffer','rattleReady'):
   h=register(frame,'x0') if name=='rattleEntry' else register(frame,'x19')
   assert thread==main_thread and source_pending and source_pending['voice']==hex(h)
   kind={'rattleEntry':'entry','rattleBuffer':'buffer','rattleReady':'ready'}[name]
   flag=register(frame,'w0' if kind=='ready' else 'w8');multi=None if kind=='entry' else register(frame,'w25');assert multi in (None,0,1)
   route=('buffer' if flag&1 else 'skip') if kind=='entry' else ('ready' if flag&1 else 'skip' if multi else 'commit') if kind=='buffer' else ('commit' if flag&1 or not multi else 'skip')
   records.append({'stage':'rattleGate','kind':kind,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'flag':flag,'multi':multi,'route':route})
   next_name,address={'buffer':('rattleBuffer',0x1004601a0),'ready':('rattleReady',0x1004601ac),'commit':('rattleCommit',0x10051182c),'skip':('rattleSkip',0x10085ede4)}[route]
   replace(frame,name,next_name,address);source_role=next_name
  elif name=='rattleSkip':
   h=register(frame,'x21');assert thread==main_thread and source_pending and source_pending['voice']==hex(h)
   records.append({'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'currentX':scalar(frame,h+0x2f38),'modalX':scalar(frame,h+0xa2c),'result':register(frame,'w0')})
   source_pending=None;replace(frame,name,'rattleSource',0x10085ed9c);source_role='rattleSource'
  elif name=='rattleCommit':
   v=register(frame,'x0');h=v-0x168;assert thread==main_thread and source_pending and source_pending['voice']==hex(h)
   caller=frame.GetThread().GetProcess().GetTarget().ResolveLoadAddress(register(frame,'x30')).GetFileAddress();assert caller in (0x1007184b0,0x100460260)
   records.append({'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'modal':hex(v),'caller':hex(caller),'argument':regfloat(frame,'s0','f'),'modalX':scalar(frame,v+0x8c4)})
   if caller==0x100460260:
    source_pending=None
    next_name,address=('consumer',0x100460908) if EARLY else ('rattleSource',0x10085ed9c)
    replace(frame,name,next_name,address);source_role=next_name
  elif name in ('groupControl','groupControlAfter'):
   assert EARLY and thread==main_thread
   p=register(frame,'x0');h=p-0xcf0;assert h in base.voices
   row={'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'counter':scalar(frame,h+0x6c,'I'),'state':envelope(frame,h)}
   if name=='groupControl':
    caller=frame.GetThread().GetProcess().GetTarget().ResolveLoadAddress(register(frame,'x30')).GetFileAddress();assert caller==0x10035f8d8 and group_pending is None
    new=register(frame,'x22');assert new in base.voices and new!=h
    row.update(strength=regfloat(frame,'s0','f'),newEpoch=base.voices[new]);group_pending={'voice':hex(h),'counter':row['counter']}
    records.append(row);replace(frame,name,'groupControlAfter',0x1006edd74)
   else:
    assert group_pending=={'voice':hex(h),'counter':row['counter']}
    group_pending=None;records.append(row);replace(frame,name,'groupControl',0x1006edcf8)
  elif name=='consumerPost':
   h=register(frame,'x19');age=scalar(frame,h+0x6c,'I');assert post_pending=={'voice':hex(h),'counter':age}
   records.append({'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'counter':age,'channels':channels(frame),'state':base.release_state(frame,h+0xd08),'filter':base.release_filter(frame,h+0xd08),'envelope':envelope(frame,h),'preGain':pre_gain(frame,h)})
   if CROSS:
    records[-1]['crossControls']={key:scalar(frame,h+offset,'B') for key,offset in [('keepGroups',0x30b5),('keepAuxiliary',0x30b6),('processorA',0x1740),('processorB',0x1918)]}
    records[-1]['auxiliary']=auxiliary_matrix(frame,register(frame,'x21'))
    replace(frame,name,'consumerCross',0x100460acc)
   else:post_pending=None;replace(frame,name,'consumer',0x100460908)
  elif name=='consumerCross':
   h=register(frame,'x19');age=scalar(frame,h+0x6c,'I');assert post_pending=={'voice':hex(h),'counter':age}
   records.append({'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'counter':age,'channels':channels(frame),'auxiliary':auxiliary_matrix(frame,register(frame,'x21'))})
   post_pending=None
   next_name,address=('rattleSource',0x10085ed9c) if EARLY else ('consumer',0x100460908)
   if AUDIO:
    assert thread==main_thread and thread not in audio_pending
    matrix=register(frame,'x23');records[-1]['midControls']=mid_controls(frame,h)
    audio_pending[thread]={'voice':h,'counter':age,'matrix':matrix,'phase':'cross'}
    next_name,address='audioGain',0x100460c84
   replace(frame,name,next_name,address)
   if EARLY:source_role=next_name
  elif name in ('audioGain','audioEntry','audioReturn'):
   assert AUDIO and thread==main_thread
   c=audio_pending[thread];h=c['voice'];age=scalar(frame,h+0x6c,'I');assert age==c['counter']
   row={'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'counter':age,'midControls':mid_controls(frame,h),'channels':mid_groups(frame,c['matrix'])}
   if name=='audioGain':
    assert c['phase']=='cross' and register(frame,'x19')==h and register(frame,'x23')==c['matrix']
    c['phase']='gain';next_name,address='audioEntry',0x10030bd30
   elif name=='audioEntry':
    target=frame.GetThread().GetProcess().GetTarget();caller=target.ResolveLoadAddress(register(frame,'x30')).GetFileAddress()
    assert c['phase']=='gain' and caller==0x100460de4
    obj=register(frame,'x0');descriptor=register(frame,'x1');assert obj==h+0x28a8 and descriptor==register(frame,'x2')
    c.update(obj=obj,descriptor=descriptor,phase='entry')
    row.update(control=regfloat(frame,'s0','f'),cachedControl=scalar(frame,h+0x2f38),input=audio_samples(frame,descriptor),state=rattle_state(frame,obj))
    if row['control']!=0 or row['state']['active']:
     bank=scalar(frame,obj+0x10,'Q');pointer,count=unpack(frame,bank,'QQ');assert 0<count<=131072
     row['sourceTable']={'pointer':hex(pointer),'count':count}
     if (pointer,count) not in audio_tables:
      row['sourceTable']['values']=list(unpack(frame,pointer,'f'*count));audio_tables.add((pointer,count))
    next_name,address='audioReturn',0x10030c104
   else:
    assert c['phase']=='entry' and register(frame,'x19')==c['obj'] and register(frame,'x20')==c['descriptor']
    row.update(output=audio_samples(frame,c['descriptor']),state=rattle_state(frame,c['obj']))
    audio_pending.pop(thread);next_name,address='rattleSource',0x10085ed9c
   records.append(row);replace(frame,name,next_name,address);source_role=next_name
  else:
   begin=len(records);result=base.observed(frame,location,_)
   for r in records[begin:]:r.setdefault('site',site);r.setdefault('thread',thread)
   if errors:return result
   for row in records[begin:]:
    if row['stage'] in ('coefficients','envelopeResult'):worker_seen[(row['epoch'],row['stage'])]=row['counter']
   if name=='before':
    main_thread=thread if main_thread is None else main_thread;assert thread==main_thread and source_pending is None
    if source_role!='weights':replace(frame,source_role,'weights',0x100695108);source_role='weights'
    if EARLY:
     assert group_pending is None and 'copy' in hooks
     replace(frame,'copy','groupControl',0x1006edcf8)
   elif name=='weights':
    assert thread==main_thread
    if base.spectrum_calls%2==0:
     replace(frame,'weights','rattleSource',0x10085ed9c);source_role='rattleSource'
     if not source_started:base.transitions.append({'phase':'source','afterInitializations':base.final_calls,'weightsSeen':base.spectrum_calls,'activeSites':6});source_started=True
   elif name=='consumer':
    assert thread==main_thread and post_pending is None
    r=records[-1];h=register(frame,'x19');r['injectionPre']['envelope']=envelope(frame,h);r['injectionPre']['preGain']=pre_gain(frame,h);post_pending={'voice':hex(h),'counter':r['counter']};replace(frame,'consumer','consumerPost',0x100460a4c)
    if EARLY:source_role='consumerPost'
  if len(records)%64==0:save()
  return CROSS or len(slot_transitions)!=changes_before
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists();t=debugger.GetSelectedTarget();spec=t.GetModuleAtIndex(0).GetFileSpec();base.verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in base.POINTS.items():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded(),result.GetError()
  h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');h.SetAutoContinue(False);hooks[name]=h
 save()

def finish(debugger):
 global window_complete
 import lldb
 p=debugger.GetSelectedTarget().GetProcess();assert p.GetState()==lldb.eStateExited and p.GetExitStatus()==0 and not source_pending and not post_pending and source_role=='rattleSource' and acknowledged_transitions==len(slot_transitions)
 if EARLY:
  assert group_pending is None and not slot_updates and 'copy' in hooks
  assert sum(r['stage']=='groupControl' for r in records)==sum(r['stage']=='groupControlAfter' for r in records)>0
 if AUDIO:assert not audio_pending and audio_tables
 assert sum(r['stage']=='rattleSource' for r in records)==sum((r['stage']=='rattleCommit' and r['caller']=='0x100460260') or r['stage']=='rattleSkip' for r in records)
 for epoch in range(5):
  expected=[r['counter'] for r in records if r['stage']=='consumer' and r['epoch']==epoch]
  for stage in (['consumerPost','consumerCross'] if CROSS else ['consumerPost']):assert expected==[r['counter'] for r in records if r['stage']==stage and r['epoch']==epoch]
  if EARLY:
   assert expected==[r['counter'] for r in records if r['stage']=='copy' and r['epoch']==epoch]
  if AUDIO:
   for stage in ('audioGain','audioEntry','audioReturn'):assert expected==[r['counter'] for r in records if r['stage']==stage and r['epoch']==epoch]
 base.finish();window_complete=True

def resume_owned_stops(debugger):
 """Normal Continue for current or most recently delivered owned point only."""
 global acknowledged_transitions
 import lldb,time
 debugger.SetAsync(False);target=debugger.GetSelectedTarget();process=target.GetProcess();deadline=time.monotonic()+40;path=ROOT/'owned-resumes.jsonl'
 while process.GetState()==lldb.eStateStopped and time.monotonic()<deadline:
  assert not errors and not window_complete and target.GetNumBreakpoints()==len(hooks)==6
  recovered=set()
  if POLL_WORKER:
   # Read real stopped frames only at exact registered worker addresses.
   # No historical reconstruction, synthetic PC, or target state change.
   for thread in process:
    frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress()
    name=next((k for k in ('coefficients','envelopeResult') if pc==base.POINTS[k]),None)
    if name is None:continue
    h=register(frame,'x19')-0x168
    if h not in base.voices:continue
    epoch=base.voices[h];age=scalar(frame,h+0x178,'I');previous=worker_seen.get((epoch,name),-64 if name=='coefficients' else 0)
    if age==previous:continue
    assert age==previous+64,('Stopped worker observation gap',epoch,name,previous,age)
    begin=len(records);observed(frame,hooks[name].GetLocationAtIndex(0),STOPPED_FRAME)
    assert not errors and len(records)==begin+1 and worker_seen[(epoch,name)]==age
    stopped_worker_reads.append({'thread':thread.GetThreadID(),'stage':name,'epoch':epoch,'counter':age,'stopId':process.GetStopID(),'record':len(records)})
    recovered.add(thread.GetThreadID())
  matched=False;details=[]
  for thread in process:
   reason=thread.GetStopReason()
   if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):
    if thread.GetThreadID() in recovered:
     frame=thread.GetFrameAtIndex(0);details.append({'thread':thread.GetThreadID(),'pc':hex(frame.GetPCAddress().GetFileAddress()),'reason':reason,'ids':[],'lastOwned':last_seen[thread.GetThreadID()],'observedFrame':True})
    continue
   frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress();ids=[thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())];seen=last_seen.get(thread.GetThreadID())
   own=seen and pc in (seen['fileAddress'],seen['fileAddress']+4)
   if reason==lldb.eStopReasonBreakpoint and ids and ids[0]==(1<<64)-2:
    bp=target.FindBreakpointByID(-2);assert bp.IsValid() and bp.IsInternal() and len(ids)==2 and 1<=ids[1]<=bp.GetNumLocations();a=bp.GetLocationAtIndex(ids[1]-1).GetAddress();assert a.GetModule().GetFileSpec().GetFilename()=='libsystem_pthread.dylib' and a.GetFileAddress()==pc and a.GetLoadAddress(target)==frame.GetPC()
   elif reason==lldb.eStopReasonBreakpoint:
    assert own and len(ids)==2 and ids[0]==seen['id'];matched=True
   elif reason==lldb.eStopReasonException:
    assert own and ids in ([6,1,0],[6,1,frame.GetPC()]);matched=True
   elif reason==lldb.eStopReasonTrace:
    assert own and pc==seen['fileAddress']+4 and ids==[];matched=True
   else:raise AssertionError(('Unowned stop',reason,hex(pc),ids))
   details.append({'thread':thread.GetThreadID(),'pc':hex(pc),'reason':reason,'ids':ids,'lastOwned':seen,'observedFrame':thread.GetThreadID() in recovered})
  assert matched
  while slot_updates:
   replace_now(*slot_updates[0]);slot_updates.pop(0)
  stop_id=process.GetStopID();previous=acknowledged_transitions
  for t in slot_transitions[previous:]:t['barrierStopId']=stop_id
  acknowledged_transitions=len(slot_transitions)
  with path.open('a') as log:log.write(json.dumps({'records':len(records),'transitionFrom':previous,'transitionThrough':acknowledged_transitions,'stopId':stop_id,'threads':details})+'\n')
  error=process.Continue();assert error.Success(),str(error)
 save(force=True)
