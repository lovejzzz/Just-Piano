"""Read-only convolution observations anchored to final stereo PCM blocks."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_key_mix import matrix
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'push':0x100035a28,'pcm':0x1001bc114,'product':0x1007ff7f4,'output':0x10070ef58}
LIMIT=8192
records,errors,hooks=[],[],[]
configs={};inflight=set();outputs=0;products=0;complete=False
global_frame=0;global_model=None

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':2,'threadIndexFilter':1,'windowComplete':complete,'minimumFrames':LIMIT,'capturedFrames':global_frame,
   'outputCount':outputs,'productCount':products,'configs':configs,'records':records,'errors':errors},indent=2))

def pointers(frame,p,limit):
 begin,end=unpack(frame,p,'QQ');assert end>=begin and (end-begin)%8==0 and (end-begin)//8<=limit
 return list(unpack(frame,begin,'Q'*((end-begin)//8))) if end>begin else []

def spectrum(frame,p,values=False):
 assert scalar(frame,p+8,'Q')==64 and scalar(frame,p+0x30,'Q')==128
 ptr=scalar(frame,p+0x28,'Q');empty=scalar(frame,p+0x14,'B')
 r={'object':hex(p),'buffer':hex(ptr),'empty':empty,'content':scalar(frame,p+0x18,'I'),'timestamp':scalar(frame,p+0x10,'I')}
 if values and not empty:r['data']=floats(frame,ptr,128)
 return r

def ring(frame,p,values=False):
 if not p:return None
 slots=pointers(frame,p,64);cursor=scalar(frame,p+0x18,'Q');assert slots and cursor<len(slots)
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
  obj=scalar(frame,q,'Q');tail=scalar(frame,q+0x30,'Q');assert scalar(frame,q+0x38,'Q')==64
  output_objects.append({'holder':hex(q),'fft':spectrum(frame,obj),'history':floats(frame,tail,64)})
 return {'stepCount':scalar(frame,p,'I'),'blockSize':scalar(frame,p+8,'Q'),'inputCount':scalar(frame,p+0x10,'Q'),
         'inputs':[ring(frame,q) for q in inputs],'kernels':[ring(frame,q,True) for q in kernels],
         'outputs':output_objects,'routes':routes,'plans':plans}

def eligible(frame,p):return scalar(frame,p+8,'Q')==64 and scalar(frame,p+0x10,'Q')==9

def observed(frame,location,_):
 global products,outputs,complete,global_frame,global_model
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='pcm':
   m=hex(register(frame,'x19'));assert global_model in (None,m);global_model=m
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append({'stage':stage,'thread':thread,'frameStart':global_frame,'M':m,'matrix':out})
   global_frame+=64
   if global_frame>=LIMIT and not inflight:
    complete=True
    for h in hooks:h.SetEnabled(False)
    save()
   return False
  if stage=='push':
   bank=register(frame,'x0')
   if not eligible(frame,bank):return False
   key=hex(bank)
   if key not in configs:configs[key]=bank_config(frame,bank)
   channel=register(frame,'x1');r=scalar(frame,scalar(frame,bank+0x30,'Q')+channel*8,'Q')
   if not r:return False
   slots=pointers(frame,r,64);cursor=scalar(frame,r+0x18,'Q');vector=register(frame,'x3');assert scalar(frame,vector+8,'Q')==64
   records.append({'stage':stage,'thread':thread,'bank':key,'frameStart':global_frame,'channel':channel,'timestamp':register(frame,'w2'),
     'step':scalar(frame,bank+0xa0,'I'),'cursor':cursor,'before':spectrum(frame,slots[cursor]),'input':floats(frame,scalar(frame,vector,'Q'),64)})
  elif stage=='product':
   bank=register(frame,'x19')
   if not eligible(frame,bank):return False
   r={'stage':stage,'thread':thread,'bank':hex(bank),'frameStart':global_frame,'ordinal':products,'destination':spectrum(frame,register(frame,'x0'),True),
      'a':spectrum(frame,register(frame,'x1'),True),'b':spectrum(frame,register(frame,'x2'),True),'scale':regfloat(frame,'s0','f')}
   records.append(r);inflight.add(r['destination']['object']);products+=1
  else:
   obj=register(frame,'x19')
   if scalar(frame,obj+8,'Q')!=64:return False
   owners=[k for k,c in configs.items() if any(o and o['fft']['object']==hex(obj) for o in c['outputs'])]
   if not owners:return False
   assert len(owners)==1
   out=register(frame,'x21');tail=register(frame,'x20');assert scalar(frame,out+8,'Q')==64 and scalar(frame,tail+8,'Q')==64
   records.append({'stage':stage,'thread':thread,'bank':owners[0],'frameStart':global_frame,'ordinal':outputs,'fft':spectrum(frame,obj,True),
      'output':floats(frame,scalar(frame,out,'Q'),64),'tail':floats(frame,scalar(frame,tail,'Q'),64)})
   inflight.discard(hex(obj));outputs+=1
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
