"""LLDB read-only capture at the completed 16-lane free-response block.

Set PIANOTEQ_CAPTURE_DIR, import in LLDB, then run the independent signed copy.
Requires pianoteq_damper_runtime_capture.py for exact __text verification.
No software, return, or temporary breakpoints and no program-state writes.
"""
import json
import os
from pathlib import Path
import struct
import traceback
import lldb
from pianoteq_damper_runtime_capture import verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
ROOT.mkdir(parents=True, exist_ok=True)
records = []
errors = []
hook = None


def save():
    (ROOT / 'runtime.json').write_text(json.dumps({
        'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
        'address': '0x1007c0d50',
    }, indent=2))


def register(frame, name):
    return frame.FindRegister(name).GetValueAsUnsigned()


def floats(frame, address, count):
    assert address > 4096 and 0 < count <= 8192
    error = lldb.SBError()
    value = frame.GetThread().GetProcess().ReadMemory(address, count * 4, error)
    if error.Fail() or len(value) != count * 4:
        raise RuntimeError(str(error))
    return list(struct.unpack('<' + 'f' * count, value))


def lanes(frame, name):
    data = frame.FindRegister(name).GetData()
    error = lldb.SBError()
    raw = bytes(data.GetUnsignedInt8(error, i) for i in range(16))
    if error.Fail():
        raise RuntimeError(str(error))
    return list(struct.unpack('<4f', raw))


def observed(frame, bp, internal_dict):
    if len(records) >= 128:
        return False
    try:
        count = register(frame, 'w21')
        assert 0 < count <= 8192
        # x9/x8 memory has not yet been overwritten by block-tail state stores.
        record = {
            'samples': count,
            'P_pointer': register(frame, 'x9'),
            'Q_pointer': register(frame, 'x8'),
            'coefficient_pointer': register(frame, 'x20'),
            'output_pointer': register(frame, 'x19'),
            'remaining_groups_x11': register(frame, 'x11'),
            'remaining_groups_x24': register(frame, 'x24'),
            'sp': register(frame, 'sp'),
            'output_after': floats(frame, register(frame, 'x19'), (count+3)//4*4),
            'thread': frame.GetThread().GetThreadID(),
            'P_before': floats(frame, register(frame, 'x9'), 16),
            'Q_before': floats(frame, register(frame, 'x8'), 16),
            'coefficients_interleaved': floats(frame, register(frame, 'x20'), 32),
            'P_after': sum((lanes(frame, r) for r in ('v21','v20','v23','v16')), []),
            'Q_after': sum((lanes(frame, r) for r in ('v22','v19','v18','v17')), []),
        }
        records.append(record)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, internal_dict):
    global hook
    target = debugger.GetSelectedTarget()
    module = target.GetModuleAtIndex(0)
    spec = module.GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x1007c0d50 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
