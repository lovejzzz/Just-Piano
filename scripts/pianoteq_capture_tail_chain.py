"""Read-only same-run source queue, calculated-bank targets and tail consumers."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_worker_bank512 import bank_config
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'copy':0x1002a4334,'worker':0x1007ccca0,'main':0x1000ef75c,'pcm':0x1001bc114}
LIMIT=25600
records,errors,hooks=[],[],[]
pending={};plans={};time_inputs={};global_frame=0;complete=False;entered=0;completed=0;worker_started=False

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'completionObservation':'nextWorkerEntry','windowComplete':complete,
 'minimumFrames':LIMIT,'minimumWorkerJobs':48,'capturedFrames':global_frame,'workerEntries':entered,
 'workerResultsObserved':completed,'plans':plans,'records':records,'errors':errors},indent=2))

def observed(frame,location,_):
 global global_frame,complete,entered,completed,worker_started
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage in ('copy','main','pcm'):assert frame.GetThread().GetIndexID()==1
  if stage=='pcm':
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'matrix':out});global_frame+=64
   if global_frame>=LIMIT and completed==48 and not pending:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save()
  elif stage=='copy':
   if worker_started:return False
   obj=register(frame,'x0')
   if scalar(frame,obj+8,'Q')!=512:return False
   span=register(frame,'x1');assert scalar(frame,span+8,'Q')==512
   time_inputs[hex(obj)]=floats(frame,scalar(frame,span,'Q'),512)
  elif stage=='main':
   state=register(frame,'x27')
   if scalar(frame,state,'I')!=0x3d396:return False
   source=matrix(frame,register(frame,'x26'))
   if source['rows']!=9:return False
   assert source['samples']==64 and scalar(frame,state+0x158,'Q')==512
   out=scalar(frame,state+0x100,'Q');assert out
   pos=scalar(frame,out,'I');assert 0<=pos<=448
   ptr=scalar(frame,out+0x18,'Q');stride=scalar(frame,out+0x14,'I')
   values=[floats(frame,ptr+4*(row*stride+pos),64) for row in range(3)]
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'state':hex(state),
    'tailNode':hex(scalar(frame,state+0xc0,'Q')),'source':source,'outputChunk':hex(out),'position':pos,'values':values})
  else:
   if frame.GetThread().GetIndexID()==1:return False
   node=register(frame,'x0');bank=scalar(frame,node+8,'Q')
   if scalar(frame,bank+8,'Q')!=512 or scalar(frame,bank+0x10,'Q')!=9:return False
   assert scalar(frame,node+0x38,'Q')==1
   key=hex(node);old=pending.pop(thread,None)
   if old:
    assert old['node']==key
    records.append({'stage':'completed','thread':thread,'ordinal':old['ordinal'],'node':key,'observedAtFrame':global_frame,
     'time':scalar(frame,node+0x40,'I'),'output':matrix(frame,old['target'])});completed+=1
   if completed==48:
    assert entered==48 and not pending
    hooks[1].SetEnabled(False);return False
   source=matrix(frame,register(frame,'x1'));target=register(frame,'x2');dest=matrix(frame,target)
   assert source['rows']==9 and source['samples']==512 and dest['rows']==3 and dest['samples']==512
   if key not in plans:
    assert not plans and scalar(frame,node+0x40,'I')==0
    plans[key]=bank_config(frame,bank)
    for ring in plans[key]['kernels']:
     if ring:
      for slot in ring['slots']:
       if not slot['empty']:
        assert slot['object'] in time_inputs
        slot['timeInput']=time_inputs[slot['object']]+[0.0]*512
    worker_started=True;hooks[0].SetEnabled(False)
   pending[thread]={'ordinal':entered,'node':key,'target':target}
   records.append({'stage':'worker','thread':thread,'ordinal':entered,'node':key,'mainFrameAtEntry':global_frame,
    'time':scalar(frame,node+0x40,'I'),'source':source,'mode':register(frame,'w3'),'targetMatrix':hex(target),'targetChunk':hex(target-8)})
   entered+=1
  return False
 except Exception:errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  thread_option=' --thread-index 1' if name in ('copy','main','pcm') else ''
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware{thread_option} --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
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
