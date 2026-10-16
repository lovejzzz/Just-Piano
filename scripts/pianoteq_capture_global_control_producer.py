"""Read-only 3ca148 mode controls and coefficient refresh, with modal output."""
import json,os,traceback,struct,hashlib
from pathlib import Path
import pianoteq_capture_global_recurrence as base
from pianoteq_damper_runtime_capture import scalar,memory,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'initial':0x1006c2ac4,'producer':0x1003ca148,'body':0x100804a14,'bodyResult':0x1006c2bf8}
LIMIT=128
records,errors,transitions=[],[],[]
hooks={};owner=None;initial=None;blocks=0;complete=False;producer_pending=None;body_pending=None;static_profile=None

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumBlocks':LIMIT,'blocks':blocks,
  'configs':base.configs,'initial':initial,'records':records,'transitions':transitions,'errors':errors},indent=2,allow_nan=False))

def snapshot(frame,state,full=False):
 global static_profile
 begin=scalar(frame,state+0x40,'Q');end=scalar(frame,state+0x48,'Q');assert (end-begin)%80==0
 n=(end-begin)//80;assert 0<n<=8192
 raw=b''.join(memory(frame,begin+i,min(16384,n*80-i)) for i in range(0,n*80,16384))
 constants=[];dynamic=[];identities=[]
 for i in range(n):
  o=i*80
  constants.append(list(struct.unpack_from('<7f',raw,o+4)))
  dynamic.append([*struct.unpack_from('<3f',raw,o+32),raw[o+44]])
  identities.append(list(struct.unpack_from('<2I',raw,o+48)))
 profile={'constants':constants,'identities':identities}
 digest=hashlib.sha256(json.dumps(profile,separators=(',',':'),allow_nan=False).encode()).hexdigest()
 if full:
  pairs=[]
  for i in range(n):
   b,e=struct.unpack_from('<QQ',raw,i*80+56);assert (e-b)%8==0 and 0<=(e-b)//8<=128
   pairs.append([list(struct.unpack('<If',memory(frame,b+j,8))) for j in range(0,e-b,8)])
  static_profile={**profile,'pairs':pairs,'identity':digest}
 else:assert static_profile is not None and digest==static_profile['identity'],'Mode static fields changed'
 bitsets=[]
 for off,flag in ((0x88,0xa0),(0xa8,0xc0)):
  ptr=scalar(frame,state+off,'Q');count=scalar(frame,state+off+8,'Q');assert count==n
  count_words=(count+63)//64
  bitsets.append({'pointer':hex(ptr),'count':count,'flag':scalar(frame,state+flag,'B'),
   'words':[hex(scalar(frame,ptr+8*j,'Q')) for j in range(count_words)]})
 key_indices=sorted({index for row in static_profile['pairs'] for index,weight in row});assert all(i<128 for i in key_indices)
 ptr=scalar(frame,state+0x10,'Q')
 keys={str(i):{'value':scalar(frame,ptr+i*128+0x24),'flag':scalar(frame,ptr+i*128+0x28,'B')} for i in key_indices}
 result={'object':hex(state),'modeCount':n,'weightedModeCount':scalar(frame,state+0x28,'Q'),
  'timeScale':scalar(frame,state+0x38),'globalControl':scalar(frame,state+0x174),'staticIdentity':digest,
  'dynamic':dynamic,'bitsets':bitsets,'keys':keys}
 if full:result['static']=static_profile
 return result

def observed(frame,location,_):
 global owner,initial,blocks,complete,producer_pending,body_pending
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='initial':
   assert initial is None and blocks==0
   root=register(frame,'x0');obj=scalar(frame,root+0x58,'Q');d=base.dispatch(frame,obj,True)
   owner=int(d['state'],16);initial=snapshot(frame,owner,True)
   hooks['initial'].SetEnabled(False);hooks['producer'].SetEnabled(True)
   transitions.append({'ordinal':0,'disable':'initial','enable':'producer','activeSites':sum(h.IsEnabled() for h in hooks.values())});assert transitions[-1]['activeSites']==3
  elif stage=='producer':
   if register(frame,'x0')!=owner:return False
   assert producer_pending is None and body_pending is None
   producer_pending={'stage':stage,'thread':thread,'ordinal':blocks,'snapshot':snapshot(frame,owner)}
  elif stage=='body':
   assert initial is not None and body_pending is None
   obj=register(frame,'x0');d=base.dispatch(frame,obj,True);assert int(d['state'],16)==owner
   ran=producer_pending is not None
   if ran:records.append(producer_pending)
   producer_pending=None
   body_pending={'thread':thread,'output':register(frame,'x4'),'kernels':[int(k['object'],16) for k in d['kernels']]}
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'dispatch':d,'producerRan':ran,'producerAfter':snapshot(frame,owner),
    'inputs':[matrix(frame,register(frame,r)) for r in ('x1','x2','x3')],'outputBefore':matrix(frame,register(frame,'x4'))})
  else:
   assert body_pending is not None and body_pending['thread']==thread
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'output':matrix(frame,body_pending['output']),
    'kernels':[base.kernel_state(frame,p) for p in body_pending['kernels']]})
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
  if name=='producer':h.SetEnabled(False)
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
