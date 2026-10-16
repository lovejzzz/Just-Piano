"""Read-only real-FFT inputs, scalar-factorized core, and final packed output."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1000e3258,'core':0x1005f2f2c,'coreReturn':0x1000e3758,'returned':0x1000e3730}
LIMIT=64
RUNTIME_ONLY=os.environ.get('PIANOTEQ_FFT_RUNTIME_ONLY')=='1'
if RUNTIME_ONLY:
 POINTS.pop('core');POINTS['cabinet']=0x1001bbce0
runtime_started=False
records,errors,hooks=[],[],[]
pending={};ordinal=-1;complete=False


def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'runtimeOnly':RUNTIME_ONLY,'records':records,'errors':errors},indent=2))


def observed(frame,location,_):
 global ordinal,complete,runtime_started
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
  thread=frame.GetThread().GetThreadID()
  if stage=='cabinet':
   runtime_started=True;return False
  if stage=='entry':
   plan=register(frame,'x0');n=scalar(frame,plan,'I');nc=scalar(frame,plan+4,'I')
   if n!=128 or nc!=16:return False
   if RUNTIME_ONLY and (register(frame,'w4')!=0 or not runtime_started):return False
   ordinal+=1
   if ordinal>=LIMIT:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save();return False
   e,twiddle=unpack(frame,plan+0x78,'QQ');assert twiddle-e==nc*6*4
   pending[thread]={'ordinal':ordinal,'output':register(frame,'x2')}
   records.append({'stage':stage,'ordinal':ordinal,'input':floats(frame,register(frame,'x1'),n),
     'planWords':list(unpack(frame,plan,'I'*28)),'n':n,'nc':nc,
     'direction':register(frame,'w4'),'ordered':register(frame,'w5'),
     'e':floats(frame,e,nc*6),'twiddle':floats(frame,twiddle,nc*2)})
  elif thread in pending:
   c=pending[thread];r={'stage':stage,'ordinal':c['ordinal']}
   if stage=='core':
    r.update(n=register(frame,'x0'),input=floats(frame,register(frame,'x1'),128),factors=list(unpack(frame,register(frame,'x5'),'I'*25)),twiddle=floats(frame,register(frame,'x4'),32))
   elif stage=='coreReturn':r['output']=floats(frame,register(frame,'x0'),128)
   else:r['output']=floats(frame,c['output'],128);pending.pop(thread)
   records.append(r)
   if stage=='returned':save()
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
