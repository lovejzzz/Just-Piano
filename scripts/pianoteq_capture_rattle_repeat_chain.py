"""Six fixed observations: dynamic Rattle -> coefficients -> envelope -> copy -> repeated strike."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'before':0x10035ef10,'updateA':0x10085ed9c,'envelope':0x100472f80,'envelopeResult':0x100472fd0,'copy':0x1004604d4,'coefficients':0x1006e5360}
records=[];errors=[];hooks={};voices={};pending={};envelope_pending={};envelope_completed={};blocks=0;duplicates=0;last_seen={};starts=0;updates=0;copies=0;coefficients=0;complete=False

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'fixedSites':True,'siteCount':6,'records':records,'errors':errors,'starts':starts,'updateCount':updates,'copyCount':copies,'envelopeBlocks':blocks,'duplicateEnvelopeReturns':duplicates,'envelopePending':len(envelope_pending),'coefficientCount':coefficients,'pending':len(pending),'complete':complete,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2,allow_nan=False))
def observed(frame,location,_):
 global starts,updates,copies,coefficients,blocks,duplicates
 try:
  pc=frame.GetPCAddress().GetFileAddress();assert pc==location.GetAddress().GetFileAddress()
  stage=next(k for k,v in POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID()
  last_seen[thread]={'pc':pc,'hits':hooks[stage].GetHitCount(),'stage':stage}
  if stage=='before':
   assert starts<5 and thread not in pending
   manager=register(frame,'x19');model=register(frame,'x25');old=register(frame,'x8');new=register(frame,'x22');host=scalar(frame,manager+0xc08,'Q');r=scalar(frame,manager+0xe00,'Q')
   previous=None
   if old:
    n=scalar(frame,old+0x2ed8,'Q');assert n<=16
    previous={'count':scalar(frame,old+0x6c,'I'),'duration':scalar(frame,old+0x2f20),'release':scalar(frame,old+0x2f24),'velocity':scalar(frame,old+0x78),'history':list(unpack(frame,old+0x2ee0,'f'*n)) if n else []}
   row={'stage':stage,'ordinal':starts,'thread':thread,'newVoice':hex(new),'oldVoice':hex(old),'note':scalar(frame,model+0x14),
    'inputs':{'mode':register(frame,'w27'),'newVelocity':regfloat(frame,'s9','f'),'hostRate':scalar(frame,host+0xc),'pedal':scalar(frame,r+0x90),'threshold':scalar(frame,r+0x9c),'old':previous}}
   assert new not in voices;row.update(epoch=starts,voice=hex(new),owner=hex(r),sourceX=scalar(frame,r+0xe4));voices[new]=starts;records.append(row);starts+=1
  elif stage=='updateA':
   voice=register(frame,'x21')
   if voice not in voices:return False
   source=register(frame,'x8');records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'owner':hex(source),'sourceX':scalar(frame,source+0xe4),'currentX':scalar(frame,voice+0x2f38),'counter':scalar(frame,voice+0x6c,'I')});updates+=1
  elif stage=='copy':
   voice=register(frame,'x19')
   if voice not in voices:return False
   n=scalar(frame,voice+0x3008,'Q');assert n<=16
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'counter':scalar(frame,voice+0x6c,'I'),
    'release':scalar(frame,voice+0x2f24),'modalPosition':scalar(frame,voice+0xab0),
    'producerActual':{'repeatFlag':scalar(frame,voice+0x2ff0,'B'),'age':scalar(frame,voice+0x2ffc),'oldVelocity':scalar(frame,voice+0x3000),'attenuation':scalar(frame,voice+0x2ff8),'history':list(unpack(frame,voice+0x3010,'f'*n)) if n else []}})
   copies+=1
  elif stage=='coefficients':
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'u':regfloat(frame,'s1','f'),'modalX':scalar(frame,v+0x8c4),'releaseFlag':scalar(frame,v+0x924,'B'),
    'inputs':{'polynomial':list(unpack(frame,v+0x914,'f'))+list(unpack(frame,v+0x94c,'ffff')),'cubicScale':scalar(frame,v+0x91c),'rateScale':scalar(frame,v+0x910),'gainScale':scalar(frame,v+0x90c),'cubicGainScale':scalar(frame,v+0x920)},
    'actual':{'duration':scalar(frame,v+0x944),'rate':scalar(frame,v+0x7e4),'gain':scalar(frame,v+0x7b0)}});coefficients+=1
  elif stage=='envelope':
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   assert thread not in envelope_pending and blocks<20000
   row={'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'position':scalar(frame,v+0x948),'timestep':scalar(frame,v+0x8fc),'duration':scalar(frame,v+0x944),'baseDuration':scalar(frame,v+0x914),'samples':scalar(frame,register(frame,'x20')+0x10,'I')}
   records.append(row);envelope_pending[thread]=row
  else:
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   result={'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'position':scalar(frame,v+0x948)}
   if thread not in envelope_pending:
    assert envelope_completed.get(thread)==result, ('Unpaired envelope return',result,envelope_completed.get(thread))
    records.append({**result,'stage':'duplicateEnvelopeResult'});duplicates+=1
   else:
    row=envelope_pending.pop(thread);assert row['modal']==hex(v) and row['epoch']==voices[voice]
    records.append(result);envelope_completed[thread]=result;blocks+=1
  assert len(records)<50000 and all(h.IsEnabled() for h in hooks.values())
  if len(records)%128==0:save()
  return False
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def finish():
 global complete
 assert starts==5 and updates>0 and coefficients>0 and blocks>0 and copies>0 and not envelope_pending and not pending and not errors
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
    else:
     assert ids==[6,1,0]
     if pc-4 not in POINTS.values():
      internal=target.FindBreakpointByID(-2);assert internal.IsValid() and internal.IsInternal()
      locations=[internal.GetLocationAtIndex(i).GetAddress() for i in range(internal.GetNumLocations())]
      assert any(a.GetModule().GetFileSpec().GetFilename()=='libsystem_pthread.dylib' and a.GetFileAddress()+4==pc and a.GetLoadAddress(target)+4==frame.GetPC() for a in locations)
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
