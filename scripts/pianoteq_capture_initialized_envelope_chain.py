"""Six fixed read-only sites: model sources -> coefficients -> envelope -> copy -> repeat."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'before':0x10035ef10,'copy':0x1004604d4,'initialize':0x10043e048,'coefficients':0x1006e5360,'envelope':0x100472f80,'envelopeResult':0x100472fd0}
records=[];errors=[];hooks={};pending={};envelope_pending={};voices=set();starts=0;blocks=0;copies=0;complete=False
coefficient_generations={};refreshes=0;initialized=set()

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'fixedSites':True,'records':records,'errors':errors,'starts':starts,'envelopeBlocks':blocks,'copyCount':copies,'refreshCount':refreshes,'initializations':len(initialized),'siteCount':6,'complete':complete,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2,allow_nan=False))
def observed(frame,location,_):
 global starts,blocks,copies,refreshes
 try:
  pc=frame.GetPCAddress().GetFileAddress();assert pc==location.GetAddress().GetFileAddress()
  stage=next(k for k,v in POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID()
  if stage=='before':
   assert starts<5 and thread not in pending
   manager=register(frame,'x19');model=register(frame,'x25');old=register(frame,'x8');new=register(frame,'x22');host=scalar(frame,manager+0xc08,'Q');r=scalar(frame,manager+0xe00,'Q')
   previous=None
   if old:
    n=scalar(frame,old+0x2ed8,'Q');assert n<=16
    previous={'count':scalar(frame,old+0x6c,'I'),'duration':scalar(frame,old+0x2f20),'release':scalar(frame,old+0x2f24),'velocity':scalar(frame,old+0x78),'history':list(unpack(frame,old+0x2ee0,'f'*n)) if n else []}
   row={'stage':stage,'ordinal':starts,'thread':thread,'newVoice':hex(new),'oldVoice':hex(old),'note':scalar(frame,model+0x14),
    'inputs':{'mode':register(frame,'w27'),'newVelocity':regfloat(frame,'s9','f'),'hostRate':scalar(frame,host+0xc),'pedal':scalar(frame,r+0x90),'threshold':scalar(frame,r+0x9c),'old':previous}}
   assert new not in voices;voices.add(new);records.append(row);starts+=1
  elif stage=='copy':
   voice=register(frame,'x19')
   if voice not in voices:return False
   n=scalar(frame,voice+0x3008,'Q');assert n<=16
   records.append({'stage':stage,'thread':thread,'voice':hex(voice),'counter':scalar(frame,voice+0x6c,'I'),
    'release':scalar(frame,voice+0x2f24),'modalPosition':scalar(frame,voice+0xab0),
    'producerActual':{'repeatFlag':scalar(frame,voice+0x2ff0,'B'),'age':scalar(frame,voice+0x2ffc),'oldVelocity':scalar(frame,voice+0x3000),'attenuation':scalar(frame,voice+0x2ff8),'history':list(unpack(frame,voice+0x3010,'f'*n)) if n else []}})
   copies+=1
  elif stage=='initialize':
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   assert voice not in initialized
   config=register(frame,'x20');g=register(frame,'x23');model=register(frame,'x21');r=scalar(frame,g+0x1240,'Q')
   start=scalar(frame,r+0xa0,'Q');end=scalar(frame,r+0xa8,'Q');assert end-start==16
   width=scalar(frame,model,'I');rows=scalar(frame,model+4,'I');selected=scalar(frame,model+0x10,'I');assert 1<=width<=4096 and rows<=4096
   decay=[];data=0
   if rows:
    assert selected<rows;data=scalar(frame,model+0x48,'Q');decay=list(unpack(frame,data+4*width*selected,'f'*width))
   records.append({'stage':stage,'voice':hex(voice),'modal':hex(v),'config':hex(config),'global':hex(g),'model':hex(model),'resource':hex(r),'polynomialSource':hex(start),'decaySource':hex(data+4*width*selected) if data else None,'width':width,'selectedRow':selected,
    'inputs':{'duration':scalar(frame,config+0x34),'polynomialTail':list(unpack(frame,start,'ffff')),'gainScale':scalar(frame,g+0xfb8),'cubicScale':scalar(frame,g+0xffc),'cubicGainScale':scalar(frame,g+0xff8),'sampleRate':scalar(frame,g+0x98),'decayRows':rows,'selectedDecayRow':decay},
    'actual':{'polynomial':list(unpack(frame,v+0x914,'f'))+list(unpack(frame,v+0x94c,'ffff')),'rateScale':scalar(frame,v+0x910),'gainScale':scalar(frame,v+0x90c),'cubicScale':scalar(frame,v+0x91c),'cubicGainScale':scalar(frame,v+0x920),'timestep':scalar(frame,v+0x8fc)}})
   initialized.add(voice)
  elif stage=='coefficients':
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   generation=coefficient_generations.get(voice,0)+1;coefficient_generations[voice]=generation
   records.append({'stage':stage,'thread':thread,'voice':hex(voice),'modal':hex(v),'generation':generation,'counter':scalar(frame,v+0x10,'I'),
    'inputs':{'x':scalar(frame,v+0x8c4),'u':regfloat(frame,'s1','f'),'releaseFlag':scalar(frame,v+0x924,'B'),
     'cubicScale':scalar(frame,v+0x91c),'polynomial':list(unpack(frame,v+0x914,'f'))+list(unpack(frame,v+0x94c,'ffff')),
     'rateScale':scalar(frame,v+0x910),'gainScale':scalar(frame,v+0x90c),'cubicGainScale':scalar(frame,v+0x920)},
    'actual':{'duration':scalar(frame,v+0x944),'rate':scalar(frame,v+0x7e4),'gain':scalar(frame,v+0x7b0)}})
   refreshes+=1
  elif stage=='envelope':
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   assert thread not in envelope_pending and blocks<20000
   row={'stage':stage,'ordinal':blocks,'thread':thread,'voice':hex(voice),'modal':hex(v),
    'generation':coefficient_generations.get(voice,0),'counter':scalar(frame,v+0x10,'I'),'position':scalar(frame,v+0x948),
    'timestep':scalar(frame,v+0x8fc),'duration':scalar(frame,v+0x944),'baseDuration':scalar(frame,v+0x914),'samples':scalar(frame,register(frame,'x20')+0x10,'I')}
   records.append(row);envelope_pending[thread]=row
  else:
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   row=envelope_pending.pop(thread);assert row['modal']==hex(v)
   records.append({'stage':stage,'ordinal':row['ordinal'],'thread':thread,'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'position':scalar(frame,v+0x948)})
   blocks+=1
   if blocks%64==0:save()
  assert sum(h.IsEnabled() for h in hooks.values())==6
  return False
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def finish():
 global complete
 assert initialized==voices and starts==5 and blocks>0 and copies>0 and refreshes>0 and not envelope_pending and not errors
 for h in hooks.values():h.SetEnabled(False)
 complete=True;save()
def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetScriptCallbackFunction(__name__+'.observed');h.SetAutoContinue(True);hooks[name]=h
 save()

def resume_owned_stops(debugger):
 """Continue known ARM64 hardware-stop artifacts for at most 40 seconds.

