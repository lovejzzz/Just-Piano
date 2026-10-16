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
ROOT=base.ROOT;hooks=base.hooks;records=base.records;errors=base.errors;last_seen={};slot_transitions=[]
source_role='weights';source_pending=None;post_pending=None;main_thread=None;source_started=False;window_complete=False;acknowledged_transitions=0;last_saved_rows=-256

def save(force=False):
 global last_saved_rows
 if not force and not errors and not base.complete and len(records)-last_saved_rows<256:return
 data={'schema':1,'sourceCommits':True,'sourceDispatchGates':True,'consumerPost':True,'consumerDelay':True,'consumerInjection':True,'injectionEntryObserved':False,'dispatchControls':True,'workerOutputs':True,'windowBlocks':None,'fixedSites':False,'siteCount':6,'records':records,'errors':errors,'starts':base.starts,'spectrumCount':base.spectrum_calls,'finalCount':base.final_calls,'copyCount':base.copies,'initializations':len(base.initialized),'envelopeBlocks':base.blocks,'duplicateEnvelopeReturns':base.duplicates,'envelopePending':len(base.envelope_pending),'coefficientCount':base.coefficients,'refreshCount':sum(r['stage']=='refresh' for r in records),'renderCount':sum(r['stage']=='envelopeResult' and 'render' in r for r in records),'pending':len(base.pending),'complete':base.complete,'activeSites':sum(h.IsEnabled() for h in hooks.values()),'transitions':base.transitions,'slotTransitions':slot_transitions,'sourceRole':source_role,'sourcePending':source_pending,'postPending':post_pending,'slotBarriers':True,'acknowledgedTransitions':acknowledged_transitions}
 (ROOT/'runtime.json').write_text(json.dumps(data,indent=2,allow_nan=False));last_saved_rows=len(records)
base.save=save

def replace(frame,old_name,new_name,address):
 import lldb
 t=frame.GetThread().GetProcess().GetTarget();old=hooks.pop(old_name);old_id=old.GetID();assert t.BreakpointDelete(old_id);del base.POINTS[old_name]
 result=lldb.SBCommandReturnObject();t.GetDebugger().GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded(),result.GetError()
 h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');h.SetAutoContinue(False);hooks[new_name]=h;base.POINTS[new_name]=address
 assert t.GetNumBreakpoints()==len(hooks)==6 and all(h.IsEnabled() and h.IsHardware() for h in hooks.values())
 slot_transitions.append({'afterRecord':len(records),'oldRole':old_name,'oldId':old_id,'newRole':new_name,'newId':h.GetID(),'address':hex(address),'registered':6,'active':6,'callbackStopId':frame.GetThread().GetProcess().GetStopID()})

def activate_consumer(frame):
 assert base.final_calls==5 and base.spectrum_calls==10
 replace(frame,'before','consumer',0x100460908)
 base.transitions.append({'phase':'consumer','afterInitializations':5,'weightsSeen':10,'activeSites':6})
base.activate_consumer=activate_consumer

def pre_gain(frame,h):
 return {'currentGain':scalar(frame,h+0xcc4),'active':scalar(frame,h+0xcd0,'B'),'ready':scalar(frame,h+0xcd1,'B'),'words':list(unpack(frame,h+0xcb8,'IIIIII'))}

def envelope(frame,h):
 return {'gain':scalar(frame,h+0xcf0),'step':scalar(frame,h+0xcf4),'active':scalar(frame,h+0xcfc,'B'),'elapsed':scalar(frame,h+0xd00,'I'),'duration':scalar(frame,h+0xd04,'I')}

