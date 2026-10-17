"""Whole-clip source/key/global/cabinet/PCM observations; six static sites after two initialization handoffs."""
import os,json,time,sys,traceback
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import pianoteq_capture_shared_stereo_chain as helpers
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register,floats
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_key_mix import matrix
from pianoteq_capture_key_routes import cache
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
BLOCKS=int(os.environ['PIANOTEQ_FULL_WRAPPER_BLOCKS']);assert 1000<=BLOCKS<=4096
POINTS={'irCopy':0x1002a4334,'before':0x10030c104,'key':0x10051fad4,'global':0x1006c2fd4,'cabinet':0x1000ef37c,'pcm':0x1001bc114}
records=[];errors=[];hooks={};voices={};ends={};pending={};last_seen={};configs={};time_inputs={};transitions=[];handoff=None;context=None;global_block=0;main_thread=None;complete=False


def save():
 data=dict(schema=1,fixedSharedStereo=True,siteCount=6,wrapperBlocksExpected=BLOCKS,globalFrames=global_block,complete=complete,records=records,errors=errors,configs=configs,irTimeInputCount=len(time_inputs),voices=len(voices),ends=ends,pending=len(pending),globalPending=context,transitions=transitions,handoffPending=handoff,activeSites=sum(h.IsEnabled() for h in hooks.values()))
 (ROOT/'runtime.json.tmp').write_text(json.dumps(data,allow_nan=False));(ROOT/'runtime.json.tmp').replace(ROOT/'runtime.json')


def roots(frame,b):
 begin,end=unpack(frame,b+0x270,'QQ');assert end>=begin and (end-begin)%104==0 and (end-begin)//104==3
 return [b+0x2d0]+[begin+i*104+56 for i in range(3)]


def group_matrices(frame,b):
 assert scalar(frame,b,'Q')==3
 return [matrix(frame,b+8+56*i) for i in range(3)]


def mapping(frame,p):
 return helpers.stereo.mapping(frame,p)


def owner(frame,pc):
 frames=[frame.GetThread().GetFrameAtIndex(i) for i in range(frame.GetThread().GetNumFrames()) if frame.GetThread().GetFrameAtIndex(i).GetPCAddress().GetFileAddress()==pc]
 assert len(frames)==1,('Unique caller required',hex(pc),len(frames))
 return frames[0]


