"""Six fixed read-only sites: source selection and actual post-Rattle envelopes.
Bounded component capture; observed audio input, not an independent whole voice.
"""
import json,os,sys,time,traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
LIMIT=int(os.environ.get('PIANOTEQ_TIME_WINDOW_BLOCKS','256'))
assert 256<=LIMIT<=1024
POINTS={'selection':0x1007181d8,'model':0x100718230,'entry':0x10030bd30,'before':0x10030c104,'gains':0x100460f08,'time':0x100460f1c}
records=[];errors=[];hooks={};voices={};sources={};models=set();pending={};last_seen={};ends={};complete=False;main_thread=None

def time_state(frame,h):
 a=h+0x2d88
 return dict(enabled=scalar(frame,a,'B'),delay=scalar(frame,a+4,'I'),attack=scalar(frame,a+8,'I'),decay=scalar(frame,a+12,'I'),counter=scalar(frame,a+16,'I'),attackRate=scalar(frame,a+24,'d'),decayRate=scalar(frame,a+32,'d'),value=scalar(frame,a+40,'d'))

def terminal(frame,h):
 def env(offset):
  a=h+offset
  return dict(zip(('period','slope','scale','gain','step','target'),unpack(frame,a,'ffffff')),enabled=scalar(frame,a+0x18,'B'),ready=scalar(frame,a+0x19,'B'))
 return dict(special=scalar(frame,h+0xc68,'Q')!=0,secondaryEnabled=scalar(frame,h+0x160,'B'),activationAge=scalar(frame,h+0x2eb8,'Q'),primary=env(0xc80),secondary=env(0xcd4),time=time_state(frame,h))

def groups(frame,address):
 assert scalar(frame,address,'Q')==3
 result=[]
 for i in range(3):
  row=matrix(frame,address+8+56*i);assert row['rows']==1 and row['samples']==64
  result.append(row['values'][0])
 return result

def save():
 ROOT.joinpath('runtime.json').write_text(json.dumps(dict(schema=1,activeTimeComponent=True,fixedSites=True,siteCount=6,windowBlocks=LIMIT,complete=complete,fullVoiceSourceComputed=False,observedAudioInput=True,records=records,errors=errors,pending=len(pending),voices=len(voices),sources=len(sources),models=len(models),ends=ends,activeSites=sum(h.IsEnabled() for h in hooks.values())),allow_nan=False))

