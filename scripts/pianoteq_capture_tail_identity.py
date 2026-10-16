"""Read-only 512-frame worker output identity and main consumption."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'main':0x1000ef75c,'worker':0x1007ccca0,'returned':0x1007cd0e4,'pcm':0x1001bc114}
LIMIT=12288
records,errors,hooks=[],[],[]
pending={};tail_nodes=set();global_frame=0;global_model=None;complete=False;entered=0;returned=0

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumFrames':LIMIT,'minimumWorkerJobs':24,
   'capturedFrames':global_frame,'workerEntries':entered,'workerReturns':returned,'records':records,'errors':errors},indent=2))

def observed(frame,location,_):
 global global_frame,global_model,complete,entered,returned
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage in ('main','pcm'):assert frame.GetThread().GetIndexID()==1
  if stage=='pcm':
   m=hex(register(frame,'x19'));assert global_model in (None,m);global_model=m
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'M':m,'matrix':out});global_frame+=64
   if global_frame>=LIMIT and returned>=24 and not pending:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save()
  elif stage=='main':
   state=register(frame,'x27')
   if scalar(frame,state,'I')!=0x3d396:return False
   source=matrix(frame,register(frame,'x26'))
   if source['rows']!=9:return False
   assert source['samples']==64 and scalar(frame,state+0x158,'Q')==512
   tail=scalar(frame,state+0xc0,'Q');assert tail>4096;tail_nodes.add(tail)
   out=scalar(frame,state+0x100,'Q');assert out
   pos=scalar(frame,out,'I');assert 0<=pos<=448
   ptr=scalar(frame,out+0x18,'Q');stride=scalar(frame,out+0x14,'I')
   values=[floats(frame,ptr+4*(row*stride+pos),64) for row in range(3)]
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'state':hex(state),'tailNode':hex(tail),
     'source':source,'outputChunk':hex(out),'position':pos,'values':values})
  elif stage=='worker':
   node=register(frame,'x0')
   if node not in tail_nodes:return False
   source=matrix(frame,register(frame,'x1'));target=register(frame,'x2');dest=matrix(frame,target)
   assert source['rows']==9 and source['samples']==512 and dest['rows']==3 and dest['samples']==512 and thread not in pending
   key=hex(node)
   pending[thread]={'ordinal':entered,'node':key,'target':target}
   records.append({'stage':stage,'thread':thread,'ordinal':entered,'node':key,'mainFrameAtEntry':global_frame,'mode':register(frame,'w3'),
     'time':scalar(frame,node+0x40,'I'),'source':source,'targetMatrix':hex(target),'targetChunk':hex(target-8),'sourceMatrix':hex(register(frame,'x1'))});entered+=1
  elif stage=='returned':
   c=pending.pop(thread,None)
   if c:
    records.append({'stage':stage,'thread':thread,'ordinal':c['ordinal'],'node':c['node'],'mainFrameAtReturn':global_frame,
       'time':scalar(frame,int(c['node'],16)+0x40,'I'),'output':matrix(frame,c['target'])});returned+=1
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  thread_option=' --thread-index 1' if name in ('main','pcm') else ''
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
