"""Read-only, attached repeated-strike producer and hardness consumer capture."""
import os,json,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_excitation_slopes import capture_inputs
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'before':0x10035ef10,'after':0x10035f6bc,'hardness':0x100693ff8,'expInput':0x10035f698,'expResult':0x10035f69c}
records=[];errors=[];transitions=[];hooks={};pending={};producer_count=0;hardness_count=0
LIMIT=5
complete=False

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'records':records,'errors':errors,'transitions':transitions,'producerCount':producer_count,'hardnessCount':hardness_count,'complete':complete,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2,allow_nan=False))
def phase(next_stage):
 desired={'idle':{'before','hardness'},'producer':{'after','hardness','expInput'},'expResult':{'after','hardness','expResult'}}[next_stage]
 for n,h in hooks.items():
  if n not in desired:h.SetEnabled(False)
 for n in desired:hooks[n].SetEnabled(True)
 active=[n for n,h in hooks.items() if h.IsEnabled()];assert set(active)==desired and len(active)<=4
 transitions.append({'next':next_stage,'enabled':active,'activeSites':len(active),'recordCount':len(records)})
def observed(frame,location,_):
 global producer_count,hardness_count
 try:
  stage=next(n for n,v in POINTS.items() if v==frame.GetPCAddress().GetFileAddress());thread=frame.GetThread().GetThreadID()
  if stage=='before':
   assert producer_count<LIMIT and thread not in pending
   manager=register(frame,'x19');model=register(frame,'x25');old=register(frame,'x8');new=register(frame,'x22');host=scalar(frame,manager+0xc08,'Q');r=scalar(frame,manager+0xe00,'Q')
   previous=None
   if old:
    n=scalar(frame,old+0x2ed8,'Q');assert n<=16
    previous={'count':scalar(frame,old+0x6c,'I'),'duration':scalar(frame,old+0x2f20),'release':scalar(frame,old+0x2f24),'velocity':scalar(frame,old+0x78),'history':list(unpack(frame,old+0x2ee0,'f'*n)) if n else []}
   row={'stage':stage,'ordinal':producer_count,'thread':thread,'newVoice':hex(new),'oldVoice':hex(old),'note':scalar(frame,model+0x14),
    'inputs':{'mode':register(frame,'w27'),'newVelocity':regfloat(frame,'s9','f'),'hostRate':scalar(frame,host+0xc),'pedal':scalar(frame,r+0x90),'threshold':scalar(frame,r+0x9c),'old':previous}}
   records.append(row);pending[thread]=row;phase('producer')
  elif stage in ('expInput','expResult'):
   assert thread in pending
   records.append({'stage':stage,'ordinal':pending[thread]['ordinal'],'thread':thread,'value':regfloat(frame,'s0','f')});phase('expResult' if stage=='expInput' else 'producer')
  elif stage=='after':
   row=pending.pop(thread);new=int(row['newVoice'],16);n=scalar(frame,new+0x3008,'Q');assert n<=16
   records.append({'stage':stage,'ordinal':row['ordinal'],'thread':thread,'newVoice':row['newVoice'],'actual':{'repeatFlag':scalar(frame,new+0x2ff0,'B'),'age':scalar(frame,new+0x2ffc),'oldVelocity':scalar(frame,new+0x3000),'attenuation':scalar(frame,new+0x2ff8),'history':list(unpack(frame,new+0x3010,'f'*n)) if n else []}})
   producer_count+=1;phase('idle')
  else:
   scratch=register(frame,'x19');params=scalar(frame,scratch+0x118,'Q')
   assert hardness_count<2*LIMIT
   records.append({'stage':stage,'thread':thread,'newVoice':hex(params-0x2fb8),'input':capture_inputs(frame,scratch),'actual':{'primary':regfloat(frame,'s1','f'),'secondary':regfloat(frame,'s8','f'),'referenceFrequency':regfloat(frame,'s11','f')}})
   hardness_count+=1
  save();return False
 except Exception:errors.append(traceback.format_exc());save();return True

def finish():
 global complete
 assert producer_count==LIMIT and not pending and not errors
 starts=[r for r in records if r['stage']=='before']
 for r in starts:
  consumers=[c for c in records if c['stage']=='hardness' and c['newVoice']==r['newVoice']]
  assert len([c for c in consumers if c['input']['mode']==0])==1
  assert len([c for c in consumers if c['input']['mode']==1])<=1
 for h in hooks.values():h.SetEnabled(False)
 complete=True;save()

def __lldb_init_module(debugger,_):
 import lldb
 assert not (ROOT/'runtime.json').exists()
 target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec();verify_text(Path(spec.GetDirectory())/spec.GetFilename())
 for name,address in POINTS.items():
  result=lldb.SBCommandReturnObject();debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"',result);assert result.Succeeded()
  h=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1);h.SetEnabled(False);h.SetScriptCallbackFunction(__name__+'.observed');hooks[name]=h
 phase('idle');save()
