"""Read-only inverse FFT and normalization/overlap observations."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,verify_text
from pianoteq_capture_recurrence import register,floats
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'fftEntry':0x1000e3258,'overlap':0x10070eeb0,'overlapReturn':0x10070ef6c}
LIMIT=128
records,errors,hooks=[],[],[]
overlap_pending={}
overlaps=0;complete=False


def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':2,'inverseReturnCaptured':False,'windowComplete':complete,'overlapLimit':LIMIT,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
 global overlaps,complete
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='fftEntry':
   plan=register(frame,'x0');direction=register(frame,'w4')
   if scalar(frame,plan,'I')!=128 or scalar(frame,plan+4,'I')!=16 or scalar(frame,plan+0x6c,'I')!=0:return False
   if direction!=1:return False
   assert register(frame,'w5')==0
   dst=register(frame,'x2')
   records.append({'stage':stage,'thread':thread,'buffer':hex(dst),'direction':direction,'input':floats(frame,register(frame,'x1'),128)})
  elif stage=='overlap':
   obj=register(frame,'x0')
   if scalar(frame,obj+8,'Q')!=64:return False
   assert scalar(frame,obj+0x18,'I') in (0,2)
   output=register(frame,'x1');overlap=register(frame,'x2')
   assert scalar(frame,output+8,'Q')==64 and scalar(frame,overlap+8,'Q')==64
   dst=scalar(frame,output,'Q');tail=scalar(frame,overlap,'Q');buf=scalar(frame,obj+0x28,'Q')
   overlap_pending[thread]={'object':hex(obj),'buffer':hex(buf),'dst':dst,'tail':tail,'ordinal':overlaps}
   records.append({'stage':stage,'thread':thread,'object':hex(obj),'buffer':hex(buf),'ordinal':overlaps,
                   'before':floats(frame,dst,64),'oldTail':floats(frame,tail,64),'inverse':floats(frame,buf,128)})
  else:
   c=overlap_pending.pop(thread,None)
   if c is None:return False
   records.append({'stage':stage,'thread':thread,'object':c['object'],'ordinal':c['ordinal'],
                   'output':floats(frame,c['dst'],64),'tail':floats(frame,c['tail'],64)})
   overlaps+=1
   if overlaps>=LIMIT:
    complete=True
    for h in hooks:h.SetEnabled(False)
   if complete or overlaps%16==0:save()
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
