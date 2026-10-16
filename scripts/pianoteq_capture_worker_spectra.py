"""Read-only complete worker inputs and retained 1024-point input spectra."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_convolution_scheduler import pointers
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'main':0x1000ef37c,'worker':0x1007ccca0,'returned':0x1007cd0e4,'pcm':0x1001bc114}
LIMIT=8192
records,errors,hooks=[],[],[]
pending={};tail_nodes=set();plans={};global_frame=0;global_model=None;complete=False;entered=0;returned=0;transforms=0

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumFrames':LIMIT,'minimumWorkerJobs':16,
   'capturedFrames':global_frame,'workerEntries':entered,'workerReturns':returned,'minimumTransforms':128,'transforms':transforms,'plans':plans,'records':records,'errors':errors},indent=2))

def bank_plan(frame,node):
 count=scalar(frame,node+0x38,'Q');assert 1<=count<=6
 banks=[scalar(frame,node+8+i*8,'Q') for i in range(count)];meta=[]
 for bank in banks:meta.append({'object':hex(bank),'blockSize':scalar(frame,bank+8,'Q'),'inputCount':scalar(frame,bank+0x10,'Q'),'stepCount':scalar(frame,bank,'I')})
 first=banks[0];assert meta[0]['blockSize']==512
 ring=next(p for p in pointers(frame,first+0x30,16) if p)
 obj=pointers(frame,ring,256)[0];holder=scalar(frame,obj+0x20,'Q');plan=scalar(frame,holder,'Q')
 n=scalar(frame,plan,'I');assert n==1024
 rings=[]
 for p in pointers(frame,first+0x30,16):
  assert p
  slots=pointers(frame,p,256);cursor=scalar(frame,p+0x18,'Q')
  rings.append({'object':hex(p),'slots':[hex(x) for x in slots],'initialCursor':cursor})
 return {'inputRings':rings,'banks':meta,'planWords':list(unpack(frame,plan,'I'*28)),
   'e':floats(frame,scalar(frame,plan+0x78,'Q'),3*n//4),'twiddleBits':list(unpack(frame,scalar(frame,plan+0x80,'Q'),'I'*256))}

def observed(frame,location,_):
 global global_frame,global_model,complete,entered,returned,transforms
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage in ('main','pcm'):assert frame.GetThread().GetIndexID()==1
  if stage=='pcm':
   m=hex(register(frame,'x19'));assert global_model in (None,m);global_model=m
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'M':m,'matrix':out});global_frame+=64
   if global_frame>=LIMIT and returned>=16 and transforms>=128 and not pending:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save()
  elif stage=='main':
   state=register(frame,'x1')
   if scalar(frame,state,'I')!=0x3d396:return False
   source=matrix(frame,register(frame,'x2'))
   if source['rows']!=9:return False
   assert source['samples']==64 and scalar(frame,state+0x158,'Q')==512
   tail=scalar(frame,state+0xc0,'Q');assert tail>4096;tail_nodes.add(tail)
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'state':hex(state),'tailNode':hex(tail),
     'gain':list(unpack(frame,state+0x30,'ffff')),'source':source})
  elif stage=='worker':
   node=register(frame,'x0')
   if node not in tail_nodes:return False
   source=matrix(frame,register(frame,'x1'));target=register(frame,'x2');dest=matrix(frame,target)
   assert source['rows']==9 and source['samples']==512 and dest['rows']==3 and dest['samples']==512 and thread not in pending
   key=hex(node)
   if key not in plans:plans[key]=bank_plan(frame,node)
   pending[thread]={'ordinal':entered,'node':key,'target':target}
   records.append({'stage':stage,'thread':thread,'ordinal':entered,'node':key,'mainFrameAtEntry':global_frame,'mode':register(frame,'w3'),
     'time':scalar(frame,node+0x40,'I'),'source':source});entered+=1
  elif stage=='returned':
   c=pending.pop(thread,None)
   if c:
    spectra=[]
    for ring in plans[c['node']]['inputRings']:
     count=len(ring['slots']);index=(ring['initialCursor']+c['ordinal'])%count
     obj=int(ring['slots'][index],16);p=int(ring['object'],16);empty=scalar(frame,obj+0x14,'B')
     assert scalar(frame,obj+8,'Q')==512 and scalar(frame,obj+0x30,'Q')==1024
     spectrum={'object':hex(obj),'index':index,'cursor':scalar(frame,p+0x18,'Q'),'empty':empty,
       'timestamp':scalar(frame,obj+0x10,'I'),'content':scalar(frame,obj+0x18,'I')}
     if not empty:spectrum['values']=floats(frame,scalar(frame,obj+0x28,'Q'),1024);transforms+=1
     spectra.append(spectrum)
    records.append({'stage':stage,'thread':thread,'ordinal':c['ordinal'],'node':c['node'],'mainFrameAtReturn':global_frame,
       'time':scalar(frame,int(c['node'],16)+0x40,'I'),'spectra':spectra});returned+=1
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
