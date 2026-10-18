"""Observe preset position validation with three read-only hardware sites."""
import json,traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar
records=[]
errors=[]
original_save=base.save

def save():
 original_save()
 p=base.ROOT/'runtime.json';d=json.loads(p.read_text());d.update(positionLoaderRecords=records,positionLoaderErrors=errors);p.write_text(json.dumps(d,indent=2,allow_nan=False))
base.save=save

def observed(frame,bp,_):
 try:
  pass
  a=frame.FindRegister('x20').GetValueAsUnsigned();flags=frame.FindRegister('x25').GetValueAsUnsigned()
  record={'point':hex(frame.GetPC()),'presetAddress':a,'position':scalar(frame,a+0x1110),'flags':scalar(frame,flags,'I')}
  if frame.GetPC()==0x1005616ac and record['position'] not in [0.0,0.20408163964748383]:return False
  if len(records)>=32:raise RuntimeError('Position validation capture bound exceeded')
  if any(all(row[key]==record[key] for key in ['point','position','flags']) for row in records):return False
  records.append(record)
  save();return False
 except Exception:
  errors.append(traceback.format_exc())
  for hook in base.hooks:hook.SetEnabled(False)
  save();return True

def __lldb_init_module(debugger,_):
 import lldb
 target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
 assert not (base.ROOT/'runtime.json').exists(),'Fresh capture required'
 for address in [0x1005616ac,0x100561744,0x1005617a8]:
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
  if not result.Succeeded():raise RuntimeError(result.GetError())
  hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);error=hook.SetScriptCallbackFunction(__name__+'.observed')
  if error and error.Fail():raise RuntimeError(str(error))
  hook.SetAutoContinue(True);base.hooks.append(hook)
 save()
