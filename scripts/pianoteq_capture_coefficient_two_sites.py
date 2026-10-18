"""Passive coefficient and raw producer capture, two fixed sites, one active phase."""
import json,traceback
import pianoteq_capture_soundboard_responses as base
import pianoteq_capture_drive_level_phases as level
import pianoteq_capture_global_coefficients_passive as coefficients
import pianoteq_capture_global_recurrence as modal
from pianoteq_damper_runtime_capture import scalar
records,errors=[],[]
scalar_before=None
def save():
 data={'schema':1,'runStatus':base.run_status,'errors':errors,'targetMutation':False,'hardwareBreakpoints':2,
       'activeHardwareBreakpoints':sum(h.IsEnabled() for h in base.hooks),'coefficients':coefficients.payload(base.run_status,errors),
       'raw':level.payload(base.run_status,errors),'configs':modal.configs,'records':records}
 target=base.ROOT/'runtime.json'; tmp=base.ROOT/'runtime.json.tmp';tmp.write_text(json.dumps(data,separators=(',',':'),allow_nan=False));tmp.replace(target)
def observed(frame,location,_):
 global scalar_before
 try:
  pc=frame.GetPCAddress().GetFileAddress()
  if pc!=location.GetAddress().GetFileAddress() or frame.GetThread().GetIndexID()!=1:raise ValueError('Exact owned main-thread site required')
  if pc==level.RAW_SITE:
   manager=frame.FindRegister('x0').GetValueAsUnsigned()
   if any(f.GetPCAddress().GetFileAddress()==0x1001bb70c for f in frame.GetThread()):scalar_before=coefficients.scalar_state(frame,scalar(frame,manager+0xe00,'Q'))
   coefficients.raw(frame,manager);level.begin(frame)
  elif pc==level.DRIVE_SITE:
   ordinal=len(records);level.body(frame,ordinal)
   callers=[f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress()==0x1006c2be0]
   if len(callers)!=1:raise ValueError('Actual global drive caller required')
   root=callers[0].FindRegister('x20').GetValueAsUnsigned();coefficients.body(frame,root,ordinal)
   dispatch=modal.dispatch(frame,scalar(frame,root+0x58,'Q'),True)
   records.append({'ordinal':ordinal,'scalarBefore':scalar_before,'coefficientSha256':[k['coefficientSha256'] for k in dispatch['kernels']]})
   if len(records)%64==0:save()
  else:raise ValueError('Unknown hardware site')
  return False
 except Exception:
  errors.append(traceback.format_exc())
  for h in base.hooks:h.SetEnabled(False)
  save();return True
def __lldb_init_module(debugger,_):
 import lldb
 target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
 if (base.ROOT/'runtime.json').exists():raise ValueError('Fresh capture required')
 for site in [level.RAW_SITE,level.DRIVE_SITE]:
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address '+hex(site)+' --shlib "Pianoteq 9"',result)
  if not result.Succeeded():raise RuntimeError(result.GetError())
  hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);hook.SetEnabled(site==level.RAW_SITE);hook.SetAutoContinue(True)
  err=hook.SetScriptCallbackFunction(__name__+'.observed')
  if err and err.Fail():raise RuntimeError(str(err))
  base.hooks.append(hook);level.hooks[site]=hook
 base.save=save;save()
