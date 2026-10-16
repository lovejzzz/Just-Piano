"""Read-only kernel time producers and complete 512-frame worker-bank outputs."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_convolution_scheduler import pointers
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'copy':0x1002a4334,'worker':0x1007ccca0,'returned':0x1007cd0e4,'pcm':0x1001bc114}
LIMIT=24576
records,errors,hooks=[],[],[]
pending={};tail_nodes=set();plans={};time_inputs={};worker_started=False;global_frame=0;global_model=None;complete=False;entered=0;returned=0

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumFrames':LIMIT,'minimumWorkerJobs':48,
   'capturedFrames':global_frame,'workerEntries':entered,'workerReturns':returned,'plans':plans,'records':records,'errors':errors},indent=2))

def spectrum(frame,p,values=False):
 assert scalar(frame,p+8,'Q')==512 and scalar(frame,p+0x30,'Q')==1024
 ptr=scalar(frame,p+0x28,'Q');empty=scalar(frame,p+0x14,'B')
 r={'object':hex(p),'buffer':hex(ptr),'empty':empty,'content':scalar(frame,p+0x18,'I'),'timestamp':scalar(frame,p+0x10,'I')}
 if values and not empty:r['data']=floats(frame,ptr,1024)
 return r

def ring(frame,p,values=False):
 if not p:return None
 slots=pointers(frame,p,256);cursor=scalar(frame,p+0x18,'Q');assert slots and cursor<len(slots)
 return {'object':hex(p),'cursor':cursor,'ready':scalar(frame,p+0x20,'B'),'slots':[spectrum(frame,q,values) for q in slots]}

def bank_config(frame,p):
 kernels=pointers(frame,p+0x18,64);inputs=pointers(frame,p+0x30,16);outs=pointers(frame,p+0x48,16)
 rb,re=unpack(frame,p+0x60,'QQ');assert re>=rb and (re-rb)%32==0 and (re-rb)//32<=256
 routes=[list(unpack(frame,q,'QQQfI')) for q in range(rb,re,32)]
 sb,se=unpack(frame,p+0x88,'QQ');assert se>=sb and (se-sb)%24==0 and (se-sb)//24<=64
 plans=[]
 for q in range(sb,se,24):
  b,e=unpack(frame,q,'QQ');assert e>=b and (e-b)%12==0 and (e-b)//12<=4096
  plans.append([list(unpack(frame,a,'III')) for a in range(b,e,12)])
 output_objects=[]
 for q in outs:
  if not q:output_objects.append(None);continue
  obj=scalar(frame,q,'Q');tail=scalar(frame,q+0x30,'Q');assert scalar(frame,q+0x38,'Q')==512
  output_objects.append({'holder':hex(q),'fft':spectrum(frame,obj),'history':floats(frame,tail,512)})
 return {'stepCount':scalar(frame,p,'I'),'blockSize':scalar(frame,p+8,'Q'),'inputCount':scalar(frame,p+0x10,'Q'),
         'inputs':[ring(frame,q) for q in inputs],'kernels':[ring(frame,q,True) for q in kernels],
         'outputs':output_objects,'routes':routes,'plans':plans}

def observed(frame,location,_):
 global global_frame,global_model,complete,entered,returned,worker_started
 try:
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage in ('copy','pcm'):assert frame.GetThread().GetIndexID()==1
  if stage=='pcm':
   m=hex(register(frame,'x19'));assert global_model in (None,m);global_model=m
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'M':m,'matrix':out});global_frame+=64
   if global_frame>=LIMIT and returned>=48 and not pending:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save()
  elif stage=='copy':
   if worker_started:return False
   obj=register(frame,'x0')
   if scalar(frame,obj+8,'Q')!=512:return False
   span=register(frame,'x1');assert scalar(frame,span+8,'Q')==512
   time_inputs[hex(obj)]=floats(frame,scalar(frame,span,'Q'),512)
  elif stage=='worker':
   node=register(frame,'x0')
   if frame.GetThread().GetIndexID()==1:return False
   first=scalar(frame,node+8,'Q')
   if scalar(frame,first+8,'Q')!=512 or scalar(frame,first+0x10,'Q')!=9:return False
   assert scalar(frame,node+0x38,'Q')==1
   source=matrix(frame,register(frame,'x1'));target=register(frame,'x2');dest=matrix(frame,target)
   assert source['rows']==9 and source['samples']==512 and dest['rows']==3 and dest['samples']==512 and thread not in pending
   key=hex(node)
   if key not in plans:
    assert not plans and scalar(frame,node+0x40,'I')==0
    plans[key]=bank_config(frame,first)
    for ring in plans[key]['kernels']:
     if ring:
      for slot in ring['slots']:
       if not slot['empty']:
        assert slot['object'] in time_inputs
        slot['timeInput']=time_inputs[slot['object']]+[0.0]*512
    worker_started=True;hooks[0].SetEnabled(False)
   pending[thread]={'ordinal':entered,'node':key,'target':target}
   records.append({'stage':stage,'thread':thread,'ordinal':entered,'node':key,'mainFrameAtEntry':global_frame,'mode':register(frame,'w3'),
     'time':scalar(frame,node+0x40,'I'),'source':source});entered+=1
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
