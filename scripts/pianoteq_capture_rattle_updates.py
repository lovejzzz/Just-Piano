"""Six fixed hardware observations for dynamic Rattle x ownership and consumption."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'source':0x10035f2c4,'updateA':0x10085ed9c,'updateB':0x1007cbaf4,'setter':0x10051182c,'active':0x1006e5270,'coefficients':0x1006e5360}
records=[];errors=[];hooks={};voices={};pending={};last_seen={};starts=0;updates=0;setters=0;coefficients=0;complete=False

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'fixedSites':True,'siteCount':6,'records':records,'errors':errors,'starts':starts,'updateCount':updates,'setterCount':setters,'coefficientCount':coefficients,'pending':len(pending),'complete':complete,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2,allow_nan=False))
def observed(frame,location,_):
 global starts,updates,setters,coefficients
 try:
  pc=frame.GetPCAddress().GetFileAddress();assert pc==location.GetAddress().GetFileAddress()
  stage=next(k for k,v in POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID()
  last_seen[thread]={'pc':pc,'hits':hooks[stage].GetHitCount(),'stage':stage}
  if stage=='source':
   source=register(frame,'x12');voice=register(frame,'x22');assert starts<5
   voices[voice]=starts;records.append({'stage':stage,'thread':thread,'epoch':starts,'voice':hex(voice),'owner':hex(source),'sourceX':scalar(frame,source+0xe4),'initialX':scalar(frame,voice+0x306c),'counter':scalar(frame,voice+0x6c,'I')});starts+=1
  elif stage in ('updateA','updateB'):
   voice=register(frame,'x21' if stage=='updateA' else 'x24')
   if voice not in voices:return False
   source=register(frame,'x8');records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'owner':hex(source),'sourceX':scalar(frame,source+0xe4),'currentX':scalar(frame,voice+0x2f38),'counter':scalar(frame,voice+0x6c,'I')});updates+=1
  elif stage=='setter':
   v=register(frame,'x0');voice=v-0x168
   if voice not in voices:return False
   caller=frame.GetThread().GetProcess().GetTarget().ResolveLoadAddress(register(frame,'x30')).GetFileAddress();assert caller in (0x1007184b0,0x100460260)
   offset=0x306c if caller==0x1007184b0 else 0x2f38
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'caller':hex(caller),'sourceX':scalar(frame,voice+offset),'argument':regfloat(frame,'s0','f'),'modalX':scalar(frame,v+0x8c4)});setters+=1
  elif stage=='active':
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   assert thread not in pending
   row={'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'cube':regfloat(frame,'s11','f'),'modalX':scalar(frame,v+0x8c4),
    'inputs':{'polynomial':list(unpack(frame,v+0x914,'f'))+list(unpack(frame,v+0x94c,'ffff')),'cubicScale':scalar(frame,v+0x91c),'rateScale':scalar(frame,v+0x910),'gainScale':scalar(frame,v+0x90c),'cubicGainScale':scalar(frame,v+0x920)}}
   records.append(row);pending[thread]=row
  else:
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   active=pending.pop(thread,None)
   if active:assert active['modal']==hex(v) and active['epoch']==voices[voice]
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'active':active is not None,'u':regfloat(frame,'s1','f'),'modalX':scalar(frame,v+0x8c4),
    'actual':{'duration':scalar(frame,v+0x944),'rate':scalar(frame,v+0x7e4),'gain':scalar(frame,v+0x7b0)}});coefficients+=1
  assert len(records)<50000 and all(h.IsEnabled() for h in hooks.values())
  if len(records)%128==0:save()
  return False
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def finish():
 global complete
 assert starts==5 and updates>0 and setters>=5 and coefficients>0 and not pending and not errors
 for h in hooks.values():h.SetEnabled(False)
 complete=True;save()
def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 t=debugger.GetSelectedTarget();spec=t.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded()
  h=t.GetBreakpointAtIndex(t.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');h.SetAutoContinue(True);hooks[name]=h
 save()

def resume_owned_stops(debugger):
 """Normal Continue only for owned hardware-stop artifacts, 40-second budget."""
 import lldb,time
 debugger.SetAsync(False);target=debugger.GetSelectedTarget();process=target.GetProcess();assert target.GetNumBreakpoints()==len(hooks)==6
 owned={h.GetID() for h in hooks.values()};path=ROOT/'owned-resumes.json';observations=json.loads(path.read_text()) if path.exists() else [];deadline=time.monotonic()+40
 for _ in range(8192):
  if process.GetState()!=lldb.eStateStopped:break
  assert not errors
  details=[];matched=False
  for thread in process:
   reason=thread.GetStopReason()
   if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):continue
   assert reason in (lldb.eStopReasonBreakpoint,lldb.eStopReasonException)
   frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress();ids=[thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())]
   if reason==lldb.eStopReasonException:
    if pc in POINTS.values() and ids==[6,1,frame.GetPC()]:
     seen=last_seen[thread.GetThreadID()];assert seen['pc']==pc and seen['hits']==hooks[seen['stage']].GetHitCount();matched=True
    else:assert ids==[6,1,0] and pc-4 in POINTS.values()
   else:
    if ids and ids[0]==(1<<64)-2:
     internal=target.FindBreakpointByID(-2);assert internal.IsValid() and internal.IsInternal() and len(ids)==2 and 1<=ids[1]<=internal.GetNumLocations()
     location=internal.GetLocationAtIndex(ids[1]-1).GetAddress()
     assert location.GetModule().GetFileSpec().GetFilename()=='libsystem_pthread.dylib' and location.GetFileAddress()==pc and location.GetLoadAddress(target)==frame.GetPC()
    elif ids:assert ids[0] in owned
    if pc in POINTS.values() and ids and ids[0] in owned:matched=True
   details.append({'thread':thread.GetThreadID(),'pc':hex(pc),'ids':ids})
  assert matched
  observations.append({'ordinal':len(observations),'records':len(records),'threads':details});path.write_text(json.dumps(observations,indent=2));save();error=process.Continue();assert error.Success(),str(error)
  if time.monotonic()>deadline:break
 save()