Never consumes an unobserved envelope return. A copy exception requires the
last callback record to match the live thread, voice, counter and both values.
No target instructions, memory, or registers are changed.
"""
 import lldb,time
 debugger.SetAsync(False)
 target=debugger.GetSelectedTarget();process=target.GetProcess()
 assert target.GetNumBreakpoints()==len(hooks)==6
 owned={h.GetID() for h in hooks.values()};path=ROOT/'owned-resumes.json'
 observations=json.loads(path.read_text()) if path.exists() else [];deadline=time.monotonic()+40
 for _ in range(8192):
  if process.GetState()!=lldb.eStateStopped:break
  assert not errors
  details=[];matched=False
  for thread in process:
   reason=thread.GetStopReason()
   if reason in (lldb.eStopReasonNone,lldb.eStopReasonInvalid):continue
   assert reason in (lldb.eStopReasonBreakpoint,lldb.eStopReasonException)
   frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress()
   ids=[thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())]
   if reason==lldb.eStopReasonException:
    if pc==POINTS['envelopeResult'] and len(ids)==3 and ids[:2]==[6,1] and ids[2]==frame.GetPC():
     assert thread.GetThreadID() not in envelope_pending
     matched=True
    elif pc==POINTS['copy'] and ids==[6,1,frame.GetPC()]:
     assert not envelope_pending and records
     voice=register(frame,'x19');row=records[-1]
     assert row['stage']=='copy' and row['thread']==thread.GetThreadID() and row['voice']==hex(voice)
     assert row['counter']==scalar(frame,voice+0x6c,'I') and row['release']==scalar(frame,voice+0x2f24) and row['modalPosition']==scalar(frame,voice+0xab0)
     matched=True
    else:assert ids==[6,1,0] and pc-4 in POINTS.values()
   else:
    if ids:assert ids[0] in owned
    if pc in POINTS.values() and ids:matched=True
   details.append({'thread':thread.GetThreadID(),'pc':hex(pc),'ids':ids})
  assert matched
  observations.append({'ordinal':len(observations),'blocks':blocks,'copies':copies,'threads':details})
  path.write_text(json.dumps(observations,indent=2));save()
  error=process.Continue();assert error.Success(),str(error)
  if time.monotonic()>deadline:break
 save()
