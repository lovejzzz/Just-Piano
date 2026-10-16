"""Read-only same-run FFT outputs and the CABN products consuming their buffers."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'fftEntry':0x1000e3258,'fftReturn':0x1000e3730,'product':0x1007ff7f4,'productReturn':0x1007ff7f8}
LIMIT=512
records,errors,hooks=[],[],[]
fft_pending,product_pending={},{}
products=0;complete=False


def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'productLimit':LIMIT,'records':records,'errors':errors},indent=2))


def spectrum(frame,p):
 assert scalar(frame,p+8,'Q')==64 and scalar(frame,p+0x30,'Q')==128
 data=scalar(frame,p+0x28,'Q')
 return {'object':hex(p),'buffer':hex(data),'empty':scalar(frame,p+0x14,'B'),'content':scalar(frame,p+0x18,'I'),'data':floats(frame,data,128)}


def observed(frame,location,_):
 global products,complete
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='fftEntry':
   plan=register(frame,'x0');direction=register(frame,'w4')
   if scalar(frame,plan,'I')!=128 or scalar(frame,plan+4,'I')!=16 or scalar(frame,plan+0x6c,'I')!=0:return False
   assert direction in (0,1) and register(frame,'w5')==0
   dst=register(frame,'x2');fft_pending[thread]={'buffer':dst,'direction':direction}
   records.append({'stage':stage,'thread':thread,'buffer':hex(dst),'direction':direction,'input':floats(frame,register(frame,'x1'),128)})
  elif stage=='fftReturn':
   c=fft_pending.pop(thread,None)
   if c is not None:records.append({'stage':stage,'thread':thread,'buffer':hex(c['buffer']),'direction':c['direction'],'output':floats(frame,c['buffer'],128)})
  elif stage=='product':
   bank=register(frame,'x19')
   if scalar(frame,bank+8,'Q')!=64 or scalar(frame,bank+0x10,'Q')!=9:return False
   dst=register(frame,'x0');product_pending[thread]=dst
   records.append({'stage':stage,'ordinal':products,'destination':spectrum(frame,dst),'a':spectrum(frame,register(frame,'x1')),
                   'b':spectrum(frame,register(frame,'x2')),'scale':regfloat(frame,'s0','f')})
  else:
   dst=product_pending.pop(thread,None)
   if dst is None:return False
   records.append({'stage':stage,'ordinal':products,'destination':spectrum(frame,dst)});products+=1
   if products>=LIMIT:
    complete=True
    for h in hooks:h.SetEnabled(False)
   if complete or products%32==0:save()
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