def observation(frame,location,_):
 global main_thread,handoff,context,global_block
 try:
  pc=frame.GetPCAddress().GetFileAddress();name=next(k for k,v in POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID();main_thread=thread if main_thread is None else main_thread;assert thread==main_thread
  site=dict(id=hooks[name].GetID(),fileAddress=pc,loadAddress=frame.GetPC(),stopId=frame.GetThread().GetProcess().GetStopID());last_seen[thread]=site
  base=dict(stage=name,thread=thread,site=site,globalBlock=global_block)
  if name=='irCopy':
   assert not configs;obj=register(frame,'x0');size=scalar(frame,obj+8,'Q')
   if size not in (64,512):return True
   span=register(frame,'x1');assert scalar(frame,span+8,'Q')==size
   values=floats(frame,scalar(frame,span,'Q'),size);time_inputs[(size,hex(obj))]=values
   records.append(dict(**base,size=size,object=hex(obj),values=values))
  elif name=='selection':
   h=register(frame,'x28');g=register(frame,'x25');assert h not in voices and len(voices)<5 and scalar(frame,h+0x6c,'I')==0
   voices[h]=len(voices);ends[h]=0
   records.append(dict(**base,epoch=voices[h],voice=hex(h),counter=0,note=scalar(frame,g+0x14),initialTime=helpers.time_state(frame,h),source=dict(sampleRate=scalar(frame,g+0x98),overrideDuration=scalar(frame,h+0x3064),legato=scalar(frame,h+0x2ff4,'i'),globalDelay=scalar(frame,g+0x1204),globalAttack=scalar(frame,g+0x1208),legatoAttack=scalar(frame,g+0x120c),globalEnd=scalar(frame,g+0x1210))))
   if len(voices)==5:handoff=('selection','voiceExit',0x10085ede4,site['stopId'],len(records))
  elif name=='before':
   caller=owner(frame,0x100460de4);h=register(caller,'x19');b=register(caller,'x23');a=register(caller,'x21');age=scalar(frame,h+0x6c,'I')
   assert h in voices and h+0x28a8==register(frame,'x19') and register(frame,'x20')==b+8 and a==b+0xb0 and thread not in pending and context is None and age==ends[h]
   pending[thread]=dict(H=h,B=b,counter=age)
   records.append(dict(**base,epoch=voices[h],voice=hex(h),counter=age,B=hex(b),channels=helpers.groups(frame,b),auxiliary=matrix(frame,a),tail=helpers.terminal(frame,h),spatial=helpers.spatial(frame,h,age)))
  elif name=='voiceExit':
   h=register(frame,'x21');b=register(frame,'x20');assert h in voices
   flag=register(frame,'w0');forced=scalar(frame,h+0x2ec0,'I');will_route=bool(flag&1 or forced);c=pending.get(thread)
   if c is None:assert not will_route
   else:assert c['H']==h and c['B']==b
   age=scalar(frame,h+0x6c,'I');row=dict(**base,epoch=voices[h],voice=hex(h),nativeAge=age,returnFlag=flag,forcedActive=forced,willRoute=will_route,rendered=c is not None)
   if c is not None:
    row.update(counter=c['counter'],groups=group_matrices(frame,b),auxiliary=matrix(frame,b+0xb0),tail=helpers.terminal(frame,h),spatial=helpers.spatial(frame,h,c['counter']))
    if not will_route:ends[h]=age;pending.pop(thread)
   records.append(row)
  elif name=='key':
   h=register(frame,'x3');b=register(frame,'x2');plan=register(frame,'x1');m=register(frame,'x0');c=pending[thread];assert c['H']==h and c['B']==b and scalar(frame,h+0x6c,'I')==c['counter']+64
   rb,re=unpack(frame,plan+0xe8,'QQ');assert re-rb==96
   n=scalar(frame,h+0x100,'Q');assert n==3
   rs=roots(frame,b)
   records.append(dict(**base,epoch=voices[h],voice=hex(h),counter=c['counter'],nativeAge=c['counter']+64,B=hex(b),M=hex(m),groups=group_matrices(frame,b),auxiliary=matrix(frame,b+0xb0),tail=helpers.terminal(frame,h),spatial=helpers.spatial(frame,h,c['counter']),roots=[hex(r) for r in rs],caches=[cache(frame,r) for r in rs],mappings=[mapping(frame,plan+0xc8)]+[mapping(frame,rb+32*i) for i in range(3)],gains=[1.0]+list(unpack(frame,h+0xb8,'fff')),selectionMask=list(unpack(frame,h+0x108,'III'))))
   ends[h]=c['counter']+64;pending.pop(thread)
  elif name=='global':
   assert not pending and context is None
   state=register(frame,'x21');root=register(frame,'x20')-0x50;m=register(owner(frame,0x1001bb9ac),'x19');assert scalar(frame,m+0xe00,'Q')==root and scalar(frame,root+0x50,'Q')==state
   b=scalar(frame,scalar(frame,m+0xc08,'Q')+0x2f0,'Q');rs=roots(frame,b);fb,fe=unpack(frame,state+0x3a0,'QQ');assert fe-fb==12
   context=dict(M=m,B=b,S=state,R=root,phase='global')
   records.append(dict(**base,M=hex(m),B=hex(b),R=hex(root),S=hex(state),input=matrix(frame,register(frame,'x19')),sumInput=matrix(frame,state+0x118),cache=cache(frame,state+0x2c8),mapping=mapping(frame,state+0x288),gain=regfloat(frame,'s0','f'),keyRoots=[hex(r) for r in rs],keyCaches=[cache(frame,r) for r in rs],feedbackGain=scalar(frame,state+0x114),feedbackPreRoute=scalar(frame,state+0x329,'B')&1,maskEnabled=scalar(frame,state+0x3b8,'B'),rowFlags=list(unpack(frame,fb,'III'))))
  elif name=='cabinet':
   state=register(frame,'x1')
   if scalar(frame,state,'I')!=0x3d396:return True
   source=matrix(frame,register(frame,'x2'));before=matrix(frame,register(frame,'x3'))
   if source['rows']!=9 or before['rows']!=3:return True
   c=context;assert c and c['phase']=='global' and register(frame,'x2')==c['B']+0x288
   m=register(owner(frame,0x1001bbce4),'x19');assert m==c['M'];key=hex(state)
   if not configs:
    assert global_block==0 and not voices;helpers.stereo.time_inputs=time_inputs;configs[key]=helpers.stereo.configure(frame,state);configs[key]['post']=helpers.stereo.post_profile(frame,m);handoff=('irCopy','selection',0x1007181d8,site['stopId'],len(records)+1)
   assert key in configs and len(configs)==1
   c.update(phase='cabinet',cabinetState=key)
   records.append(dict(**base,cabinetState=key,source=source,before=before,auxiliary=matrix(frame,c['B']+0x120),mode=register(frame,'w4'),gain=list(unpack(frame,state+0x30,'ffff'))))
  else:
   c=context;assert c and c['phase']=='cabinet' and c['M']==register(frame,'x19')
   out=matrix(frame,register(frame,'x23'));assert out['rows']==2 and out['samples']==64
   records.append(dict(**base,cabinetState=c['cabinetState'],output=out,level=list(unpack(frame,c['M']+0xdd8,'ffff'))));context=None;global_block+=1
   if global_block==BLOCKS:
    for hook in hooks.values():hook.SetEnabled(False)
  assert len(records)<50000
  if len(records)%1024==0 or name=='cabinet' and global_block==0 or not any(h.IsEnabled() for h in hooks.values()):save()
  return True
 except Exception:
  errors.append(traceback.format_exc())
  for hook in hooks.values():hook.SetEnabled(False)
  save();return True


def replace(debugger):
 global handoff
 import lldb
 if handoff is None:return
 old,new,address,stop,after=handoff;t=debugger.GetSelectedTarget();old_id=hooks[old].GetID();assert t.BreakpointDelete(old_id);del hooks[old];del POINTS[old]
 r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded(),r.GetError()
 h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observation');h.SetAutoContinue(False);hooks[new]=h;POINTS[new]=address
 assert t.GetNumBreakpoints()==len(hooks)==6 and all(h.IsHardware() and h.IsEnabled() for h in hooks.values())
 transitions.append(dict(oldRole=old,newRole=new,oldId=old_id,newId=h.GetID(),fileAddress=address,stopId=stop,afterRecord=after,registered=6,active=6));handoff=None


def resume_owned_stops(debugger):
 import lldb
 debugger.SetAsync(False);p=debugger.GetSelectedTarget().GetProcess();deadline=time.monotonic()+40
 while p.GetState()==lldb.eStateStopped and time.monotonic()<deadline:
  assert not errors and (all(h.IsEnabled() for h in hooks.values()) or global_block==BLOCKS)
  details=[];matched=False
  for thread in p:
   reason=thread.GetStopReason()
   if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):continue
   pc=thread.GetFrameAtIndex(0).GetPCAddress().GetFileAddress();ids=[thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())];seen=last_seen.get(thread.GetThreadID());own=seen and pc in (seen['fileAddress'],seen['fileAddress']+4)
   if reason==lldb.eStopReasonBreakpoint and ids and ids[0]==(1<<64)-2:
    bp=p.GetTarget().FindBreakpointByID(-2);assert bp.IsValid() and bp.IsInternal() and len(ids)==2 and 1<=ids[1]<=bp.GetNumLocations();a=bp.GetLocationAtIndex(ids[1]-1).GetAddress();assert a.GetModule().GetFileSpec().GetFilename()=='libsystem_pthread.dylib' and a.GetFileAddress()==pc
   elif reason==lldb.eStopReasonBreakpoint:assert own and len(ids)==2 and ids[0]==seen['id'];matched=True
   elif reason==lldb.eStopReasonException:assert own and ids in ([6,1,0],[6,1,thread.GetFrameAtIndex(0).GetPC()]);matched=True
   elif reason==lldb.eStopReasonTrace:assert own and pc==seen['fileAddress']+4 and ids==[];matched=True
   else:raise AssertionError(('Unowned stop',reason,hex(pc),ids))
   details.append(dict(thread=thread.GetThreadID(),pc=hex(pc),reason=reason,ids=ids,lastOwned=seen))
  assert matched
  with (ROOT/'owned-resumes.jsonl').open('a') as out:out.write(json.dumps(dict(stopId=p.GetStopID(),records=len(records),threads=details))+'\n')
  replace(debugger);error=p.Continue();assert error.Success(),str(error)
 save()


def finish(debugger):
 global complete
 import lldb
 p=debugger.GetSelectedTarget().GetProcess();assert p.GetState()==lldb.eStateExited and p.GetExitStatus()==0 and not errors and not pending and context is None and handoff is None and global_block==BLOCKS and len(voices)==5 and len(configs)==1 and len(transitions)==2
 for stage in ('global','cabinet','pcm'):assert [r['globalBlock'] for r in records if r['stage']==stage]==list(range(BLOCKS))
 complete=True;save()


def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists();t=debugger.GetSelectedTarget();spec=t.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  r=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',r);assert r.Succeeded(),r.GetError()
  h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observation');h.SetAutoContinue(False);hooks[name]=h
 assert t.GetNumBreakpoints()==6 and all(h.IsEnabled() and h.IsHardware() for h in hooks.values());save()
