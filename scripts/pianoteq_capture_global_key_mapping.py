"""Read-only key/control map inputs through full global mode and modal state."""
import json,os,traceback,hashlib
from pathlib import Path
import pianoteq_capture_global_recurrence as modal
import pianoteq_capture_global_control_producer as control
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'initial':0x1006c2ac4,'key':0x10083a7c0,'control':0x10073f328,'body':0x100804a14,'bodyResult':0x1006c2bf8}
LIMIT=128
records,errors,transitions=[],[],[]
hooks={};owner=None;initial=None;initial_keys=None;curves={};blocks=0;complete=False;pending=[];body_pending=None

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumBlocks':LIMIT,'blocks':blocks,
  'configs':modal.configs,'initial':initial,'initialKeys':initial_keys,'curves':curves,'records':records,'transitions':transitions,'errors':errors},indent=2,allow_nan=False))

def keys(frame,full=False):
 begin=scalar(frame,owner+0x10,'Q');end=scalar(frame,owner+0x18,'Q');assert (end-begin)%128==0
 n=(end-begin)//128;assert 0<n<=128
 rows=[]
 for i in range(n):
  p=begin+i*128;r={'raw':scalar(frame,p+0x20),'value':scalar(frame,p+0x24),'flag':scalar(frame,p+0x28,'B')}
  if full:
   b=scalar(frame,p+8,'Q');e=scalar(frame,p+16,'Q');assert (e-b)%4==0 and 0<=(e-b)//4<=8192
   count=(e-b)//4;indices=[]
   for offset in range(0,count,4096):indices.extend(unpack(frame,b+4*offset,'I'*min(4096,count-offset)))
   r['modes']=indices
  rows.append(r)
 return rows

def curve(frame,p):
 n=scalar(frame,p+0x30,'Q');assert n<=8192
 c={'dimension':1,'log_x':0,'special_mode':0,
  'x':floats(frame,scalar(frame,p+0x20,'Q'),n) if n else [],
  'y':floats(frame,scalar(frame,p+0x28,'Q'),max(1,n))}
 digest=hashlib.sha256(json.dumps(c,separators=(',',':'),allow_nan=False).encode()).hexdigest()
 if digest not in curves:curves[digest]=c
 return digest

def observed(frame,location,_):
 global owner,initial,initial_keys,blocks,complete,body_pending
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='initial':
   assert initial is None and blocks==0
   root=register(frame,'x0');obj=scalar(frame,root+0x58,'Q');d=modal.dispatch(frame,obj,True)
   owner=int(d['state'],16);initial=control.snapshot(frame,owner,True);initial_keys=keys(frame,True)
   initial['rawGlobalControl']=scalar(frame,owner+0x170)
   hooks['initial'].SetEnabled(False)
   for name in ('key','control'):hooks[name].SetEnabled(True)
   transitions.append({'ordinal':0,'disable':'initial','enable':['key','control'],'activeSites':sum(h.IsEnabled() for h in hooks.values())});assert transitions[-1]['activeSites']==4
  elif stage in ('key','control'):
   assert owner is not None
   obj=register(frame,'x0')
   if scalar(frame,obj+0x1b0,'Q')!=owner:return False
   assert body_pending is None
   r={'stage':stage,'ordinal':blocks,'thread':thread}
   if stage=='key':
    source=register(frame,'x1');n=scalar(frame,source+8,'Q');assert n==len(initial_keys)
    r.update({'curve':curve(frame,register(frame,'x2')),'rawInputs':floats(frame,scalar(frame,source,'Q'),n),
     'flags':list(unpack(frame,scalar(frame,source+0x28,'Q'),'B'*n)),'before':keys(frame)})
   else:
    r.update({'curve':curve(frame,register(frame,'x1')),'rawGlobalControl':regfloat(frame,'s0','f'),
     'before':control.snapshot(frame,owner),'keys':keys(frame)})
   pending.append(r)
  elif stage=='body':
   assert initial is not None and body_pending is None
   obj=register(frame,'x0');d=modal.dispatch(frame,obj,True);assert int(d['state'],16)==owner
   for event in pending:assert event['ordinal']==blocks and event['thread']==thread
   records.extend(pending);pending.clear()
   body_pending={'thread':thread,'output':register(frame,'x4'),'kernels':[int(k['object'],16) for k in d['kernels']]}
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'dispatch':d,'producerAfter':control.snapshot(frame,owner),
    'keys':keys(frame),'rawGlobalControl':scalar(frame,owner+0x170),
    'inputs':[matrix(frame,register(frame,r)) for r in ('x1','x2','x3')],'outputBefore':matrix(frame,register(frame,'x4'))})
  else:
   assert body_pending is not None and body_pending['thread']==thread
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'output':matrix(frame,body_pending['output']),
    'kernels':[modal.kernel_state(frame,p) for p in body_pending['kernels']]})
   body_pending=None;blocks+=1
   if blocks==LIMIT:
    complete=True
    for h in hooks.values():h.SetEnabled(False)
    save()
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --thread-index 1 --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks[name]=h
  if name in ('key','control'):h.SetEnabled(False)
 save()

def resume_known_stops(debugger):
 import lldb
 assert not debugger.GetAsync()
 process=debugger.GetSelectedTarget().GetProcess();observations=[]
 for attempt in range(3):
  if process.GetState()!=lldb.eStateStopped:break
  thread=process.GetSelectedThread();frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress()
  if errors or pc not in POINTS.values() or thread.GetStopReason()!=lldb.eStopReasonException:break
  observations.append({'attempt':attempt,'pc':hex(pc),'records':len(records)})
  (ROOT/'resumed-stops.json').write_text(json.dumps(observations,indent=2)+'\n')
  error=process.Continue()
  if error.Fail():raise RuntimeError(str(error))
 save()
