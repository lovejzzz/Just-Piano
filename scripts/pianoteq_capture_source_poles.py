"""Observe actual per-mode coupled-pole arguments before 6d2c10.

One hardware point 194d68; G is saved at [sp+20], not the overwritten x25.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import verify_text, scalar, unpack
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': '0x100194d68', 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        sp = frame.FindRegister('sp').GetValueAsUnsigned()
        g = scalar(frame, sp + 0x20, 'Q')
        if scalar(frame, g + 0x14) != 69 or len(records) >= 128:
            return False
        cache = frame.FindRegister('x10').GetValueAsUnsigned()
        address = frame.FindRegister('x1').GetValueAsUnsigned()
        begin, end, capacity = unpack(frame, address, 'QQQ')
        count = frame.FindRegister('x0').GetValueAsUnsigned()
        assert 0 < count <= 16 and end - begin == count * 8 and end <= capacity
        records.append({
            'note_index': scalar(frame, g + 8, 'I'),
            'cache_mode': scalar(frame, cache + 0xe4, 'I'),
            'N': count, 'lambda': list(unpack(frame, begin, 'd' * count)),
            'parameters': {name: regfloat(frame, f'd{i}', 'd') for i, name in enumerate(
                ('p', 'q', 'ref', 'center', 'mode', 'decay_floor_ratio'))},
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
        'breakpoint set --hardware --address 0x100194d68 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
