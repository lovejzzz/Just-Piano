"""Read original source decay/weights before 182960 modifies its outputs.

Fixed hardware point 0x100182b40; only the exact authorized debug build.
A frequency window selects the A4 records; matching must use complete tables.
"""
import json
import os
from pathlib import Path
import struct
import traceback
from pianoteq_damper_runtime_capture import verify_text, scalar
from pianoteq_capture_modal_source import matrix, vector

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': '0x100182b40', 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def regfloat(frame, name, code):
    import lldb
    error = lldb.SBError()
    data = frame.FindRegister(name).GetData()
    word = data.GetUnsignedInt64(error, 0) if code == 'd' else data.GetUnsignedInt32(error, 0)
    if error.Fail():
        raise RuntimeError(str(error))
    return struct.unpack('<' + code, struct.pack('<Q' if code == 'd' else '<I', word))[0]


def observed(frame, bp, _):
    try:
        if len(records) >= 4:
            return False
        frequency_address = frame.FindRegister('x28').GetValueAsUnsigned()
        begin = scalar(frame, frequency_address, 'Q')
        first = scalar(frame, begin)
        if not 435 < first < 445:
            return False
        sp = frame.FindRegister('sp').GetValueAsUnsigned()
        records.append({
            'frequency': matrix(frame, frequency_address),
            'raw_decay': matrix(frame, frame.FindRegister('x23').GetValueAsUnsigned()),
            'weights': vector(frame, scalar(frame, sp + 0x50, 'Q')),
            'component_count': frame.FindRegister('x19').GetValueAsUnsigned(),
            'rows': frame.FindRegister('x25').GetValueAsUnsigned(),
            'eta': regfloat(frame, 'd12', 'd'),
            'added_decay': regfloat(frame, 's11', 'f'),
            'shape': regfloat(frame, 's9', 'f'),
            'shape_db': regfloat(frame, 's10', 'f'),
            'random_amount': regfloat(frame, 's13', 'f'),
        })
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
        'breakpoint set --hardware --address 0x100182b40 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