def observed(frame,location,_):
 global main_thread
 try:
  pc=frame.GetPCAddress().GetFileAddress();name=next(k for k,v in POINTS.items() if v==pc)
  thread=frame.GetThread().GetThreadID();main_thread=thread if main_thread is None else main_thread;assert thread==main_thread
  site=dict(id=hooks[name].GetID(),fileAddress=pc,loadAddress=frame.GetPC(),stopId=frame.GetThread().GetProcess().GetStopID())
  last_seen[thread]=site
  if name in ('selection','model'):
   h=register(frame,'x28');g=register(frame,'x25');age=scalar(frame,h+0x6c,'I');assert age==0
   if name=='selection':
    assert h not in voices and len(voices)<5
    voices[h]=len(voices);sources[h]=True
    row=dict(source={'sampleRate':scalar(frame,g+0x98),'overrideDuration':scalar(frame,h+0x3064),'legato':scalar(frame,h+0x2ff4,'i'),'globalDelay':scalar(frame,g+0x1204),'globalAttack':scalar(frame,g+0x1208),'legatoAttack':scalar(frame,g+0x120c),'globalEnd':scalar(frame,g+0x1210)},note=scalar(frame,g+0x14),initialTime=time_state(frame,h))
   else:
    assert h in voices and h not in models;models.add(h);row={'selectedDuration':regfloat(frame,'s0','f')}
   records.append(dict(stage=name,thread=thread,site=site,epoch=voices[h],voice=hex(h),counter=age,**row))
  elif name=='entry':
   target=frame.GetThread().GetProcess().GetTarget();caller=target.ResolveLoadAddress(register(frame,'x30')).GetFileAddress();assert caller==0x100460de4
   h=register(frame,'x0')-0x28a8;assert h in voices
   age=scalar(frame,h+0x6c,'I')
   if age>=LIMIT*64:return True
   assert thread not in pending and age==ends.get(h,0)
   pending[thread]=dict(voice=h,age=age,matrix=register(frame,'x23'),auxiliary=register(frame,'x21'),descriptor=register(frame,'x1'),phase='entry')
   assert register(frame,'x1')==register(frame,'x2')
   records.append(dict(stage=name,thread=thread,site=site,epoch=voices[h],voice=hex(h),counter=age))
  else:
   h=register(frame,'x19')-0x28a8 if name=='before' else register(frame,'x19');assert h in voices
   age=scalar(frame,h+0x6c,'I')
   if age>=LIMIT*64:return True
   c=pending[thread];assert c['voice']==h and c['age']==age
   if name=='before':assert c['phase']=='entry' and register(frame,'x20')==c['descriptor']
   else:assert c['phase']==('before' if name=='gains' else 'gains') and register(frame,'x23')==c['matrix'] and register(frame,'x21')==c['auxiliary']
   aux=matrix(frame,c['auxiliary']);assert aux['rows']==3 and aux['samples']==64
   records.append(dict(stage=name,thread=thread,site=site,epoch=voices[h],voice=hex(h),counter=age,channels=groups(frame,c['matrix']),auxiliary=aux,tail=terminal(frame,h)))
   c['phase']=name
   if name=='time':
    ends[h]=age+64;pending.pop(thread)
    if len(ends)==5 and all(x==LIMIT*64 for x in ends.values()):
     for hook in hooks.values():hook.SetEnabled(False)
  assert len(records)<20*LIMIT+256
  if len(records)%128==0 or not any(h.IsEnabled() for h in hooks.values()):save()
  return True
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def resume_owned_stops(debugger):
 import lldb
 debugger.SetAsync(False);p=debugger.GetSelectedTarget().GetProcess();deadline=time.monotonic()+40
 while p.GetState()==lldb.eStateStopped and time.monotonic()<deadline:
  assert not errors and (all(h.IsEnabled() for h in hooks.values()) or len(ends)==5 and all(x==LIMIT*64 for x in ends.values()))
  details=[];matched=False
  for thread in p:
   reason=thread.GetStopReason()
   if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):continue
   pc=thread.GetFrameAtIndex(0).GetPCAddress().GetFileAddress();ids=[thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())];seen=last_seen.get(thread.GetThreadID());own=seen and pc in (seen['fileAddress'],seen['fileAddress']+4)
   if reason==lldb.eStopReasonBreakpoint and ids and ids[0]==(1<<64)-2:
    bp=p.GetTarget().FindBreakpointByID(-2);assert bp.IsValid() and bp.IsInternal() and len(ids)==2 and 1<=ids[1]<=bp.GetNumLocations();a=bp.GetLocationAtIndex(ids[1]-1).GetAddress();assert a.GetModule().GetFileSpec().GetFilename()=='libsystem_pthread.dylib' and a.GetFileAddress()==pc
   elif reason==lldb.eStopReasonBreakpoint:assert own and len(ids)==2 and ids[0]==seen['id'];matched=True
   elif reason==lldb.eStopReasonException:assert own and ids in ([6,1,0],[6,1,thread.GetFrameAtIndex(0).GetPC()]);matched=True
   elif reason==lldb.eStopReasonTrace:assert own and pc==seen['fileAddress']+4 and ids==[];matched=True
   else:raise AssertionError(('Unowned stop',reason,hex(pc),ids))
   details.append(dict(thread=thread.GetThreadID(),pc=hex(pc),reason=reason,ids=ids,lastOwned=seen))
  assert matched
  with ROOT.joinpath('owned-resumes.jsonl').open('a') as out:out.write(json.dumps(dict(stopId=p.GetStopID(),records=len(records),threads=details))+'\n')
  error=p.Continue();assert error.Success(),str(error)
 save()

def finish(debugger):
 global complete
 import lldb
 p=debugger.GetSelectedTarget().GetProcess();assert p.GetState()==lldb.eStateExited and p.GetExitStatus()==0 and not errors and not pending and len(voices)==len(sources)==len(models)==5
 for h,epoch in voices.items():
  assert ends[h]==LIMIT*64
  for stage in ('entry','before','gains','time'):assert [r['counter'] for r in records if r['stage']==stage and r['epoch']==epoch]==list(range(0,LIMIT*64,64))
 complete=True;save()

def __lldb_init_module(debugger,_):
 import lldb
 assert not ROOT.joinpath('runtime.json').exists();t=debugger.GetSelectedTarget();spec=t.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded(),result.GetError()
  h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');h.SetAutoContinue(False);hooks[name]=h
 assert t.GetNumBreakpoints()==6 and all(h.IsEnabled() and h.IsHardware() for h in hooks.values());save()
