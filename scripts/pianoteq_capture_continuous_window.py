"""Use existing six-site continuous observer with an owned launch driver."""
import json,time
import pianoteq_capture_release_continuous_chain as chain
import pianoteq_capture_soundboard_responses as base
last_saved_records=-500
if not chain.DISPATCH or chain.ALL_VOICES or chain.CONSUMER_DELAY:raise ValueError('Dispatch-enabled bounded first-voice mode required')
chain.POINTS['coefficients']=0x100472f54
chain.POINTS['envelopeResult']=0x100472fd4
worker_seen={}
stopped_worker_reads=[]
STOPPED_FRAME=object()
original_save=chain.save

def save():
 global last_saved_records
 if len(chain.records)-last_saved_records<500 and not chain.errors and not chain.complete and not (base.run_status or {}).get('terminal'):return
 last_saved_records=len(chain.records)
 original_save();p=chain.ROOT/'runtime.json';d=json.loads(p.read_text());d['runStatus']=base.run_status;d['readStoppedWorkerFrames']=True;d['stoppedWorkerReads']=stopped_worker_reads;p.write_text(json.dumps(d,indent=2,allow_nan=False))
chain.save=save
base.save=save

def install(debugger,name,callback):
 import lldb
 target=debugger.GetSelectedTarget();address=chain.POINTS[name];result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result)
 if not result.Succeeded():raise RuntimeError(result.GetError())
 hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);error=hook.SetScriptCallbackFunction(callback)
 if error and error.Fail():raise RuntimeError(str(error))
 hook.SetAutoContinue(name not in ('coefficients','envelopeResult'));chain.hooks[name]=hook

def observed(frame,bp,_):
 pc=frame.GetPCAddress().GetFileAddress();name=next(k for k,v in chain.POINTS.items() if v==pc);key=None
 if name in ('coefficients','envelopeResult'):
  v=frame.FindRegister('x19').GetValueAsUnsigned();h=v-0x168
  if h not in chain.voices:return False
  epoch=chain.voices[h];age=chain.scalar(frame,v+0x10,'I');key=(epoch,name);previous=worker_seen.get(key,-64 if name=='coefficients' else 0)
  if age==previous:return False
  if age!=previous+64:
   chain.errors.append(f'Observed worker clock gap: {key} {previous}->{age}')
   for hook in chain.hooks.values():hook.SetEnabled(False)
   save();return True
 result=chain.observed(frame,bp,_)
 if key is not None and not chain.errors:
  worker_seen[key]=age
  if _ is STOPPED_FRAME:stopped_worker_reads.append({'thread':frame.GetThread().GetThreadID(),'epoch':epoch,'stage':name,'counter':age,'stopId':frame.GetThread().GetProcess().GetStopID()})
 return result or key is not None

def first_before(frame,bp,_):
 result=chain.observed(frame,bp,_)
 if chain.errors:return True
 debugger=frame.GetThread().GetProcess().GetTarget().GetDebugger()
 for name in chain.POINTS:
  if name not in chain.hooks:install(debugger,name,__name__+'.observed')
 base.hooks=list(chain.hooks.values());save();return result

def __lldb_init_module(debugger,_):
 target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();chain.verify_text(chain.Path(spec.GetDirectory())/spec.GetFilename())
 assert not (chain.ROOT/'runtime.json').exists()
 install(debugger,'before',__name__+'.first_before');save()

def run(debugger,args):
 import lldb,signal
 debugger.SetAsync(False);target=debugger.GetSelectedTarget();launch=lldb.SBLaunchInfo(args);launch.SetLaunchFlags(lldb.eLaunchFlagStopAtEntry|lldb.eLaunchFlagDisableASLR);error=lldb.SBError();process=target.Launch(launch,error)
 if error.Fail():raise RuntimeError(str(error))
 audit=[];initial=True
 while process.GetState()==lldb.eStateStopped:
  if chain.errors:raise RuntimeError('Capture callback failed')
  if len(audit)>=20000:raise RuntimeError('Owned resume bound exceeded')
  # Recover only real, currently stopped frames at exact registered worker PCs.
  for thread in process:
   frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress();name=next((k for k in ('coefficients','envelopeResult') if pc==chain.POINTS[k]),None)
   if name is not None:observed(frame,chain.hooks[name].GetLocationAtIndex(0),STOPPED_FRAME)
  if chain.errors:raise RuntimeError('Stopped worker observation failed')
  details=[]
  for thread in process:
   reason=thread.GetStopReason()
   if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):continue
   frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress();ids=[thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())];owned=False;kind=None
   if initial and reason==lldb.eStopReasonSignal and ids==[signal.SIGSTOP]:owned=True;kind='initial-launch'
   if reason==lldb.eStopReasonBreakpoint:
    own={h.GetID() for h in chain.hooks.values()};owned=bool(ids) and all(ids[i] in own for i in range(0,len(ids),2));kind='owned-hardware'
   if reason in (lldb.eStopReasonException,lldb.eStopReasonTrace):
    seen=chain.last_seen.get(thread.GetThreadID())
    if seen and pc in (seen['pc'],seen['pc']+4) and seen['pc'] in chain.POINTS.values() and seen['hits']==chain.hooks[seen['stage']].GetHitCount():
     owned=(reason==lldb.eStopReasonException and ids in ([6,1,0],[6,1,frame.GetPC()])) or (reason==lldb.eStopReasonTrace and ids==[]);kind='owned-callback-stop'
   if not owned and reason in (lldb.eStopReasonBreakpoint,lldb.eStopReasonException):
    internal=target.FindBreakpointByID(-2)
    if internal.IsValid() and internal.IsInternal():
     for i in range(internal.GetNumLocations()):
      a=internal.GetLocationAtIndex(i).GetAddress();module=a.GetModule().GetFileSpec().GetFilename();loaded=a.GetLoadAddress(target)
      if module=='libsystem_pthread.dylib' and ((reason==lldb.eStopReasonException and ids==[6,1,0] and pc==a.GetFileAddress()+4 and frame.GetPC()==loaded+4) or (reason==lldb.eStopReasonBreakpoint and len(ids)==2 and ids[0]==(1<<64)-2 and ids[1]==i+1 and pc==a.GetFileAddress() and frame.GetPC()==loaded)):
       owned=True;kind='verified-lldb-internal-pthread'
   details.append({'thread':thread.GetThreadID(),'reason':reason,'pc':hex(pc),'ids':ids,'kind':kind})
   if not owned:
    (chain.ROOT/'rejected-stop.json').write_text(json.dumps(details,indent=2));raise RuntimeError('Unowned debugger stop')
  audit.append(details)
  with (chain.ROOT/'owned-resumes.jsonl').open('a') as out:out.write(json.dumps({'stopId':process.GetStopID(),'threads':details,'records':len(chain.records)})+'\n')
  initial=False;base.run_status={'pid':process.GetProcessID(),'terminal':False};save();error=process.Continue()
  if error.Fail():raise RuntimeError(str(error))
 base.run_status={'pid':process.GetProcessID(),'terminal':process.GetState()==lldb.eStateExited,'state':process.GetState(),'exitStatus':process.GetExitStatus()};save()
 if base.run_status['terminal'] and base.run_status['exitStatus']==0:
  if chain.DISPATCH:
   for epoch in range(5):
    rows=[r for r in chain.records if r['stage']=='coefficients' and r['epoch']==epoch]
    if not rows or any(r['counter']!=i*64 for i,r in enumerate(rows)):raise RuntimeError(f'Noncontiguous captured dispatch clock: epoch={epoch}')
  chain.finish()
 return base.run_status
