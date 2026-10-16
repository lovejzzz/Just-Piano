"""Single fixed hardware point: actual exp weight -> modal amplitude product."""
import json
import traceback
import lldb
from pathlib import Path
from pianoteq_capture_excitation_spectrum import ROOT, reg, pointer, floats, scalar, verify_text
records,errors=[],[]
hook=None


def save():
    (ROOT/'runtime.json').write_text(json.dumps({'records':records,'errors':errors,
        'hits':hook.GetHitCount() if hook else 0,'address':'0x100695190'},indent=2))


def observed(frame,bp,internal_dict):
    if len(records)>=512:return False
    try:
        scratch=reg(frame,'x19');mode=reg(frame,'x8');index=reg(frame,'w17')
        original=floats(frame,reg(frame,'x16')+4*index,1)[0]
        raw_weight=floats(frame,pointer(frame,scratch+0x278)+4*mode,1)[0]
        records.append({'mode':mode,'index':index,'thread':frame.GetThread().GetThreadID(),
            'weight_raw':raw_weight,'weight_applied':scalar(frame,'s2'),
            'amplitude_before':original,'amplitude_after':scalar(frame,'s3')})
        save();return False
    except Exception:
        errors.append(traceback.format_exc());save();return True


def __lldb_init_module(debugger,internal_dict):
    global hook
    target=debugger.GetSelectedTarget();spec=target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory())/spec.GetFilename())
    result=lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x100695190 --shlib "Pianoteq 9"',result)
    if not result.Succeeded():raise RuntimeError(result.GetError())
    hook=target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
    hook.SetScriptCallbackFunction(__name__+'.observed');save()
