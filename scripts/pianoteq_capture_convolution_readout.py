"""Read-only outer convolution inputs, partition readout and calibrated PCM timeline."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_convolution_scheduler import bank_config,pointers
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1007ccca0,'read':0x100571fac,'returned':0x1007cd0e4,'pcm':0x1001bc114}
LIMIT=8192
records,errors,hooks=[],[],[]
configs={};pending={};global_frame=0;global_model=None;complete=False

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':3,'threadIndexFilter':1,'windowComplete':complete,'minimumFrames':LIMIT,
    'capturedFrames':global_frame,'configs':configs,'records':records,'errors':errors},indent=2))

def observed(frame,location,_):
 global global_frame,global_model,complete
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='pcm':
   m=hex(register(frame,'x19'));assert global_model in (None,m);global_model=m
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'M':m,'matrix':out});global_frame+=64
   if global_frame>=LIMIT and not pending:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save()
   return False
  if stage=='entry':
   node=register(frame,'x0');first=scalar(frame,node+8,'Q')
   if scalar(frame,first+8,'Q')!=64 or scalar(frame,first+0x10,'Q')!=9:return False
   source=matrix(frame,register(frame,'x1'));dest=register(frame,'x2');shape=matrix(frame,dest)
   assert source['rows']==9 and source['samples']==64 and shape['rows']==3 and shape['samples']==64
   count=scalar(frame,node+0x38,'Q');assert 1<=count<=6
   banks=[scalar(frame,node+8+8*i,'Q') for i in range(count)];key=hex(first)
   if key not in configs:configs[key]=bank_config(frame,first)
   assert thread not in pending
   pending[thread]={'node':node,'first':first,'banks':banks,'destination':dest,'reads':0,'bank':key}
   records.append({'stage':stage,'thread':thread,'bank':key,'frameStart':global_frame,'time':scalar(frame,node+0x40,'I'),
       'mode':register(frame,'w3'),'source':source,'banks':[{'object':hex(b),'blockSize':scalar(frame,b+8,'Q'),'stepCount':scalar(frame,b,'I')} for b in banks]})
  elif thread in pending:
   c=pending[thread]
   if stage=='read':
    if register(frame,'x0')!=c['first']:return False
    assert frame.GetThread().GetFrameAtIndex(1).GetPCAddress().GetFileAddress()==0x1007cce5c
    row=register(frame,'x1');assert row==c['reads'] and row<3;c['reads']+=1
    sources=[]
    for b in c['banks']:
     holders=pointers(frame,b+0x48,16);holder=holders[row] if row<len(holders) else 0
     if not holder:sources.append({'bank':hex(b),'missing':True});continue
     size=scalar(frame,b+8,'Q');offset=scalar(frame,holder+0x60,'Q');assert offset+64<=size
     sources.append({'bank':hex(b),'missing':False,'holder':hex(holder),'offset':offset,'blockSize':size,
       'step':scalar(frame,b+0xa0,'I'),'values':floats(frame,scalar(frame,holder+8,'Q')+4*offset,64)})
    view=register(frame,'x2');assert scalar(frame,view+8,'Q')==64
    mode=register(frame,'w3');assert mode in (0,1)
    records.append({'stage':stage,'thread':thread,'bank':c['bank'],'frameStart':global_frame,'row':row,'mode':mode,'sources':sources,
      'before':floats(frame,scalar(frame,view,'Q'),64) if mode else None})
   elif stage=='returned':
    assert c['reads']==3
    records.append({'stage':stage,'thread':thread,'bank':c['bank'],'frameStart':global_frame,
      'time':scalar(frame,c['node']+0x40,'I'),'output':matrix(frame,c['destination'])});pending.pop(thread)
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for address in POINTS.values():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --thread-index 1 --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded()
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
