"""Observe extra position weights at entry/return using two hardware sites."""
import json,traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar,unpack
records=[]
pending={}
errors=[]
original_save=base.save

def save():
 original_save();p=base.ROOT/'runtime.json';d=json.loads(p.read_text());d.update(positionRecords=records,positionPending=len(pending),positionErrors=errors);p.write_text(json.dumps(d,indent=2,allow_nan=False))
base.save=save

def observed(frame,bp,_):
 try:
  entry=frame.GetPC()==0x100288f38;v=frame.FindRegister('x0' if entry else 'x19').GetValueAsUnsigned();key=(frame.GetThread().GetThreadID(),v)
  if entry:
   if len(records)>=8 or scalar(frame,v+0x8d4)>=.125:return False
   assert key not in pending
   o=scalar(frame,v,'Q');groups=scalar(frame,o+0xa8,'Q');assert 0<groups<=8
   layout=[list(unpack(frame,o+0xb0+16*i,'IIII')) for i in range(groups)];n=max(r[1] for r in layout);assert 0<n<=8192
   c=v+0x9a8;count=scalar(frame,c+0x30,'Q');assert count<=8192
   r={'V':v,'layout':layout,'position':scalar(frame,v+0x8d4),'referenceFrequency':scalar(frame,v+0x918),'rolloff':scalar(frame,v+0x908),'cutoffIndex':scalar(frame,v+0x928,'I'),'frequency':list(unpack(frame,scalar(frame,v+0x20,'Q'),'f'*n)),'indexStorage':list(unpack(frame,scalar(frame,v+0xc0,'Q'),'f'*n)),'extraCurve':{'x':list(unpack(frame,scalar(frame,c+0x20,'Q'),'f'*count)) if count else [],'y':list(unpack(frame,scalar(frame,c+0x28,'Q'),'f'*max(1,count)))}}
   records.append(r);pending[key]=(len(records)-1,n)
  elif key in pending:
   index,n=pending.pop(key);records[index]['actual']=list(unpack(frame,scalar(frame,v+0x788,'Q'),'f'*n))
   if len(records)>=8:
    for hook in base.hooks:hook.SetEnabled(False)
  save();return False
 except Exception:
  errors.append(traceback.format_exc())
  for hook in base.hooks:hook.SetEnabled(False)
  save();return True

def __lldb_init_module(debugger,_):
 import lldb
 target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();base.verify_text(base.Path(spec.GetDirectory())/spec.GetFilename())
 assert not (base.ROOT/'runtime.json').exists()
 for address in [0x100288f38,0x1002890f4]:
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
  if not result.Succeeded():raise RuntimeError(result.GetError())
  hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);error=hook.SetScriptCallbackFunction(__name__+'.observed')
  if error and error.Fail():raise RuntimeError(str(error))
  hook.SetAutoContinue(True);base.hooks.append(hook)
 save()
