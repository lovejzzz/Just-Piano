"""Four read-only hardware points; one slot alternates source load and setter return.
A bounded pilot for deleting the currently hit hardware point, not an audio engine.
"""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
LIMIT=int(os.environ.get('PIANOTEQ_COMMIT_LIMIT','64'));assert 1<=LIMIT<=4096
POINTS={'birth':0x10035ef10,'worker':0x100472f50,'copy':0x1004604d4,'slot':0x10085ed9c}
hooks={};records=[];errors=[];transitions=[];voices={};last_seen={};pending=None;slot_mode='source';commits=0;window_complete=False;main_thread=None;completion=None

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'pilot':True,'limit':LIMIT,'windowComplete':window_complete,'completion':completion,'commits':commits,'pending':pending,'siteCount':4,'activeSites':sum(h.IsEnabled() for h in hooks.values()),'slotMode':slot_mode,'records':records,'transitions':transitions,'errors':errors},indent=2,allow_nan=False))

def replace_slot(frame,mode,address):
 global slot_mode
 import lldb
 t=frame.GetThread().GetProcess().GetTarget();old=hooks.pop('slot');old_id=old.GetID();assert t.BreakpointDelete(old_id)
 result=lldb.SBCommandReturnObject();t.GetDebugger().GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded(),result.GetError()
 hook=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);hook.SetScriptCallbackFunction(__name__+'.observed');hook.SetAutoContinue(True);hooks['slot']=hook;POINTS['slot']=address;slot_mode=mode
 assert t.GetNumBreakpoints()==len(hooks)==4 and all(h.IsEnabled() and h.IsHardware() for h in hooks.values())
 transitions.append({'afterRecord':len(records),'oldId':old_id,'newId':hook.GetID(),'mode':mode,'address':hex(address),'registered':4,'active':4})

def observed(frame,location,_):
 global pending,commits,window_complete,main_thread,completion
 try:
  if window_complete:return False
  pc=frame.GetPCAddress().GetFileAddress();name=next(k for k,v in POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID();hook=hooks[name]
  site={'id':hook.GetID(),'fileAddress':pc,'loadAddress':frame.GetPC(),'hits':hook.GetHitCount(),'stopId':frame.GetThread().GetProcess().GetStopID()};last_seen[thread]=site
  r={'stage':slot_mode if name=='slot' else name,'thread':thread,'site':site}
  if name=='birth':
   assert len(voices)<5
   h=register(frame,'x22');manager=register(frame,'x19');owner=scalar(frame,manager+0xe00,'Q');assert h not in voices
   main_thread=thread if main_thread is None else main_thread;assert thread==main_thread
   voices[h]=len(voices);r.update(epoch=voices[h],voice=hex(h),owner=hex(owner),sourceX=scalar(frame,owner+0xe4));records.append(r)
  elif name=='slot':
   assert thread==main_thread
   if slot_mode=='source':
    h=register(frame,'x21')
    if h not in voices:return False
    assert pending is None
    x=regfloat(frame,'s0','f');r.update(epoch=voices[h],voice=hex(h),owner=hex(register(frame,'x8')),frozenX=x,sourceMemoryX=scalar(frame,register(frame,'x8')+0xe4),currentX=scalar(frame,h+0x2f38),consumerAge=scalar(frame,h+0x6c,'I'),workerAge=scalar(frame,h+0x178,'I'));records.append(r);pending={'epoch':voices[h],'voice':hex(h),'sourceRecord':len(records)-1,'x':x}
    replace_slot(frame,'setter',0x10051182c)
   else:
    v=register(frame,'x0');h=v-0x168;assert pending and h in voices and pending['voice']==hex(h)
    caller=frame.GetThread().GetProcess().GetTarget().ResolveLoadAddress(register(frame,'x30')).GetFileAddress();assert caller in (0x1007184b0,0x100460260)
    r.update(epoch=voices[h],voice=hex(h),caller=hex(caller),argument=regfloat(frame,'s0','f'),modalX=scalar(frame,v+0x8c4));records.append(r)
    if caller==0x100460260:
     pending=None;commits+=1
     if commits==LIMIT:
      window_complete=True;completion='limit'
      for hook in hooks.values():hook.SetEnabled(False)
     else:replace_slot(frame,'source',0x10085ed9c)
  else:
   h=register(frame,'x19')-(0x168 if name=='worker' else 0)
   if h not in voices:return False
   r.update(epoch=voices[h],voice=hex(h),workerAge=scalar(frame,h+0x178,'I'),consumerAge=scalar(frame,h+0x6c,'I'),voiceX=scalar(frame,h+0x2f38),modalX=scalar(frame,h+0xa2c))
   if name=='worker':r.update(u=scalar(frame,h+0xa34),duration=scalar(frame,h+0xaac),rate=scalar(frame,h+0x94c),gain=scalar(frame,h+0x918))
   records.append(r)
  if window_complete or len(records)%64==0:save()
  return False
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def finish(debugger):
 global window_complete,completion
 import lldb
 process=debugger.GetSelectedTarget().GetProcess();assert process.GetState()==lldb.eStateExited and process.GetExitStatus()==0
 assert not errors and pending is None and commits>0
 if not window_complete:
  assert len(voices)==5 and LIMIT==4096
  for epoch in range(5):
   ages=[r['workerAge'] for r in records if r['stage']=='worker' and r['epoch']==epoch]
   assert ages and ages==list(range(0,len(ages)*64,64))
  assert sum(r['stage']=='source' for r in records)==commits
  window_complete=True;completion='native-exit'
 for h in hooks.values():h.SetEnabled(False)
 save()

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists();target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded(),result.GetError()
  hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetScriptCallbackFunction(__name__+'.observed');hook.SetAutoContinue(True);hooks[name]=hook
 save()

def resume_owned_stops(debugger):
 """Normal Continue for current or most recently delivered owned point only."""
 import lldb,time
 debugger.SetAsync(False);target=debugger.GetSelectedTarget();process=target.GetProcess();deadline=time.monotonic()+40;path=ROOT/'owned-resumes.json';resumes=json.loads(path.read_text()) if path.exists() else []
 while process.GetState()==lldb.eStateStopped and time.monotonic()<deadline:
  assert not errors and not window_complete and target.GetNumBreakpoints()==len(hooks)==4
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
  resumes.append({'records':len(records),'threads':details});path.write_text(json.dumps(resumes,indent=2));save();error=process.Continue();assert error.Success(),str(error)
 save()
