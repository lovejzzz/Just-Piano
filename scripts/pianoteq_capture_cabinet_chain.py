"""Read-only same-run head/tail IR producers and full outer convolution wrapper."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_worker_bank512 import bank_config as tail_config
from pianoteq_capture_convolution_scheduler import bank_config as head_config
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'copy':0x1002a4334,'entry':0x1000ef37c,'queue':0x1000ef75c,'returned':0x1000eff54}
LIMIT=400
records,errors,hooks=[],[],[]
pending={};configs={};time_inputs={};frame_start=0;complete=False;started=False;blocks=0

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumWrapperBlocks':LIMIT,
 'wrapperBlocks':blocks,'wrapperLocalFrames':frame_start,'configs':configs,'records':records,'errors':errors},indent=2))

def configure(frame,state):
 c={}
 for name,offset,size,reader in [('head',0xb8,64,head_config),('tail',0xc0,512,tail_config)]:
  node=scalar(frame,state+offset,'Q');assert scalar(frame,node+0x38,'Q')==1 and scalar(frame,node+0x40,'I')==0
  bank=scalar(frame,node+8,'Q');assert scalar(frame,bank+8,'Q')==size and scalar(frame,bank+0x10,'Q')==9
  cfg=reader(frame,bank)
  for ring in cfg['kernels']:
   if ring:
    for slot in ring['slots']:
     if not slot['empty']:
      key=(size,slot['object']);assert key in time_inputs
      slot['timeInput']=time_inputs[key]+[0.0]*size
  c[name]={'node':hex(node),'bank':hex(bank),'configuration':cfg}
 return c

def observed(frame,location,_):
 global frame_start,complete,started,blocks
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='copy':
   if started:return False
   obj=register(frame,'x0');size=scalar(frame,obj+8,'Q')
   if size not in (64,512):return False
   span=register(frame,'x1');assert scalar(frame,span+8,'Q')==size
   time_inputs[(size,hex(obj))]=floats(frame,scalar(frame,span,'Q'),size)
  elif stage=='entry':
   state=register(frame,'x1')
   if scalar(frame,state,'I')!=0x3d396:return False
   source=matrix(frame,register(frame,'x2'));target=register(frame,'x3');before=matrix(frame,target)
   if source['rows']!=9 or before['rows']!=3:return False
   assert source['samples']==before['samples']==64 and scalar(frame,state+0x158,'Q')==512 and thread not in pending
   key=hex(state)
   if key not in configs:
    assert not configs and not started
    configs[key]=configure(frame,state);started=True;hooks[0].SetEnabled(False)
   pending[thread]={'state':state,'target':target,'queued':False}
   records.append({'stage':stage,'thread':thread,'state':key,'frameStart':frame_start,'source':source,'before':before,
    'mode':register(frame,'w4'),'gain':list(unpack(frame,state+0x30,'ffff'))})
  elif thread in pending:
   c=pending[thread];state=c['state']
   assert state==register(frame,'x27')
   if stage=='queue':
    assert not c['queued'];c['queued']=True
    out=scalar(frame,state+0x100,'Q');pos=scalar(frame,out,'I');assert 0<=pos<=448
    ptr=scalar(frame,out+0x18,'Q');stride=scalar(frame,out+0x14,'I')
    values=[floats(frame,ptr+4*(row*stride+pos),64) for row in range(3)]
    records.append({'stage':stage,'thread':thread,'state':hex(state),'frameStart':frame_start,
     'source':matrix(frame,register(frame,'x26')),'headOutput':matrix(frame,c['target']),
     'outputChunk':hex(out),'position':pos,'tail':values})
   else:
    assert c['queued']
    records.append({'stage':stage,'thread':thread,'state':hex(state),'frameStart':frame_start,'output':matrix(frame,c['target'])})
    pending.pop(thread);blocks+=1;frame_start+=64
    if blocks==LIMIT:
     complete=True
     for h in hooks:h.SetEnabled(False)
     save()
  return False
 except Exception:errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for address in POINTS.values():
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --thread-index 1 --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks.append(h)
 save()

def resume_known_stops(debugger):
    """Continue at most three unexpected hardware stops at our own fixed sites."""
    import lldb
    assert not debugger.GetAsync()
    observations=[]
    process=debugger.GetSelectedTarget().GetProcess()
    for attempt in range(3):
        if process.GetState()!=lldb.eStateStopped:break
        thread=process.GetSelectedThread();frame=thread.GetFrameAtIndex(0)
        pc=frame.GetPCAddress().GetFileAddress()
        description=thread.GetStopDescription(1024)
        if errors or pc not in POINTS.values() or thread.GetStopReason()!=lldb.eStopReasonException:break
        observations.append({'attempt':attempt,'pc':hex(pc),'reason':description,'recordsBeforeContinue':len(records)})
        (ROOT/'resumed-stops.json').write_text(json.dumps(observations,indent=2)+'\n')
        error=process.Continue()
        if error.Fail():raise RuntimeError(str(error))
    save()