def observed(frame,location,_):
 global source_role,source_pending,post_pending,main_thread,source_started
 try:
  changes_before=len(slot_transitions)
  pc=frame.GetPCAddress().GetFileAddress();name=next(k for k,v in base.POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID();hook=hooks[name]
  site={'id':hook.GetID(),'fileAddress':pc,'loadAddress':frame.GetPC(),'hits':hook.GetHitCount(),'stopId':frame.GetThread().GetProcess().GetStopID()};last_seen[thread]=site
  if name=='rattleSource':
   h=register(frame,'x21')
   if h not in base.voices:return False
   assert thread==main_thread and source_pending is None
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
    source_pending=None;replace(frame,name,'rattleSource',0x10085ed9c);source_role='rattleSource'
  elif name=='consumerPost':
   h=register(frame,'x19');age=scalar(frame,h+0x6c,'I');assert post_pending=={'voice':hex(h),'counter':age}
   matrix=register(frame,'x23');count=scalar(frame,matrix,'Q');assert count==3;channels=[]
   for i in range(count):
    d=matrix+8+56*i;rows,stride,n,sample_stride=unpack(frame,d,'IIII');assert rows==1 and n==64
    channels.append(list(unpack(frame,scalar(frame,d+16,'Q'),'f'*64)))
   records.append({'stage':name,'thread':thread,'site':site,'epoch':base.voices[h],'voice':hex(h),'counter':age,'channels':channels,'state':base.release_state(frame,h+0xd08),'filter':base.release_filter(frame,h+0xd08),'envelope':envelope(frame,h),'preGain':pre_gain(frame,h)})
   post_pending=None;replace(frame,name,'consumer',0x100460908)
  else:
   begin=len(records);result=base.observed(frame,location,_)
   for r in records[begin:]:r.setdefault('site',site);r.setdefault('thread',thread)
   if errors:return result
   if name=='before':
    main_thread=thread if main_thread is None else main_thread;assert thread==main_thread and source_pending is None
    if source_role!='weights':replace(frame,source_role,'weights',0x100695108);source_role='weights'
   elif name=='weights':
    assert thread==main_thread
    if base.spectrum_calls%2==0:
     replace(frame,'weights','rattleSource',0x10085ed9c);source_role='rattleSource'
     if not source_started:base.transitions.append({'phase':'source','afterInitializations':base.final_calls,'weightsSeen':base.spectrum_calls,'activeSites':6});source_started=True
   elif name=='consumer':
    assert thread==main_thread and post_pending is None
    r=records[-1];h=register(frame,'x19');r['injectionPre']['envelope']=envelope(frame,h);r['injectionPre']['preGain']=pre_gain(frame,h);post_pending={'voice':hex(h),'counter':r['counter']};replace(frame,'consumer','consumerPost',0x100460a4c)
  if len(records)%64==0:save()
  return len(slot_transitions)!=changes_before
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
 assert sum(r['stage']=='rattleSource' for r in records)==sum((r['stage']=='rattleCommit' and r['caller']=='0x100460260') or r['stage']=='rattleSkip' for r in records)
 for epoch in range(5):assert [r['counter'] for r in records if r['stage']=='consumer' and r['epoch']==epoch]==[r['counter'] for r in records if r['stage']=='consumerPost' and r['epoch']==epoch]
 base.finish();window_complete=True

def resume_owned_stops(debugger):
 """Normal Continue for current or most recently delivered owned point only."""
 global acknowledged_transitions
 import lldb,time
 debugger.SetAsync(False);target=debugger.GetSelectedTarget();process=target.GetProcess();deadline=time.monotonic()+40;path=ROOT/'owned-resumes.jsonl'
 while process.GetState()==lldb.eStateStopped and time.monotonic()<deadline:
  assert not errors and not window_complete and target.GetNumBreakpoints()==len(hooks)==6
  matched=False;details=[]
  for thread in process:
   reason=thread.GetStopReason()
   if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):continue
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
   details.append({'thread':thread.GetThreadID(),'pc':hex(pc),'reason':reason,'ids':ids,'lastOwned':seen})
  assert matched
  stop_id=process.GetStopID();previous=acknowledged_transitions
  for t in slot_transitions[previous:]:t['barrierStopId']=stop_id
  acknowledged_transitions=len(slot_transitions)
  with path.open('a') as log:log.write(json.dumps({'records':len(records),'transitionFrom':previous,'transitionThrough':acknowledged_transitions,'stopId':stop_id,'threads':details})+'\n')
  error=process.Continue();assert error.Success(),str(error)
 save(force=True)
