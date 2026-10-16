"""Observe active repeated-strike amplitude variation without process writes."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_final_excitation import table

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_REPEAT_STAGE', 'before')
POINT = {'before': 0x100695860, 'randomized': 0x100695940}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({'schema': 1, 'stage': STAGE, 'point': hex(POINT),
        'records': records, 'errors': errors, 'hits': hook.GetHitCount() if hook else 0}, indent=2))


def observed(frame, bp, _):
    try:
        scratch = frame.FindRegister('x19').GetValueAsUnsigned()
        params = scalar(frame, scratch + 0x118, 'Q')
        flag, attenuation = scalar(frame, params + 0x38, 'B'), scalar(frame, params + 0x40)
        if flag != 1 or attenuation <= 0:
            return False
        assert len(records) < 32
        g = scalar(frame, params, 'Q')
        records.append({'note': scalar(frame, g + 0x14), 'mode': scalar(frame, scratch + 0xec, 'I'),
            **table(frame, scalar(frame, scratch + 0xb8, 'Q')),
            'baseRows': scalar(frame, scratch + 0xf8, 'I'),
            'randomState': list(unpack(frame, scalar(frame, params + 0x18, 'Q'), 'IIII')),
            'controls': {'repeatFlag': flag, 'attenuation': attenuation, 'scale': scalar(frame, g + 0x394)}})
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
        f'breakpoint set --hardware --address {POINT:#x} --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
