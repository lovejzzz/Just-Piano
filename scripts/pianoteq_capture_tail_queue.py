"""Read-only CABN queue consumption and final PCM timeline."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x1000ef37c,'queue':0x1000ef75c,'returned':0x1000eff54,'pcm':0x1001bc114}
LIMIT=8192
records,errors,hooks=[],[],[]
pending={};global_frame=0;global_model=None;complete=False

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'threadIndexFilter':1,'windowComplete':complete,
   'minimumFrames':LIMIT,'capturedFrames':global_frame,'records':records,'errors':errors},indent=2))

def chunk(frame,p,values=False):
 if not p:return None
 pos=scalar(frame,p,'I');rows,stride,samples,row_stride=unpack(frame,p+8,'IIII')
 assert rows in (3,9) and samples==512 and 0<=pos<=samples
 r={'object':hex(p),'position':pos,'rows':rows,'stride':stride,'samples':samples,'rowStride':row_stride,'next':hex(scalar(frame,p+0x40,'Q'))}
 if values:
  assert pos+64<=samples
  ptr=scalar(frame,p+0x18,'Q');r['values']=[floats(frame,ptr+4*(row*row_stride+pos),64) for row in range(rows)]
 return r

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
   state=register(frame,'x1')
   if scalar(frame,state,'I')!=0x3d396:return False
   source=matrix(frame,register(frame,'x2'));target=register(frame,'x3');dest=matrix(frame,target)
   if source['rows']!=9 or dest['rows']!=3:return False
   assert source['samples']==dest['samples']==64 and thread not in pending
   pending[thread]={'state':state,'target':target,'inputChunk':None}
   records.append({'stage':stage,'thread':thread,'state':hex(state),'frameStart':global_frame,'mode':register(frame,'w4'),
     'gain':list(unpack(frame,state+0x30,'ffff')),'source':source,'before':dest,'tailSize':scalar(frame,state+0x158,'Q')})
  elif thread in pending:
   c=pending[thread];state=c['state']
   if stage=='queue':
    inp=scalar(frame,state+0xf8,'Q');out=scalar(frame,state+0x100,'Q');assert inp and out
    a=chunk(frame,inp);b=chunk(frame,out,True);assert a['position']==b['position'] and a['rows']==9 and b['rows']==3
    c.update(inputChunk=inp,position=a['position'])
    records.append({'stage':stage,'thread':thread,'state':hex(state),'frameStart':global_frame,'headOutput':matrix(frame,c['target']),
       'inputChunk':a,'outputChunk':b,'recycleLimit':scalar(frame,state+0x110,'I')})
   else:
    assert c['inputChunk'] is not None
    copied=None
    if c['position']+64<512:
     inp=c['inputChunk'];ptr=scalar(frame,inp+0x18,'Q');row_stride=scalar(frame,inp+0x14,'I')
     copied=[floats(frame,ptr+4*(row*row_stride+c['position']),64) for row in range(9)]
    records.append({'stage':stage,'thread':thread,'state':hex(state),'frameStart':global_frame,'output':matrix(frame,c['target']),
       'inputAfter':chunk(frame,scalar(frame,state+0xf8,'Q')),'outputAfter':chunk(frame,scalar(frame,state+0x100,'Q')),
       'copiedInput':copied});pending.pop(thread)
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
