"""Read the B-row and runtime controls before source-weight transformation.

Single fixed hardware point 0x1004cb68c, exact authorized debug build only.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import verify_text, scalar
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': '0x1004cb68c', 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def curve(frame, address):
    return {'x': vector(frame, address + 0x18), 'y': vector(frame, address + 0x30),
            'dimension': scalar(frame, address + 0x48, 'I'),
            'log_x': scalar(frame, address + 0x4c, 'B'),
            'special_mode': scalar(frame, address + 0x4d, 'B')}


def observed(frame, bp, _):
    try:
        if records:
            return False
        register = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        g = register('x1')
        if scalar(frame, g + 0x14) != 69:
            return False
        records.append({
            'note': scalar(frame, g + 0x14), 'note_index': scalar(frame, g + 8, 'I'),
            'weights': vector(frame, register('x0') + 0x18),
            'coordinates': vector(frame, register('x5')),
            'active_edit_curve': bool(register('x3') & 0xffffffff),
            'edit_curve': curve(frame, register('x2')),
            'base_curve': curve(frame, register('x4')),
            'controls': {name: regfloat(frame, name, 'f') for name in ('s0', 's1', 's2', 's3')},
            'G_controls': {hex(o): scalar(frame, g + o) for o in (0x28, 0x78, 0xd8, 0xf0)},
            'harmonic_edits': vector(frame, g + 0xc38),
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
        'breakpoint set --hardware --address 0x1004cb68c --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
