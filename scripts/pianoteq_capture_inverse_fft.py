"""Four fixed read-only points in the native real inverse FFT."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1000e3258,'preprocessed':0x1000e36a0,'core':0x1000e36bc,'returned':0x1000e3730}
LIMIT=64
records,errors,hooks=[],[],[]
pending={};ordinal=-1;complete=False

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))
def observed(frame,location,_):
 global ordinal,complete
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='entry':
   p=register(frame,'x0')
   if scalar(frame,p,'I')!=128 or scalar(frame,p+4,'I')!=16 or register(frame,'w4')!=1:return False
   assert register(frame,'w5')==0 and scalar(frame,p+0x6c,'I')==0
   ordinal+=1
   if ordinal>=LIMIT:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save();return False
   pending[thread]={'ordinal':ordinal,'output':register(frame,'x2')}
   records.append({'stage':stage,'ordinal':ordinal,'input':floats(frame,register(frame,'x1'),128),'planWords':list(unpack(frame,p,'I'*28)),
                   'e':floats(frame,scalar(frame,p+0x78,'Q'),96),'twiddle':floats(frame,scalar(frame,p+0x80,'Q'),32)})
  elif thread in pending:
   c=pending[thread];ptr=register(frame,'x24') if stage=='preprocessed' else register(frame,'x0') if stage=='core' else c['output']
   records.append({'stage':stage,'ordinal':c['ordinal'],'output':floats(frame,ptr,128)})
   if stage=='returned':pending.pop(thread);save()
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-');spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for a in POINTS.values():
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {a:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks.append(h)
 save()
