"""Read runtime support-mode curve bindings from the immutable model."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import verify_text, scalar
from pianoteq_capture_source_weights import curve
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINT = 0x100676980
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'point': hex(POINT), 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        note = regfloat(frame, 's8', 'f')
        if note not in (21, 60, 69, 72, 80, 108) or any(r['note'] == note for r in records):
            return False
        base = frame.FindRegister('x0').GetValueAsUnsigned()
        records.append({'note': note, 'supportMode': scalar(frame, base + 0x10e8, 'I'),
                        'curves': {hex(offset): curve(frame, base + offset) for offset in
                                   (0x1190, 0x11e0, 0x1230, 0x1280, 0x1320, 0x1370, 0x13c0, 0x1410)}})
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
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        f'breakpoint set --hardware --address {POINT:#x} --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
