"""Read-only global modal recurrence coefficients and continuous before/after states."""
import json,os,traceback,hashlib,struct
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'global':0x1006c2ac4,'drive':0x100829d48,'body':0x100804a14,'bodyResult':0x1006c2bf8}
LIMIT=128
records,errors,hooks=[],[],[]
pending={};blocks=0;complete=False;configs={}

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumBlocks':LIMIT,'diagnosticScratchBitsOnly':True,'blocks':blocks,'configs':configs,'records':records,'errors':errors},indent=2,allow_nan=False))

def matrix_bits(frame,address):
 rows,stride,samples,row_stride=unpack(frame,address,'IIII');ptr=scalar(frame,address+0x10,'Q')
 assert rows<=16 and samples<=1024 and rows*samples<=8192
 return {'rows':rows,'stride':stride,'samples':samples,'rowStride':row_stride,'pointer':hex(ptr),
  'bits':[list(unpack(frame,ptr+4*r*row_stride,'I'*samples)) for r in range(rows)]}

def kernel_state(frame,p):
 count=scalar(frame,p+0x18,'I');n=scalar(frame,p+0x50,'Q');assert count%4==0 and n==count*8 and n<=8192
 return {'object':hex(p),'vectorCount':count,'previousInput':scalar(frame,p+0x10),'counter':scalar(frame,p+0x70,'I'),
  'disabled':scalar(frame,p+0x74,'B'),'states':floats(frame,scalar(frame,p+0x48,'Q'),n)}

def dispatch(frame,obj,values=False):
 variant=scalar(frame,obj+0x1b8,'B');r={'object':hex(obj),'variant':variant}
 if variant==0:
  state=scalar(frame,obj+0x1b0,'Q');assert state>4096
  r['state']=hex(state);r['kernels']=[]
  for off in (0xc8,0xd0,0xd8):
   p=scalar(frame,state+off,'Q');vt=scalar(frame,p,'Q');target=scalar(frame,vt+0x20,'Q')
   k={'object':hex(p),'vtable':hex(vt),'target':hex(target),'headerWords':list(unpack(frame,p,'Q'*8))}
   if values:
    assert target==0x100657dfc
    k.update(kernel_state(frame,p));count=scalar(frame,p+0x28,'Q');assert count==k['vectorCount']*16 and count<=8192
    ptr=scalar(frame,p+0x20,'Q');words=[]
    for offset in range(0,count,4096):words.extend(unpack(frame,ptr+4*offset,'I'*min(4096,count-offset)))
    digest=hashlib.sha256(struct.pack('<'+str(count)+'I',*words)).hexdigest();k['coefficientSha256']=digest
    if hex(p) not in configs:configs[hex(p)]={'vectorCount':k['vectorCount'],'modeCount':scalar(frame,p+0x14,'I'),'coefficientSha256':digest,'coefficients':[v for offset in range(0,count,4096) for v in floats(frame,ptr+4*offset,min(4096,count-offset))],'initial':kernel_state(frame,p),'coefficientVersions':{digest:[v for offset in range(0,count,4096) for v in floats(frame,ptr+4*offset,min(4096,count-offset))]}}
    elif digest not in configs[hex(p)]['coefficientVersions']:configs[hex(p)]['coefficientVersions'][digest]=[v for offset in range(0,count,4096) for v in floats(frame,ptr+4*offset,min(4096,count-offset))]
   r['kernels'].append(k)
 return r

def observed(frame,location,_):
 global blocks,complete
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='global':
   assert thread not in pending
   root=register(frame,'x0');b=register(frame,'x2');obj=scalar(frame,root+0x58,'Q')
   pending[thread]={'R':root,'B':b,'drive':False,'body':False}
   records.append({'stage':stage,'thread':thread,'ordinal':blocks,'R':hex(root),'B':hex(b),'dispatch':dispatch(frame,obj),
    'inputs':{hex(o):matrix(frame,b+o) for o in (0x190,0x1c8,0x200)},'outputBefore':matrix(frame,b+0x158)})
  elif thread in pending:
   c=pending[thread]
   if stage=='drive':
    assert register(frame,'x0')==scalar(frame,c['R']+0x88,'Q') and not c['drive'];c['drive']=True
    obj=register(frame,'x0');state=scalar(frame,obj+0xa0,'Q')
    records.append({'stage':stage,'thread':thread,'ordinal':blocks,'object':hex(obj),'state':hex(state),'gain':regfloat(frame,'s0','f'),
     'level':scalar(frame,obj+0x84),'input':matrix(frame,register(frame,'x1')),'uninitializedOutputBits':matrix_bits(frame,register(frame,'x2')),
     'controlWords':list(unpack(frame,obj+0x80,'I'*8)),'stateWords':list(unpack(frame,state,'I'*68))})
   elif stage=='body':
    assert c['drive'] and not c['body'];c['body']=True
    obj=register(frame,'x0');assert obj==scalar(frame,c['R']+0x58,'Q') and register(frame,'x4')==c['B']+0x158
    d=dispatch(frame,obj,True);c['kernelObjects']=[int(k['object'],16) for k in d['kernels']]
    records.append({'stage':stage,'thread':thread,'ordinal':blocks,'dispatch':d,
     'inputs':[matrix(frame,register(frame,r)) for r in ('x1','x2','x3')],'outputBefore':matrix(frame,register(frame,'x4'))})
   else:
    assert c['body']
    records.append({'stage':stage,'thread':thread,'ordinal':blocks,'output':matrix(frame,c['B']+0x158),'kernels':[kernel_state(frame,p) for p in c['kernelObjects']]})
    pending.pop(thread);blocks+=1
    if blocks==LIMIT:
     complete=True
     for h in hooks:h.SetEnabled(False)
     save()
  return False
 except Exception:errors.append(traceback.format_exc());save();return True

def __lldb_init_module(debugger,_):
 import lldb
 assert set(POINTS)=={'global','drive','body','bodyResult'} and not (ROOT/'runtime.json').exists()
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
