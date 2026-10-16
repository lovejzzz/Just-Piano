"""LLDB read-only single-point capture of the internal eight-lane exp helper."""
import json
import os
from pathlib import Path
import struct
import traceback

from pianoteq_damper_runtime_capture import memory, verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    if len(records) >= 128:
        return False
    try:
        import lldb
        pointer = frame.FindRegister('x0').GetValueAsUnsigned()
        inputs = list(struct.unpack('<8f', memory(frame, pointer, 32)))
        outputs = []
        for name in ('v0', 'v1'):
            d = frame.FindRegister(name).GetData()
            error = lldb.SBError()
            raw = bytes(d.GetUnsignedInt8(error, i) for i in range(16))
            if error.Fail():
                raise RuntimeError(str(error))
            outputs.extend(struct.unpack('<4f', raw))
        records.append({'inputs': inputs, 'outputs': outputs,
                        'thread': frame.GetThread().GetThreadID()})
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    global hook
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x1009a31a0 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
