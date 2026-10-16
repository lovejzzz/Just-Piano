"""Six fixed sites: continuous release -> both excitations -> final initialization -> continuous modal blocks."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_excitation_slopes import capture_inputs
from pianoteq_capture_modal_source import vector
from pianoteq_capture_final_excitation import table
from pianoteq_capture_source_weights import curve
from pianoteq_capture_coefficients import capture_record
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
WINDOW_BLOCKS=int(os.environ.get('PIANOTEQ_CONTINUOUS_BLOCKS','8'));assert 1<=WINDOW_BLOCKS<=512
WINDOW_END=64*WINDOW_BLOCKS
ALL_VOICES=os.environ.get('PIANOTEQ_ALL_VOICES','0')=='1'
DISPATCH=ALL_VOICES or os.environ.get('PIANOTEQ_CAPTURE_DISPATCH','0')=='1'
POINTS={'before':0x10035ef10,'weights':0x100695108,'final':0x100864d28,'envelopeResult':0x100472fd0,'copy':0x1004604d4,'coefficients':0x1006e5360}
if DISPATCH:POINTS['coefficients']=0x100472f50
records=[];errors=[];hooks={};voices={};owners={};initialized=set();pending={};envelope_pending={};envelope_completed={};sample_counters={};blocks=0;duplicates=0;last_seen={};starts=0;updates=0;final_calls=0;spectrum_calls=0;copies=0;coefficients=0;complete=False

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'dispatchControls':DISPATCH,'workerOutputs':ALL_VOICES,'windowBlocks':None if ALL_VOICES else WINDOW_BLOCKS,'fixedSites':True,'siteCount':6,'records':records,'errors':errors,'starts':starts,'spectrumCount':spectrum_calls,'finalCount':final_calls,'copyCount':copies,'initializations':len(initialized),'envelopeBlocks':blocks,'duplicateEnvelopeReturns':duplicates,'envelopePending':len(envelope_pending),'coefficientCount':coefficients,'refreshCount':sum(r['stage']=='refresh' for r in records),'renderCount':sum(r['stage']==('envelopeResult' if ALL_VOICES else 'copy') and 'render' in r for r in records),'pending':len(pending),'complete':complete,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2,allow_nan=False))
def skipped_state(frame,v):
 o=scalar(frame,v,'Q');groups=scalar(frame,o+0xa8,'Q');assert 0<groups<=3
 layout=[list(unpack(frame,o+0xb0+16*i,'IIII')) for i in range(groups)]
 pointers={k:scalar(frame,v+off,'Q') for k,off in {'frequency':0x20,'modalDecay':0x48,'J':0x1b0,'K':0xe8,'S':0x110,'sinInverse':0x138,'radius':0x160,'energy':0x188,'weight':0x788}.items()}
 pointers.update(P=scalar(frame,o+0x58,'Q'),Q=scalar(frame,o+0x80,'Q'));coeff=scalar(frame,o+8,'Q');lanes=[]
 for group,(start,_,_,count) in enumerate(layout):
  for lane in range(start,(start+count+3)//4*4):
   index=lane//4*8+lane%4
   lanes.append({'lane':lane,'group':group,**{k:scalar(frame,p+lane*4) for k,p in pointers.items()},'A':scalar(frame,coeff+index*4),'B':scalar(frame,coeff+(index+4)*4)})
 return {'groups':layout,'lanes':lanes,'threshold':scalar(frame,v+0x774),'keepSlots':scalar(frame,v+0x718,'B'),'energyLayout':scalar(frame,o+0xe4,'I')}
def continuous_record(frame):
 # 7fc is not used by the reconstructed arithmetic. Preserve its raw word;
 # the legacy generic reader's float view may be NaN in this live window.
 target=capture_record(frame);v=register(frame,'x24')-0x18
 target['onset']={'remaining':scalar(frame,v+0x720,'I'),'settle':scalar(frame,v+0x724,'I'),'delay':scalar(frame,v+0x728,'I'),'square':bool(scalar(frame,v+0x72c,'B')),'sine':scalar(frame,v+0x730,'d'),'cosine':scalar(frame,v+0x738,'d'),'step':list(unpack(frame,v+0x740,'dd')),'filtered':bool(scalar(frame,v+0x750,'B')&1),'coefficients':list(unpack(frame,v+0x754,'fff')),'history':list(unpack(frame,v+0x760,'ff'))}
 target['uninterpretedWords']={'0x7fc':scalar(frame,v+0x7fc,'I')}
 del target['controls']['0x7fc']
 return target

def observed(frame,location,_):
 global starts,updates,final_calls,spectrum_calls,copies,coefficients,blocks,duplicates
 try:
  pc=frame.GetPCAddress().GetFileAddress();assert pc==location.GetAddress().GetFileAddress()
  stage=next(k for k,v in POINTS.items() if v==pc);thread=frame.GetThread().GetThreadID()
  last_seen[thread]={'pc':pc,'hits':hooks[stage].GetHitCount(),'stage':stage}
  if stage=='before':
   assert starts<5
   manager=register(frame,'x19');model=register(frame,'x25');old=register(frame,'x8');new=register(frame,'x22');host=scalar(frame,manager+0xc08,'Q');r=scalar(frame,manager+0xe00,'Q')
   previous=None
   if old:
    n=scalar(frame,old+0x2ed8,'Q');assert n<=16
    previous={'count':scalar(frame,old+0x6c,'I'),'duration':scalar(frame,old+0x2f20),'release':scalar(frame,old+0x2f24),'velocity':scalar(frame,old+0x78),'history':list(unpack(frame,old+0x2ee0,'f'*n)) if n else []}
   row={'stage':stage,'ordinal':starts,'thread':thread,'newVoice':hex(new),'oldVoice':hex(old),'note':scalar(frame,model+0x14),
    'inputs':{'mode':register(frame,'w27'),'newVelocity':regfloat(frame,'s9','f'),'hostRate':scalar(frame,host+0xc),'pedal':scalar(frame,r+0x90),'threshold':scalar(frame,r+0x9c),'old':previous}}
   assert new not in voices;row.update(epoch=starts,voice=hex(new),owner=hex(r),sourceX=scalar(frame,r+0xe4));voices[new]=starts;owners[new]=r;records.append(row);starts+=1
  elif stage=='weights':
   scratch=register(frame,'x19');params=scalar(frame,scratch+0x118,'Q');voice=params-0x2fb8
   assert voice in voices and spectrum_calls<10
   g=scalar(frame,params,'Q');shared=scalar(frame,g+0x1240,'Q');count=scalar(frame,scratch+0xf8,'I');assert 0<count<=4096
   read_array=lambda address:list(unpack(frame,address,'f'*count))
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'input':capture_inputs(frame,scratch),
    'controls':{'scale':scalar(frame,g+0xf0),'slopeBlend':scalar(frame,shared+0x274),'referenceTable':list(unpack(frame,scalar(frame,g+0x190,'Q'),'fff')),'referenceBlend':scalar(frame,scratch+0x70),'repeatFlag':scalar(frame,params+0x38,'B'),'u':scalar(frame,params+0x2c),'lowerBase':scalar(frame,g+0x1014),'lowerControl':scalar(frame,params+0x34),'lowerScale':scalar(frame,g+0xe7c),'lowerUSupport':scalar(frame,shared+0x4f8)},
    'count':count,'coordinates':vector(frame,g+0x7b8),'baseTable':read_array(scalar(frame,scalar(frame,scratch+0x1c0,'Q'),'Q')),
    'extraTables':{name:vector(frame,g+off) for name,off in {'floor':0xc98,'blend':0xcb0,'u':0xcc8,'history':0xc80,'control30':0xe60,'positive':0xce0,'negative':0xcf8}.items()},
    'extraControls':{'floor':scalar(frame,params+0x28),'blend':scalar(frame,scratch+0xc0),'u':scalar(frame,params+0x2c),'history':scalar(frame,scratch+0xb4),'control30':scalar(frame,params+0x30),'direction':scalar(frame,params+0xd4,'i')},
    'expWeights':read_array(scalar(frame,scratch+0x278,'Q')),'actual':{'slope':scalar(frame,scratch+0x230),'baseScale':scalar(frame,scratch+0x240),'extraTable':read_array(scalar(frame,scratch+0x2a0,'Q'))}})
   columns=records[-1]['input']['header'][0];n=register(frame,'w22');n2=register(frame,'w23');assert n<=1024 and n2<=1024
   array=lambda address,n,fmt:list(unpack(frame,address,fmt*n)) if n else []
   seed=scalar(frame,params+0x18,'Q');state=scalar(frame,scratch+0x88,'Q');history_count=scalar(frame,state,'Q') if state else 0;assert history_count<=16
   records[-1]['append']={'indices':array(scalar(frame,scratch+0x220,'Q'),n,'I'),'logAmplitudes':array(register(frame,'x21'),n,'f'),'secondIndices':array(scalar(frame,scratch+0x260,'Q'),n2,'I'),'secondLogAmplitudes':array(scalar(frame,scratch+0x250,'Q'),n2,'f'),'referenceFrequencies':array(scalar(frame,scratch+0x210,'Q'),columns,'f'),'secondReferenceFrequencies':array(scalar(frame,scratch+0x200,'Q'),columns,'f') if n2 else [],
    'tables':{name:vector(frame,g+off) for name,off in {'frequencies':0x278,'lowLog':0x290,'highLog':0x2a8,'decayMultipliers':0x2c0,'secondFrequencies':0x2d8,'secondLowLog':0x2f0,'secondHighLog':0x308,'secondDecay':0x320}.items()},
    'controls':{'scale':scalar(frame,g+0xf0),'logOffset':scalar(frame,g+0x112c),'frequencyLimit':scalar(frame,shared+0x84),'supportMode':scalar(frame,shared+0x170,'I'),'supportScale':regfloat(frame,'s13','f'),'amplitudeGain':regfloat(frame,'s14','f'),'secondAmplitudeGain':scalar(frame,g+0x1110),'repeatFlag':scalar(frame,params+0x38,'B'),'attenuation':scalar(frame,params+0x40),'singleSplit':scalar(frame,g+0x338),'splitCoordinates':vector(frame,shared+0x1b8)}}
   records[-1]['randomState']=array(seed,4,'I') if seed else None;records[-1]['randomScale']=scalar(frame,g+0x394)
   records[-1]['history']=array(state+8,history_count,'f') if state else []
   records[-1]['historyCurve']=curve(frame,g+0x398)
   records[-1]['historyControls']={'attenuation':scalar(frame,params+0x40),'randomScale':scalar(frame,g+0x388),'lower':scalar(frame,g+0x390),'upper':scalar(frame,g+0x38c),'blend':scalar(frame,g+0x3e8)}
   start,end=unpack(frame,g+0x7d0,'QQ');assert start<=end and (end-start)%4==0 and (end-start)//4<=8192
   records[-1]['postInputs']={'combinationRows':list(unpack(frame,start,'I'*((end-start)//4))) if end>start else [],'combinationCount':scalar(frame,shared+0x168,'I'),'combinationStart':scalar(frame,shared+0x16c,'I'),'weightCurve':curve(frame,g+0x1028),'decayCurve':curve(frame,g+0x1078),'velocity':scalar(frame,voice+0x78),'hostCount':scalar(frame,voice+0x68,'I'),'combinationCutoff':scalar(frame,shared+0x158),'velocityGainDb':scalar(frame,g+0x10cc),'combinationGain':scalar(frame,g+0x10c8),'amplitudeGain':scalar(frame,shared+0x88),'dampingBlend':scalar(frame,shared+0x164),'quadraticBlend':scalar(frame,shared+0x160),'spreadControl':scalar(frame,g+0x1e8),'quadraticDecay':scalar(frame,shared+0x15c),'noteIndex':scalar(frame,g+8,'I'),'expression':scalar(frame,voice+0x2fe8),'spreadVariationEnabled':bool(scalar(frame,shared+0x1e8,'I'))}
   scales=scalar(frame,g+0xc00,'Q')
   records[-1]['mergeControls']={'mode':scalar(frame,g+0xbf8,'I'),'primaryGain':scalar(frame,scales),'secondaryGain':scalar(frame,scales+4),'amplitudeGain':scalar(frame,shared+0x88),'mergeControl':scalar(frame,shared+0x5c0),'frequencyJitter':scalar(frame,g+0xc20),'frequencyOffset':scalar(frame,g+0xc24),'phaseSpread':scalar(frame,g+0xc2c),'timeSpread':scalar(frame,g+0xc30),'phaseStartRow':scalar(frame,shared+0x280,'I')}
   records[-1]['lateRandomInputs']={'distribution':{'enabled':scalar(frame,shared+0x2b4,'I'),'mode':scalar(frame,shared+0x2b8,'I'),'lower':scalar(frame,shared+0x2bc),'upper':scalar(frame,shared+0x2c0)},'base':scalar(frame,g+0xe88),'halfBase':bool(scalar(frame,voice+0x3088,'B')),'countA':scalar(frame,shared+0x3e0,'I'),'countB':scalar(frame,shared+0x144,'I'),'detuneBase':scalar(frame,shared+0x318),'detuneScale':scalar(frame,shared+0x31c),'detuneControl':scalar(frame,voice+0x2fe4),'noiseMode':scalar(frame,shared+0x18,'B'),'noiseDistribution':{'enabled':scalar(frame,shared+0x2d4,'I'),'mode':scalar(frame,shared+0x2d8,'I'),'lower':scalar(frame,shared+0x2dc),'upper':scalar(frame,shared+0x2e0)}}
   records[-1]['selectionSource']={'sampleRate':scalar(frame,g+0x98),'groupCount':scalar(frame,voice+0x2e90,'I'),'splitFrequency':scalar(frame,g+0x1164)}
   records[-1]['onsetInputs']={'models':list(unpack(frame,g+0x1018,'ffff')),'expression':scalar(frame,voice+0x2fec),'balance':scalar(frame,voice+0x7c),'noteIndex':scalar(frame,g+8,'I'),'square':bool(scalar(frame,shared+0xe0,'B')&1)}
   mode=scalar(frame,scratch+0xec,'I');assert mode in (0,1)
   if voice not in pending:pending[voice]={'thread':thread,'modes':set()}
   p=pending[voice];assert p['thread']==thread and mode not in p['modes'];p['modes'].add(mode)
   source=p.setdefault('selectionSource',records[-1]['selectionSource']);assert source==records[-1]['selectionSource']
   spectrum_calls+=1
  elif stage=='copy':
   voice=register(frame,'x19')
   if voice not in voices:return False
   n=scalar(frame,voice+0x3008,'Q');assert n<=16
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'counter':scalar(frame,voice+0x6c,'I'),
    'release':scalar(frame,voice+0x2f24),'modalPosition':scalar(frame,voice+0xab0),
    'producerActual':{'repeatFlag':scalar(frame,voice+0x2ff0,'B'),'age':scalar(frame,voice+0x2ffc),'oldVelocity':scalar(frame,voice+0x3000),'attenuation':scalar(frame,voice+0x2ff8),'history':list(unpack(frame,voice+0x3010,'f'*n)) if n else []}})
   if not ALL_VOICES and voices[voice]==0 and 0<=records[-1]['counter']<WINDOW_END:
    v=voice+0x168;o=scalar(frame,v,'Q');groups=scalar(frame,o+0xa8,'Q');assert 0<groups<=3
    layout=[list(unpack(frame,o+0xb0+16*i,'IIII')) for i in range(groups)]
    samples=scalar(frame,v+0x768,'I');delay=scalar(frame,v+0x76c,'I');assert samples==64
    matrix=register(frame,'x23');count=scalar(frame,matrix,'Q');assert count==groups
    channels=[]
    for i in range(count):
     descriptor=matrix+8+56*i;rows,stride,n,sample_stride=unpack(frame,descriptor,'IIII');assert rows==1 and n==64
     channels.append(list(unpack(frame,scalar(frame,descriptor+16,'Q'),'f'*n)))
    e=v+0x840
    records[-1]['render']={'layout':layout,'samples':samples,'delay':delay,'modalCounter':scalar(frame,v+0x10,'I'),'channels':channels,'spread':scalar(frame,voice+0x128),
     'processor':{'smooth':{hex(off):scalar(frame,e+off) for off in (0x5c,0x60)},'enabled':scalar(frame,e+0x6c,'B')}}
   copies+=1
  elif stage=='final':
   v=register(frame,'x24')-0x18;voice=v-0x168
   if voice not in voices:return False
   if scalar(frame,v+0x18,'B')!=1:
    counter=scalar(frame,v+0x10,'I')
    if counter>0 and (ALL_VOICES or voices[voice]==0 and counter<=WINDOW_END):
     records.append({'stage':'refresh','thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'target':continuous_record(frame),
      'positionInputs':{'position':scalar(frame,v+0x8d4),'referenceFrequency':scalar(frame,v+0x918),'rolloff':scalar(frame,v+0x908),'cutoffIndex':scalar(frame,v+0x928,'I')}})
    return False
   p=pending.pop(voice);assert p['modes']=={0,1}
   seed=scalar(frame,voice+0x2fd0,'Q');n=scalar(frame,voice+0x2ed8,'Q');assert n<=16
   target=continuous_record(frame);assert target['initial_flag']==1 and target['sample_counter']==0
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),
    'randomState':list(unpack(frame,seed,'IIII')) if seed else None,'history':list(unpack(frame,voice+0x2ee0,'f'*n)) if n else [],
    'feedbackGain':scalar(frame,voice+0x29f8),'feedbackDecay':scalar(frame,voice+0x29fc),
    'selectionControls':{**p['selectionSource'],'alignment':scalar(frame,scalar(frame,v,'Q')+0xe8,'I'),'bypassAmplitudeFilter':bool(scalar(frame,v+0x718,'B')&1),'amplitudeThreshold':scalar(frame,v+0x774),'projectedThreshold':scalar(frame,v+0x778)},
    'positionInputs':{'position':scalar(frame,v+0x8d4),'referenceFrequency':scalar(frame,v+0x918),'rolloff':scalar(frame,v+0x908),'cutoffIndex':scalar(frame,v+0x928,'I')},
    'target':target});final_calls+=1
  elif stage=='coefficients':
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   records.append({'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'owner':hex(owners[voice]),'sourceX':scalar(frame,owners[voice]+0xe4),'currentX':scalar(frame,voice+0x2f38),'u':scalar(frame,v+0x8cc) if DISPATCH else regfloat(frame,'s1','f'),'modalX':scalar(frame,v+0x8c4),'releaseFlag':scalar(frame,v+0x924,'B'),
    'inputs':{'polynomial':list(unpack(frame,v+0x914,'f'))+list(unpack(frame,v+0x94c,'ffff')),'cubicScale':scalar(frame,v+0x91c),'rateScale':scalar(frame,v+0x910),'gainScale':scalar(frame,v+0x90c),'cubicGainScale':scalar(frame,v+0x920)},
    'actual':{'duration':scalar(frame,v+0x944),'rate':scalar(frame,v+0x7e4),'gain':scalar(frame,v+0x7b0)}});coefficients+=1
   if DISPATCH:
    flag=scalar(frame,v+0x80c,'B');phase=scalar(frame,v+0x814,'I');factor=scalar(frame,v+0x810,'I')
    assert flag in (0,1) and factor==1 and phase==0
    r=records[-1];r['dispatch']={'required':flag==1,'flag':flag,'phase':phase,'factor':factor,'initial':scalar(frame,v+0x18,'B'),'committedU':scalar(frame,v+0x8c8)}
    if r['counter']>0 and (ALL_VOICES or r['epoch']==0 and r['counter']<=WINDOW_END) and not r['dispatch']['required']:r['skippedState']=skipped_state(frame,v)
  else:
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   assert blocks<20000
   result={'stage':stage,'thread':thread,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':scalar(frame,v+0x10,'I'),'position':scalar(frame,v+0x948),'timestep':scalar(frame,v+0x8fc),'duration':scalar(frame,v+0x944),'baseDuration':scalar(frame,v+0x914),'samples':scalar(frame,register(frame,'x20')+0x10,'I')}
   if {k:value for k,value in envelope_completed.get(thread,{}).items() if k not in ('render','postState')}==result:
    records.append({**result,'stage':'duplicateEnvelopeResult'});duplicates+=1
   else:
    expected=(sample_counters.get(voices[voice],0)+result['samples']) & 0xffffffff
    assert result['counter']==expected, ('Envelope counter gap',voices[voice],expected,result['counter'])
    sample_counters[voices[voice]]=expected
    if ALL_VOICES:
     matrix=register(frame,'x20');count=scalar(frame,matrix,'Q');assert 0<count<=3 and result['samples']==64
     channels=[]
     for i in range(count):
      descriptor=matrix+8+56*i;rows,stride,n,sample_stride=unpack(frame,descriptor,'IIII');assert rows==1 and n==64
      channels.append(list(unpack(frame,scalar(frame,descriptor+16,'Q'),'f'*n)))
     o=scalar(frame,v,'Q');e=v+0x840
     result['render']={'samples':64,'delay':scalar(frame,v+0x76c,'I'),'channels':channels,'processor':{'smooth':{hex(off):scalar(frame,e+off) for off in (0x5c,0x60)},'enabled':scalar(frame,e+0x6c,'B')}}
     result['postState']={'groups':[list(unpack(frame,o+0xb0+16*i,'IIII')) for i in range(count)],'threshold':scalar(frame,v+0x774),'keepSlots':scalar(frame,v+0x718,'B'),'energyLayout':scalar(frame,o+0xe4,'I'),'lanes':[]}
     pointers={'P':scalar(frame,o+0x58,'Q'),'Q':scalar(frame,o+0x80,'Q'),'energy':scalar(frame,v+0x188,'Q')}
     for group,(start,_,_,logical) in enumerate(result['postState']['groups']):
      for lane in range(start,(start+logical+3)//4*4):result['postState']['lanes'].append({'lane':lane,'group':group,**{k:scalar(frame,p+lane*4) for k,p in pointers.items()}})
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
 assert starts==5 and spectrum_calls==10 and final_calls==5 and coefficients>0 and blocks>0 and copies>0 and not envelope_pending and not pending and not errors
 if ALL_VOICES:
  for epoch in range(5):
   decisions=[r for r in records if r['stage']=='coefficients' and r['epoch']==epoch]
   rendered=[r for r in records if r['stage']=='envelopeResult' and r['epoch']==epoch]
   assert decisions and len(decisions)==len(rendered)
   assert [r['counter'] for r in decisions]==list(range(0,len(decisions)*64,64))
   assert [r['counter'] for r in rendered]==list(range(64,(len(rendered)+1)*64,64)) and all('render' in r and 'postState' in r for r in rendered)
   assert [r['target']['sample_counter'] for r in records if r['stage']=='refresh' and r['epoch']==epoch]==[r['counter'] for r in decisions if r['counter']>0 and r['dispatch']['required']]
  for h in hooks.values():h.SetEnabled(False)
  complete=True;save();return
 assert [r['counter'] for r in records if r['stage']=='copy' and 'render' in r]==list(range(0,WINDOW_END,64))
 expected=list(range(64,WINDOW_END+1,64))
 if DISPATCH:
  decisions=[r for r in records if r['stage']=='coefficients' and r['epoch']==0 and r['counter']<=WINDOW_END]
  assert [r['counter'] for r in decisions]==list(range(0,WINDOW_END+1,64))
  expected=[r['counter'] for r in decisions if r['counter']>0 and r['dispatch']['required']]
 assert [r['target']['sample_counter'] for r in records if r['stage']=='refresh']==expected
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
   assert reason in (lldb.eStopReasonBreakpoint,lldb.eStopReasonException,lldb.eStopReasonTrace)
   frame=thread.GetFrameAtIndex(0);pc=frame.GetPCAddress().GetFileAddress();ids=[thread.GetStopReasonDataAtIndex(i) for i in range(thread.GetStopReasonDataCount())]
   if reason==lldb.eStopReasonTrace:
    assert ids==[] and pc==POINTS['envelopeResult']+4
    seen=last_seen[thread.GetThreadID()];assert seen['pc']==POINTS['envelopeResult'] and seen['hits']==hooks['envelopeResult'].GetHitCount()
    row=envelope_completed[thread.GetThreadID()];v=register(frame,'x19')
    assert row['modal']==hex(v) and row['voice']==hex(v-0x168) and row['epoch']==voices[v-0x168]
    assert row['counter']==scalar(frame,v+0x10,'I') and row['position']==scalar(frame,v+0x948)
   elif reason==lldb.eStopReasonException:
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
