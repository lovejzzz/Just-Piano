"""Two fixed read-only points: new voice -> release-control initialization."""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'before':0x10035ef10,'initialize':0x10043e048}
records=[];errors=[];hooks={};voices=set();initialized=set();complete=False

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'fixedSites':True,'records':records,'errors':errors,'complete':complete,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2,allow_nan=False))
def observed(frame,location,_):
 try:
  pc=frame.GetPCAddress().GetFileAddress();assert pc==location.GetAddress().GetFileAddress()
  stage=next(k for k,v in POINTS.items() if v==pc)
  if stage=='before':
   voice=register(frame,'x22');assert voice not in voices and len(voices)<5;voices.add(voice)
   records.append({'stage':stage,'voice':hex(voice),'ordinal':len(voices)-1,'note':scalar(frame,register(frame,'x25')+0x14)})
  else:
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
  assert len(records)<=10 and all(h.IsEnabled() for h in hooks.values());save();return False
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def finish():
 global complete
 assert len(voices)==5 and initialized==voices and not errors
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
