"""Read-only fixed-site coefficient writes, bound to continuous global recurrence."""
import json,os,traceback
from pathlib import Path
import pianoteq_capture_global_recurrence as base
from pianoteq_damper_runtime_capture import scalar,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'global':0x1006c2ac4,'store':0x100798084,'body':0x100804a14,'bodyResult':0x1006c2bf8}
LIMIT=128
records,writes,errors,transitions=[],[],[],[]
hooks={};pending={};owners=set();blocks=0;complete=False;stacks={};producer_owner=None

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumBlocks':LIMIT,'blocks':blocks,
  'configs':base.configs,'records':records,'writes':writes,'stacks':stacks,'transitions':transitions,'errors':errors},indent=2,allow_nan=False))

def producer(frame):
 state=register(frame,'x19');index=register(frame,'x21');offset=register(frame,'x24')
 assert offset==28+index*80 and hex(state)==producer_owner
 begin=scalar(frame,state+0x40,'Q');end=scalar(frame,state+0x48,'Q');assert begin+index*80<end
 record=begin+index*80
 return {'object':hex(state),'mode':index,'record':hex(record),'timeScale':scalar(frame,state+0x38),
  'fields':{hex(o):scalar(frame,record+o) for o in (4,8,12,16,20,24,28,32,36,40,44)},
  'kernelIndex':scalar(frame,record+0x30,'I'),'kernelMode':scalar(frame,record+0x34,'I')}

def observed(frame,location,_):
 global blocks,complete,producer_owner
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='store':
   obj=register(frame,'x0')
   if obj not in owners:return False
   index=register(frame,'w1');count=scalar(frame,obj+0x14,'I');assert index<count
   ptr=scalar(frame,obj+0x20,'Q');offset=(index//4)*16+index%4
   lr=hex(register(frame,'lr'))
   if lr not in stacks:
    stacks[lr]=[hex(frame.GetThread().GetFrameAtIndex(i).GetPCAddress().GetFileAddress()) for i in range(min(12,frame.GetThread().GetNumFrames()))]
   writes.append({'ordinal':blocks,'thread':thread,'object':hex(obj),'index':index,'caller':lr,
    'arguments':[regfloat(frame,'s'+str(i),'f') for i in range(4)],
    'producer':producer(frame),
    'before':[scalar(frame,ptr+4*(offset+4*c)) for c in range(4)]})
  elif stage=='global':
   assert thread not in pending
   root=register(frame,'x0');b=register(frame,'x2');obj=scalar(frame,root+0x58,'Q')
   d=base.dispatch(frame,obj,not owners)
   if not owners:
    owners.update(int(k['object'],16) for k in d['kernels']);assert len(owners)==3
    producer_owner=d['state']
    hooks['store'].SetEnabled(True)
    transitions.append({'ordinal':blocks,'enable':'store','activeSites':sum(h.IsEnabled() for h in hooks.values())});assert transitions[-1]['activeSites']==4
   pending[thread]={'R':root,'B':b,'body':False}
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'R':hex(root),'B':hex(b)})
  elif thread in pending:
   c=pending[thread]
   if stage=='body':
    assert not c['body'];c['body']=True
    obj=register(frame,'x0');assert obj==scalar(frame,c['R']+0x58,'Q') and register(frame,'x4')==c['B']+0x158
    d=base.dispatch(frame,obj,True);c['kernelObjects']=[int(k['object'],16) for k in d['kernels']]
    records.append({'stage':stage,'thread':thread,'ordinal':blocks,'dispatch':d,
     'inputs':[matrix(frame,register(frame,r)) for r in ('x1','x2','x3')],'outputBefore':matrix(frame,register(frame,'x4'))})
   else:
    assert c['body']
    records.append({'stage':stage,'thread':thread,'ordinal':blocks,'output':matrix(frame,c['B']+0x158),
     'kernels':[base.kernel_state(frame,p) for p in c['kernelObjects']]})
    pending.pop(thread);blocks+=1
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
  if name=='store':h.SetEnabled(False)
 save()

def resume_known_stops(debugger):
 import lldb
 assert not debugger.GetAsync()
 process=debugger.GetSelectedTarget().GetProcess();observations=[]
 for attempt in range(3):
  if process.GetState()!=lldb.eStateStopped:break
  thread=process.GetSelectedThread();frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress()
  if errors or pc not in POINTS.values() or thread.GetStopReason()!=lldb.eStopReasonException:break
  observations.append({'attempt':attempt,'pc':hex(pc),'records':len(records),'writes':len(writes)})
  (ROOT/'resumed-stops.json').write_text(json.dumps(observations,indent=2)+'\n')
  error=process.Continue()
  if error.Fail():raise RuntimeError(str(error))
 save()
