"""Read-only attached observation: official rattle control -> x -> coefficients.

Requires an owned, audio-running debug copy and host-written case.json before
notes are sent through the ordinary JSON-RPC MIDI interface. No target calls.
"""
import json,os,traceback
from pathlib import Path
from pianoteq_damper_runtime_capture import scalar,unpack,verify_text
from pianoteq_capture_recurrence import register
from pianoteq_capture_source_amplitude import regfloat
ROOT=Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINTS={'source':0x10035f2c4,'coefficients':0x1006e5360}
records=[];errors=[];hooks={};voices={};starts=0;coefficients=0;complete=False

def save():
 (ROOT/'runtime.json').write_text(json.dumps({'schema':1,'fixedSites':True,'siteCount':2,'records':records,'errors':errors,'starts':starts,'coefficientCount':coefficients,'counterLimit':8192,'complete':complete,'activeSites':sum(h.IsEnabled() for h in hooks.values())},indent=2,allow_nan=False))
def observed(frame,location,_):
 global starts,coefficients
 try:
  pc=frame.GetPCAddress().GetFileAddress();assert pc==location.GetAddress().GetFileAddress()
  stage=next(k for k,v in POINTS.items() if v==pc)
  if stage=='source':
   source=register(frame,'x12');voice=register(frame,'x22');case=json.loads((ROOT/'case.json').read_text());assert case['ordinal']==starts and starts<5
   voices[voice]=starts;records.append({'stage':stage,'epoch':starts,'voice':hex(voice),'source':hex(source),'case':case,'sourceX':scalar(frame,source+0xe4),'initialX':scalar(frame,voice+0x306c)})
   starts+=1
  else:
   v=register(frame,'x19');voice=v-0x168
   if voice not in voices:return False
   counter=scalar(frame,v+0x10,'I')
   if counter>8192:return False
   records.append({'stage':stage,'epoch':voices[voice],'voice':hex(voice),'modal':hex(v),'counter':counter,
    'inputs':{'x':scalar(frame,v+0x8c4),'u':regfloat(frame,'s1','f'),'releaseFlag':scalar(frame,v+0x924,'B'),'polynomial':list(unpack(frame,v+0x914,'f'))+list(unpack(frame,v+0x94c,'ffff')),'cubicScale':scalar(frame,v+0x91c),'rateScale':scalar(frame,v+0x910),'gainScale':scalar(frame,v+0x90c),'cubicGainScale':scalar(frame,v+0x920)},
    'actual':{'duration':scalar(frame,v+0x944),'rate':scalar(frame,v+0x7e4),'gain':scalar(frame,v+0x7b0)}})
   coefficients+=1
  assert len(records)<2000 and all(h.IsEnabled() for h in hooks.values());save();return False
 except Exception:
  errors.append(traceback.format_exc())
  for h in hooks.values():h.SetEnabled(False)
  save();return True

def finish():
 global complete
 assert starts==5 and coefficients>=5 and not errors
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
