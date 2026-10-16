"""Observe the primary support-mode history around its real update branch."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_final_excitation import table
from pianoteq_capture_source_weights import curve

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_HISTORY_STAGE', 'before')
POINT = {'before': 0x100695940, 'after': 0x100696024}[STAGE]
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
        if scalar(frame, scratch + 0xec, 'I') != 0 or scalar(frame, params + 0x38, 'B') != 1 or scalar(frame, params + 0x40) <= 0:
            return False
        assert len(records) < 16
        g = scalar(frame, params, 'Q')
        state = scalar(frame, scratch + 0x88, 'Q')
        count = scalar(frame, state, 'Q')
        assert count <= 16
        records.append({'note': scalar(frame, g + 0x14), 'mode': 0,
            **table(frame, scalar(frame, scratch + 0xb8, 'Q')),
            'baseRows': scalar(frame, scratch + 0xf8, 'I'),
            'history': list(unpack(frame, state + 8, 'f' * count)) if count else [],
            'randomState': list(unpack(frame, scalar(frame, params + 0x18, 'Q'), 'IIII')),
            'curve': curve(frame, g + 0x398),
            'controls': {'attenuation': scalar(frame, params + 0x40), 'randomScale': scalar(frame, g + 0x388),
                         'lower': scalar(frame, g + 0x390), 'upper': scalar(frame, g + 0x38c),
                         'blend': scalar(frame, g + 0x3e8)}})
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
