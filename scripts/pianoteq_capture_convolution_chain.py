"""Read-only forward FFT, spectral products, inverse FFT and overlap in one run."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'fftEntry':0x1000e34b4,'product':0x1007ff7f4,'overlap':0x10070eeb0,'overlapReturn':0x10070ef6c}
LIMIT=129
records,errors,hooks=[],[],[]
overlap_pending={}
inflight=set()
overlaps=0;products=0;complete=False


def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':4,'threadIndexFilter':1,'inverseInputCaptured':False,'productReturnCaptured':False,'windowComplete':complete,'overlapLimit':LIMIT,'productCount':products,'overlapCount':overlaps,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
 global overlaps,products,complete
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  assert frame.GetThread().GetIndexID()==1
  if stage=='fftEntry':
   plan=register(frame,'x23')
   if scalar(frame,plan,'I')!=128 or scalar(frame,plan+4,'I')!=16 or scalar(frame,plan+0x6c,'I')!=0:return False
   assert register(frame,'w5')==0
   records.append({'stage':stage,'thread':thread,'buffer':hex(register(frame,'x20')),'direction':0,'input':floats(frame,register(frame,'x21'),128)})
  elif stage=='product':
   bank=register(frame,'x19')
   if scalar(frame,bank+8,'Q')!=64 or scalar(frame,bank+0x10,'Q')!=9:return False
   def spectrum(p):
    assert scalar(frame,p+8,'Q')==64 and scalar(frame,p+0x30,'Q')==128
    ptr=scalar(frame,p+0x28,'Q')
    return {'buffer':hex(ptr),'empty':scalar(frame,p+0x14,'B'),'content':scalar(frame,p+0x18,'I'),'data':floats(frame,ptr,128)}
   records.append({'stage':stage,'thread':thread,'ordinal':products,'destination':spectrum(register(frame,'x0')),
                   'a':spectrum(register(frame,'x1')),'b':spectrum(register(frame,'x2')),'scale':regfloat(frame,'s0','f')})
   inflight.add(records[-1]['destination']['buffer'])
   products+=1
  elif stage=='overlap':
   obj=register(frame,'x0')
   if scalar(frame,obj+8,'Q')!=64:return False
   assert scalar(frame,obj+0x18,'I') in (0,2)
   output=register(frame,'x1');overlap=register(frame,'x2')
   assert scalar(frame,output+8,'Q')==64 and scalar(frame,overlap+8,'Q')==64
   dst=scalar(frame,output,'Q');tail=scalar(frame,overlap,'Q');buf=scalar(frame,obj+0x28,'Q')
   overlap_pending[thread]={'object':hex(obj),'buffer':hex(buf),'dst':dst,'tail':tail,'ordinal':overlaps}
   inflight.discard(hex(buf))
   records.append({'stage':stage,'thread':thread,'object':hex(obj),'buffer':hex(buf),'ordinal':overlaps,
                   'before':floats(frame,dst,64),'oldTail':floats(frame,tail,64),'inverse':floats(frame,buf,128)})
  else:
   c=overlap_pending.pop(thread,None)
   if c is None:return False
   records.append({'stage':stage,'thread':thread,'object':c['object'],'ordinal':c['ordinal'],
                   'output':floats(frame,c['dst'],64),'tail':floats(frame,c['tail'],64)})
   overlaps+=1
   if overlaps>=LIMIT and not inflight:
    complete=True
    for h in hooks:h.SetEnabled(False)
   if complete:save()
  return False
 except Exception:errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for address in POINTS.values():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --thread-index 1 --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded()
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
