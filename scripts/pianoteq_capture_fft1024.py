"""Read-only 1024-point forward transforms inside the 512-frame tail worker."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'worker':0x1007ccca0,'entry':0x1000e34b4,'core':0x1000e3758,'returned':0x1000e3730}
LIMIT=128
records,errors,hooks=[],[],[]
workers={};plans={};pending={};owner=None;owner_thread=None;completed=0;complete=False

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'transformLimit':LIMIT,'ownerThread':owner_thread,'threadBindingDynamic':True,
   'plans':plans,'records':records,'errors':errors},indent=2))

def observed(frame,location,_):
 global owner,owner_thread,completed,complete
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='worker':
   if frame.GetThread().GetIndexID()==1:return False
   node=register(frame,'x0');bank=scalar(frame,node+8,'Q')
   if scalar(frame,bank+8,'Q')!=512 or scalar(frame,bank+0x10,'Q')!=9:return False
   if owner is None:
    owner=node;owner_thread=thread
    for h in hooks:h.SetThreadID(thread)
    for h in hooks[1:]:h.SetEnabled(True)
   if node!=owner:return False
   workers[thread]={'node':hex(node),'time':scalar(frame,node+0x40,'I')};return False
  if stage=='entry':
   if thread not in workers:return False
   plan=register(frame,'x23')
   if scalar(frame,plan,'I')!=1024 or scalar(frame,plan+4,'I')!=128:return False
   assert register(frame,'w5')==0 and scalar(frame,plan+0x6c,'I')==0
   assert any(0x1007ccca0<=frame.GetThread().GetFrameAtIndex(i).GetPCAddress().GetFileAddress()<0x1007cd0e8 for i in range(1,min(24,frame.GetThread().GetNumFrames())))
   assert thread not in pending
   key=hex(plan)
   if key not in plans:
    plans[key]={'words':list(unpack(frame,plan,'I'*28)),'e':floats(frame,scalar(frame,plan+0x78,'Q'),768),
      'twiddleBits':list(unpack(frame,scalar(frame,plan+0x80,'Q'),'I'*256))}
   pending[thread]={'ordinal':completed,'output':register(frame,'x20')}
   records.append({'stage':stage,'ordinal':completed,'thread':thread,'plan':key,'worker':workers[thread],
      'input':floats(frame,register(frame,'x21'),1024)})
  elif thread in pending:
   c=pending[thread]
   ptr=register(frame,'x0') if stage=='core' else c['output']
   records.append({'stage':stage,'ordinal':c['ordinal'],'thread':thread,'output':floats(frame,ptr,1024)})
   if stage=='returned':
    pending.pop(thread);completed+=1
    if completed>=LIMIT:
     complete=True
     for h in hooks:h.SetEnabled(False)
     save()
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for address in POINTS.values():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks.append(h)
  if address!=POINTS['worker']:h.SetEnabled(False)
 save()


def resume_known_stops(debugger):
    """Continue at most three unexpected hardware stops at our own fixed sites."""
    import lldb
    assert not debugger.GetAsync()
    observations=[]
    process=debugger.GetSelectedTarget().GetProcess()
    for attempt in range(3):
        if process.GetState()!=lldb.eStateStopped:break
        thread=process.GetSelectedThread();frame=thread.GetFrameAtIndex(0)
        pc=frame.GetPCAddress().GetFileAddress()
        description=thread.GetStopDescription(1024)
        if errors or pc not in POINTS.values() or thread.GetStopReason()!=lldb.eStopReasonException:break
        observations.append({'attempt':attempt,'pc':hex(pc),'reason':description,'recordsBeforeContinue':len(records)})
        (ROOT/'resumed-stops.json').write_text(json.dumps(observations,indent=2)+'\n')
        error=process.Continue()
        if error.Fail():raise RuntimeError(str(error))
    save()
