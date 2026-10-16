"""Read-only packed spectral multiply/accumulate, including native lazy clears."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'clear':0x1007ff7bc,'multiply':0x1007ff7f4,'returned':0x1007ff7f8}
LIMIT=512
records,errors,hooks=[],[],[]
pending={};ordinal=-1;complete=False


def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'ordinalLimit':LIMIT,'records':records,'errors':errors},indent=2))


def object_state(frame,p,values=True):
 n=scalar(frame,p+0x30,'Q');assert n==128
 return {'root':hex(p),'bins':scalar(frame,p+8,'Q'),'content':scalar(frame,p+0x18,'I'),
         'empty':scalar(frame,p+0x14,'B'),'data':floats(frame,scalar(frame,p+0x28,'Q'),n) if values else None}


def observed(frame,location,_):
 global ordinal,complete
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress())
  thread=frame.GetThread().GetThreadID()
  if stage=='clear':
   bank=register(frame,'x19')
   if scalar(frame,bank+8,'Q')!=64 or scalar(frame,bank+0x10,'Q')!=9:return False
   ordinal+=1
   if ordinal>=LIMIT:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save();return False
   p=register(frame,'x22');pending[thread]={'ordinal':ordinal,'destination':p,'bank':bank}
   records.append({'stage':stage,'ordinal':ordinal,'destination':object_state(frame,p),
                   'task':list(unpack(frame,register(frame,'x24'),'III'))})
  else:
   c=pending.get(thread)
   if c is None:return False
   r={'stage':stage,'ordinal':c['ordinal'],'destination':object_state(frame,c['destination'])}
   if stage=='multiply':
    holder=scalar(frame,c['destination']+0x20,'Q');plan=scalar(frame,holder,'Q')
    r['plan']={'vectorCount':scalar(frame,plan+4,'I'),'complexTransform':scalar(frame,plan+0x6c,'I')}
    assert register(frame,'x0')==c['destination']
    r.update(a=object_state(frame,register(frame,'x1')),b=object_state(frame,register(frame,'x2')),
             scale=regfloat(frame,'s0','f'),function=hex(frame.GetThread().GetProcess().GetTarget().ResolveLoadAddress(register(frame,'x8')).GetFileAddress()))
   else:pending.pop(thread)
   records.append(r)
   if stage=='returned' and c['ordinal']%32==31:save()
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
