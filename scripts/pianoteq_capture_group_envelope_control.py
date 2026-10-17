"""Five fixed read-only hardware sites for group gain from birth through re-strikes."""
import json,os,sys,traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_rattle_burst import resume_owned_stops as guarded_resume
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'birth':0x10035ef10,'control':0x1006edcf8,'controlAfter':0x1006edd74,'apply':0x100428784,'applyAfter':0x100428850}
hooks={};records=[];errors=[];voices={};pending={};last_seen={};complete=False

def state(frame,p):
 return dict(gain=scalar(frame,p),step=scalar(frame,p+4),rate=scalar(frame,p+8),
             active=scalar(frame,p+12,'B'),elapsed=scalar(frame,p+16,'I'),duration=scalar(frame,p+20,'I'))

def groups(frame,m):
 count=scalar(frame,m,'Q');assert count==3
 result=[]
 for i in range(count):
  d=m+8+i*56;rows,stride,n,row_stride=unpack(frame,d,'IIII');assert rows==1 and n==64
  result.append(list(unpack(frame,scalar(frame,d+16,'Q'),'f'*64)))
 return result

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps(dict(schema=1,siteCount=5,fixedSites=True,
  complete=complete,records=records,errors=errors,voices=len(voices),pending=len(pending),
  activeSites=sum(h.IsEnabled() for h in hooks.values())),allow_nan=False))

def observed(frame,location,_):
 try:
  name=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
  thread=frame.GetThread().GetThreadID();site=dict(id=hooks[name].GetID(),fileAddress=POINTS[name],stopId=frame.GetThread().GetProcess().GetStopID());last_seen[thread]=site
  if name=='birth':
   h=register(frame,'x22');assert h not in voices
   voices[h]=len(voices);records.append(dict(stage=name,thread=thread,site=site,epoch=voices[h],voice=hex(h),state=state(frame,h+0xcf0)))
  elif name in ('control','apply'):
   p=register(frame,'x0');h=p-0xcf0
   if h not in voices:return True
   caller=frame.GetThread().GetProcess().GetTarget().ResolveLoadAddress(register(frame,'x30')).GetFileAddress()
   assert caller==(0x10035f8d8 if name=='control' else 0x1004609dc)
   assert thread not in pending
   row=dict(stage=name,thread=thread,site=site,epoch=voices[h],voice=hex(h),counter=scalar(frame,h+0x6c,'I'),state=state(frame,p))
   item=dict(stage=name,object=p,voice=h)
   if name=='control':
    new=register(frame,'x22');assert new in voices and new!=h
    row.update(strength=regfloat(frame,'s0','f'),newEpoch=voices[new],newVoice=hex(new))
   else:
    item['matrix']=register(frame,'x1');row['channels']=groups(frame,item['matrix'])
   records.append(row);pending[thread]=item
  else:
   if thread not in pending:return True
   item=pending.pop(thread);assert name==item['stage']+'After';h=item['voice'];p=item['object']
   assert register(frame,'x0' if name=='controlAfter' else 'x19')==p
   row=dict(stage=name,thread=thread,site=site,epoch=voices[h],voice=hex(h),counter=scalar(frame,h+0x6c,'I'),state=state(frame,p))
   if name=='applyAfter':row['channels']=groups(frame,item['matrix'])
   records.append(row)
  if len(records)%128==0:save()
  return True
 except Exception:
  errors.append(traceback.format_exc())
  for hook in hooks.values():hook.SetEnabled(False)
  save();return True

def resume_owned_stops(debugger):
 return guarded_resume(debugger,sys.modules[__name__])

def finish(debugger):
 global complete
 import lldb
 p=debugger.GetSelectedTarget().GetProcess();assert p.GetState()==lldb.eStateExited and p.GetExitStatus()==0
 assert not errors and not pending and len(voices)==5
 assert sum(r['stage']=='control' for r in records)==sum(r['stage']=='controlAfter' for r in records)>0
 for epoch in range(5):
  a=[r['counter'] for r in records if r['stage']=='apply' and r['epoch']==epoch];b=[r['counter'] for r in records if r['stage']=='applyAfter' and r['epoch']==epoch]
  assert a and a[0]==0 and a==b and all(y>x and y%64==0 for x,y in zip(a,a[1:]))
 for hook in hooks.values():hook.SetEnabled(False)
 complete=True;save()

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists();t=debugger.GetSelectedTarget();spec=t.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded(),result.GetError()
  hook=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);hook.SetScriptCallbackFunction(__name__+'.observed');hook.SetAutoContinue(False);hooks[name]=hook
 assert t.GetNumBreakpoints()==5 and all(h.IsHardware() for h in hooks.values());save()
