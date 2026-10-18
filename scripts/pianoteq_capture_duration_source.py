import json,traceback,os
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar,unpack
records=[]
errors=[]
NOTE=int(os.environ.get('PIANOTEQ_DURATION_NOTE','69'))
if not 0<=NOTE<=127:raise ValueError('Integer MIDI observation note required')
original_save=base.save

def save():
 original_save();p=base.ROOT/'runtime.json';d=json.loads(p.read_text());d.update(durationRecords=records,durationErrors=errors);p.write_text(json.dumps(d,indent=2,allow_nan=False))
base.save=save

def observed(frame,bp,_):
 try:
  import lldb
  reg=lambda n:frame.FindRegister(n).GetValueAsUnsigned()
  def fl(n):
   error=lldb.SBError();v=frame.FindRegister(n).GetData().GetFloat(error,0)
   if error.Fail():raise RuntimeError(str(error))
   return v
  pc=frame.GetPCAddress().GetFileAddress()
  if pc==0x10041e7a0:
   note=fl('s8')
   if note!=NOTE:return False
   interface=reg('x19');table=scalar(frame,interface,'Q')
   row={'stage':'getter','note':note,'duration':fl('s0'),'interface':hex(interface),'getterB':hex(scalar(frame,table,'Q')),'getterA':hex(scalar(frame,table+8,'Q'))}
  elif pc==0x1001c5b6c:
   g=reg('x19');note=scalar(frame,g+0x14)
   if note!=NOTE:return False
   r=scalar(frame,g+0x1240,'Q');row={'stage':'floor','note':note,'G':hex(g),'duration':fl('s0'),'minimumFrequencyControl':scalar(frame,g+0x78),'specialInstrument':scalar(frame,r+0x4c0,'B')}
  elif pc==0x10071869c:
   g=reg('x25');note=scalar(frame,g+0x14)
   if note!=NOTE:return False
   r=scalar(frame,g+0x1240,'Q');h=reg('x28');row={'stage':'voice','note':note,'G':hex(g),'H':hex(h),'duration':fl('s0'),'sourceDuration':scalar(frame,g+0xfac),'minimumFrequencyControl':scalar(frame,g+0x78),'specialInstrument':scalar(frame,r+0x4c0,'B'),'randomConfig':{'enabled':scalar(frame,r+0x2e4,'I'),'mode':scalar(frame,r+0x2e8,'I'),'low':scalar(frame,r+0x2ec),'high':scalar(frame,r+0x2f0)},'randomStateAfter':list(unpack(frame,h+0x30d0,'IIII'))}
  else:
   v=reg('x19');g=reg('x23');note=scalar(frame,g+0x14)
   if note!=NOTE:return False
   row={'stage':'initialized','note':note,'G':hex(g),'H':hex(v-0x168),'duration':scalar(frame,v+0x914)}
  if len(records)>=64:raise RuntimeError('Duration observation bound exceeded')
  records.append(row);save();return False
 except Exception:
  errors.append(traceback.format_exc())
  for hook in base.hooks:hook.SetEnabled(False)
  save();return True

def __lldb_init_module(debugger,_):
 import lldb
 target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
 assert not (base.ROOT/'runtime.json').exists()
 for address in [0x10041e7a0,0x1001c5b6c,0x10071869c,0x10043e048]:
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
  if not result.Succeeded():raise RuntimeError(result.GetError())
  hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);error=hook.SetScriptCallbackFunction(__name__+'.observed')
  if error and error.Fail():raise RuntimeError(str(error))
  hook.SetAutoContinue(True);base.hooks.append(hook)
 save()
