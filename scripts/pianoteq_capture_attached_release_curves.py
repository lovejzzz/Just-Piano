"""Read-only capture attached to an OWNED, already-running debug copy.

Requires normal audio output running and an official API parameter update that
rebuilds packed keys. Import only after attaching; this module does not launch,
write target memory, call target functions, or change application parameters.
Two fixed hardware sites alternate, at most one enabled. Stops at 105 rows.
"""
import json, traceback, os
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR']);rows=[];sources={};errors=[];hooks={};pending={}
POINTS={'before':0x100730884,'after':0x100730898}
def save():
 (ROOT/'attached-runtime.json').write_text(json.dumps({'schema':1,'rows':rows,'sources':sources,'errors':errors,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2))
def observed(frame,location,_):
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='before':
   caller=frame.GetThread().GetFrameAtIndex(1);pc=caller.GetPCAddress().GetFileAddress();assert pc==0x1003d2a70
   interface=register(caller,'x22');vt=scalar(frame,interface,'Q');getter=scalar(frame,vt,'Q');source_id=hex(interface)
   if source_id not in sources:
    import lldb
    addr=lldb.SBAddress();addr.SetLoadAddress(getter,frame.GetThread().GetProcess().GetTarget());words=list(unpack(frame,getter,'II'))
    item={'interface':source_id,'getter':hex(addr.GetFileAddress()),'getterWords':words,'caller':hex(pc)};sources[source_id]=item
    if words[0]&0xffc003ff==0xf9400000 and words[1]==0xd65f03c0:
     offset=((words[0]>>10)&0xfff)*8;base=scalar(frame,interface+offset,'Q');item.update(baseOffset=offset,baseObject=hex(base),curves={})
     for name,offset in [('baseTime',0x3c28),('maximumTime',0x3c78),('amplitudeScale',0x3cc8)]:
      c=base+offset;xb=scalar(frame,c+0x18,'Q');xe=scalar(frame,c+0x20,'Q');yb=scalar(frame,c+0x30,'Q');ye=scalar(frame,c+0x38,'Q')
      assert (xe-xb)%4==0 and (ye-yb)%4==0
      nx=(xe-xb)//4;ny=(ye-yb)//4;assert nx<=4096 and 0<ny<=4096
      item['curves'][name]={'object':hex(c),'dimension':scalar(frame,c+0x48,'I'),'log_x':scalar(frame,c+0x4c,'B'),'special_mode':scalar(frame,c+0x4d,'B'),'x':floats(frame,xb,nx) if nx else [],'y':floats(frame,yb,ny)}
   src=register(frame,'x25');dst=register(frame,'x27');row={'source':hex(src),'destination':hex(dst),'index':register(frame,'w9'),'storedIndex':scalar(frame,src+0x30,'I'),'releaseSource':source_id,'thread':thread,'packedOwner':hex(register(frame,'x21')),'sourceControls':dict(zip(['baseTime','maximumTime','amplitudeScale'],unpack(frame,src+0xc,'fff')))}
   rows.append(row);pending[thread]=row;hooks['before'].SetEnabled(False);hooks['after'].SetEnabled(True)
  else:
   row=pending.pop(thread);dst=int(row['destination'],16);row['targetControls']=dict(zip(['baseTime','maximumTime','amplitudeScale'],unpack(frame,dst+0x38,'fff')))
   hooks['after'].SetEnabled(False)
   if len(rows)<105:hooks['before'].SetEnabled(True)
   else:save()
  assert sum(h.IsEnabled() for h in hooks.values())<=1
  return False
 except Exception:
  errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'attached-runtime.json').exists()
 t=debugger.GetSelectedTarget();spec=t.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
  h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks[name]=h
  if name=='after':h.SetEnabled(False)
 save()
