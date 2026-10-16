"""Read-only inverse/overlap at the 512-frame bank's virtual-call boundary."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_convolution_scheduler import pointers
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'entry':0x10022aaac,'after':0x1007ccd48,'pcm':0x1001bc114}
records,errors,hooks=[],[],[]
pending={};plans={};global_frame=0;complete=False;inverses=0;calls=0;returns=0

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumInverses':128,
 'capturedFrames':global_frame,'inverses':inverses,'calls':calls,'returns':returns,'plans':plans,'records':records,'errors':errors},indent=2))

def observed(frame,location,_):
 global global_frame,complete,inverses,calls,returns
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='pcm':
   assert frame.GetThread().GetIndexID()==1
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'matrix':out});global_frame+=64
   if inverses>=128 and not pending:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save()
  elif stage=='entry':
   if frame.GetThread().GetIndexID()==1:return False
   bank=register(frame,'x19')
   if scalar(frame,bank+8,'Q')!=512 or scalar(frame,bank+0x10,'Q')!=9:return False
   holder=register(frame,'x20');obj=register(frame,'x0');key_obj=hex(obj)
   assert scalar(frame,holder,'Q')==obj and scalar(frame,obj+8,'Q')==512 and scalar(frame,bank,'I')==1
   old=pending.pop(key_obj,None)
   if old:
    assert old['inverse'] is not None or old['empty']
    r={'stage':'returned','thread':thread,'ordinal':old['ordinal'],'object':key_obj,
     'output':floats(frame,old['dst'],512),'tail':floats(frame,old['tail'],512),'content':scalar(frame,obj+0x18,'I')}
    if not old['empty']:r['inverse']=old['inverse'];inverses+=1
    records.append(r);returns+=1
   if calls>=144:
    if returns==calls and inverses>=128:
     for h in hooks[:2]:h.SetEnabled(False)
    return False
   channel=scalar(frame,register(frame,'x24')+4,'I');assert channel==calls%3
   output=holder+8;history=holder+0x30
   assert scalar(frame,output+8,'Q')==scalar(frame,history+8,'Q')==512
   dst=scalar(frame,output,'Q');tail=scalar(frame,history,'Q');buf=scalar(frame,obj+0x28,'Q')
   assert scalar(frame,obj+0x30,'Q')==1024
   plan=scalar(frame,scalar(frame,obj+0x20,'Q'),'Q');key=hex(plan)
   if key not in plans:
    assert scalar(frame,plan,'I')==1024
    plans[key]={'words':list(unpack(frame,plan,'I'*28)),'e':floats(frame,scalar(frame,plan+0x78,'Q'),768),
     'twiddleBits':list(unpack(frame,scalar(frame,plan+0x80,'Q'),'I'*256))}
   empty=scalar(frame,obj+0x14,'B');assert empty in (0,1)
   ring=pointers(frame,bank+0x30,16)[0];slots=pointers(frame,ring,256);cursor=scalar(frame,ring+0x18,'Q')
   stamp=scalar(frame,slots[(cursor-1)%len(slots)]+0x10,'I')
   pending[key_obj]={'ordinal':calls,'object':key_obj,'dst':dst,'tail':tail,'buf':buf,'empty':empty,'inverse':None}
   r={'stage':'entry','thread':thread,'ordinal':calls,'object':key_obj,'plan':key,'channel':channel,'bank':hex(bank),
    'time':stamp,'mainFrame':global_frame,'virtualTarget':hex(register(frame,'x8')),'empty':empty,'content':scalar(frame,obj+0x18,'I'),
    'oldTail':floats(frame,tail,512),'before':floats(frame,dst,512)}
   if not empty:r['input']=floats(frame,buf,1024)
   records.append(r);calls+=1
  else:
   if frame.GetThread().GetIndexID()==1:return False
   node=register(frame,'x19');bank=scalar(frame,node+8,'Q')
   if scalar(frame,bank+8,'Q')!=512 or scalar(frame,bank+0x10,'Q')!=9:return False
   for holder in pointers(frame,bank+0x48,16):
    obj=scalar(frame,holder,'Q');c=pending.get(hex(obj))
    if c and not c['empty']:
     assert c['inverse'] is None and scalar(frame,obj+0x18,'I')==2
     c['inverse']=floats(frame,c['buf'],1024)
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  thread_option=' --thread-index 1' if name=='pcm' else ''
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
