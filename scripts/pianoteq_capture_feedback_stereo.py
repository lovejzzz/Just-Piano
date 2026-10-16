"""Read-only pre-feedback workspace through actual final PCM with four active hardware sites."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_key_routes import cache
from pianoteq_capture_global_filters import filter_state
from pianoteq_capture_room_mix import vector
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_worker_bank512 import bank_config as tail_config
from pianoteq_capture_convolution_scheduler import bank_config as head_config
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'copy':0x1002a4334,'workspace':0x1006c2ac4,'entry':0x1000ef37c,'pcm':0x1001bc114,'global':0x1006c2fd4}
LIMIT=1768
records,errors,hooks=[],[],[]
pending={};configs={};time_inputs={};frame_start=0;complete=False;started=False;blocks=0;global_hook_installed=False;active_debugger=None;hook_transitions=[]

def save():
 ROOT.mkdir(parents=True,exist_ok=True)
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'windowComplete':complete,'minimumWrapperBlocks':LIMIT,
 'hookTransitions':hook_transitions,'preFeedbackWorkspaceObserved':True,'globalRouteBoundary':True,'globalPcmObserved':True,'wrapperBlocks':blocks,'wrapperLocalFrames':frame_start,'configs':configs,'records':records,'errors':errors},indent=2))

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

def mapping(frame,p):
 begin,end=unpack(frame,p,'QQ');assert end>=begin and (end-begin)%96==0 and (end-begin)//96<=128
 entries=[]
 for a in range(begin,end,96):
  src,dst=unpack(frame,a,'II');n=scalar(frame,a+8,'Q');assert n<=3
  entries.append({'source':src,'destination':dst,'tapWords':list(unpack(frame,a+16,'I'*(n*6)))})
 return {'entries':entries,'wrap':scalar(frame,p+24,'B')}

def post_profile(frame,m):
 state=scalar(frame,scalar(frame,m+0xe00,'Q')+0x50,'Q')
 filters=[]
 for row in range(3):
  f=filter_state(frame,state+0x3c8,row);base=scalar(frame,state+0x3d0,'Q')+row*0xb0
  f['level']=list(unpack(frame,base,'ffff'));filters.append(f)
 obj=scalar(frame,m+0xe10,'Q');room=scalar(frame,obj+0x28,'Q')
 out_obj=scalar(frame,m+0xe30,'Q');route=scalar(frame,out_obj+0x28,'Q')
 return {'filters':filters,'dryGains':vector(frame,room+0x28),'wetGains':vector(frame,room+0x10),
  'hasConvolution':scalar(frame,room+0x78,'Q')!=0,'hasExternal':scalar(frame,room+0x80,'Q')!=0,
  'spatialEnabled':scalar(frame,room+0xc0,'B'),'stereoCache':cache(frame,route+0x10),
  'stereoMapping':mapping(frame,route+0x40),'stereoResetPending':scalar(frame,out_obj+0xb0,'B'),
  'level':list(unpack(frame,m+0xdd8,'ffff'))}

def observed(frame,location,_):
 global frame_start,complete,started,blocks,global_hook_installed
 try:
  assert frame.GetThread().GetIndexID()==1
  stage=next(k for k,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='copy':
   if started:return False
   obj=register(frame,'x0');size=scalar(frame,obj+8,'Q')
   if size not in (64,512):return False
   span=register(frame,'x1');assert scalar(frame,span+8,'Q')==size
   time_inputs[(size,hex(obj))]=floats(frame,scalar(frame,span,'Q'),size)
  elif stage=='workspace':
   root=register(frame,'x0');b=register(frame,'x2');state=scalar(frame,root+0x50,'Q')
   begin,end=unpack(frame,b+0x270,'QQ');assert end-begin==3*104
   records.append({'stage':stage,'thread':thread,'frameStart':frame_start,'R':hex(root),'S':hex(state),'B':hex(b),
    'groups':[matrix(frame,begin+i*104) for i in range(3)],'flatBefore':matrix(frame,b+0x288),'auxiliaryBefore':matrix(frame,b+0x120),
    'feedbackGain':scalar(frame,state+0x114),'feedbackPreRoute':scalar(frame,state+0x329,'B')&1})
   if not global_hook_installed:
    hooks[0].SetEnabled(False)
    add_hook(active_debugger,'global');global_hook_installed=True
    active=sum(h.IsEnabled() for h in hooks);assert active==4
    hook_transitions.append({'frame':frame_start,'disabled':'copy','enabled':'global','activeSites':active})
  elif stage=='global':
   state=register(frame,'x21');root=register(frame,'x20')-0x50
   assert scalar(frame,root+0x50,'Q')==state
   mapping=state+0x288;begin,end=unpack(frame,mapping,'QQ')
   assert end>=begin and (end-begin)%96==0 and (end-begin)//96<=128
   entries=[]
   for a in range(begin,end,96):
    src,dst=unpack(frame,a,'II');n=scalar(frame,a+8,'Q');assert n<=3
    entries.append({'source':src,'destination':dst,'tapWords':list(unpack(frame,a+16,'I'*(n*6)))})
   b,e=unpack(frame,state+0x3a0,'QQ');assert e>=b and (e-b)%4==0 and (e-b)//4<=16
   records.append({'stage':stage,'thread':thread,'frameStart':frame_start,'R':hex(root),'S':hex(state),
    'input':matrix(frame,register(frame,'x19')),'sumInput':matrix(frame,state+0x118),'cache':cache(frame,state+0x2c8),
    'entries':entries,'wrap':scalar(frame,mapping+24,'B'),'gain':regfloat(frame,'s0','f'),
    'gateEnabled':scalar(frame,state+0x3b8,'B'),'rowFlags':list(unpack(frame,b,'I'*((e-b)//4)))})
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
   owners=[frame.GetThread().GetFrameAtIndex(i) for i in range(frame.GetThread().GetNumFrames()) if frame.GetThread().GetFrameAtIndex(i).GetPCAddress().GetFileAddress()==0x1001bbce4]
   assert len(owners)==1
   m=register(owners[0],'x19');b=scalar(frame,scalar(frame,m+0xc08,'Q')+0x2f0,'Q')
   assert register(frame,'x2')==b+0x288
   if 'post' not in configs[key]:configs[key]['post']=post_profile(frame,m)
   pending[thread]={'state':state,'target':target,'M':m}
   records.append({'stage':stage,'thread':thread,'state':key,'frameStart':frame_start,'source':source,'before':before,
    'auxiliary':matrix(frame,b+0x120),'mode':register(frame,'w4'),'gain':list(unpack(frame,state+0x30,'ffff'))})
  elif thread in pending:
   c=pending[thread];state=c['state']
   if stage=='pcm':
    assert c['M']==register(frame,'x19')
    records.append({'stage':stage,'thread':thread,'state':hex(state),'frameStart':frame_start,'output':matrix(frame,register(frame,'x23')),'level':list(unpack(frame,c['M']+0xdd8,'ffff'))})
    pending.pop(thread);blocks+=1;frame_start+=64
    if blocks==LIMIT:
     complete=True
     for h in hooks:h.SetEnabled(False)
     save()
  return False
 except Exception:errors.append(traceback.format_exc());save();return True


def add_hook(debugger,name):
 import lldb
 target=debugger.GetSelectedTarget();r=lldb.SBCommandReturnObject()
 debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --thread-index 1 --address {POINTS[name]:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded()
 h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');hooks.append(h)

def __lldb_init_module(debugger,_):
 global active_debugger
 active_debugger=debugger
 import lldb
 assert set(POINTS)=={'copy','workspace','entry','pcm','global'}
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();assert target.GetTriple().startswith('arm64-')
 spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name in ('copy','workspace','entry','pcm'):add_hook(debugger,name)
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
