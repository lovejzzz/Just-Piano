"""Read-only global workspace group matrices and actual cabinet source/auxiliary."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'workspace':0x1006c2ac4,'cabinet':0x1000ef37c}
LIMIT=400
records,errors,hooks=[],[],[]
pending={};blocks=0;complete=False

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumBlocks':LIMIT,'blocks':blocks,'records':records,'errors':errors},indent=2))

def observed(frame,location,_):
 global blocks,complete
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='workspace':
   assert thread not in pending
   root=register(frame,'x0');b=register(frame,'x2');state=scalar(frame,root+0x50,'Q')
   begin,end=unpack(frame,b+0x270,'QQ');assert end>=begin and (end-begin)%104==0 and (end-begin)//104==3
   fb,fe=unpack(frame,state+0x3a0,'QQ');assert fe-fb==12
   pending[thread]={'B':b,'R':root,'state':state}
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'B':hex(b),'R':hex(root),'S':hex(state),
    'groups':[matrix(frame,a) for a in range(begin,end,104)],'flat':matrix(frame,b+0x288),'auxiliary':matrix(frame,b+0x120),
    'workspace':{hex(o):matrix(frame,b+o) for o in (0x158,0x190,0x1c8,0x200,0x238)},
    'feedbackGain':scalar(frame,state+0x114),'feedbackPreRoute':scalar(frame,state+0x329,'B')&1,'maskEnabled':scalar(frame,state+0x3b8,'B'),'rowFlags':list(unpack(frame,fb,'III'))})
  elif thread in pending:
   state=register(frame,'x1')
   if scalar(frame,state,'I')!=0x3d396:return False
   source=matrix(frame,register(frame,'x2'))
   if source['rows']!=9:return False
   c=pending.pop(thread);assert register(frame,'x2')==c['B']+0x288
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'B':hex(c['B']),'source':source,
    'feedback':matrix(frame,c['state']+(0x150 if scalar(frame,c['state']+0x329,'B')&1 else 0x118)),'auxiliary':matrix(frame,c['B']+0x120),'groups':[matrix(frame,scalar(frame,c['B']+0x270,'Q')+104*i) for i in range(3)]})
   blocks+=1
   if blocks==LIMIT:
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
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --thread-index 1 --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks.append(h)
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
