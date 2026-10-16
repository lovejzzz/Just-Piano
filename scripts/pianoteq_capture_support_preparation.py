"""Read runtime support-mode curve bindings from the immutable model."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import verify_text, scalar
from pianoteq_capture_source_weights import curve
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_modal_source import vector, matrix

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_SUPPORT_STAGE', 'frequency')
POINT = {'frequency': 0x100765f20, 'normalization': 0x10051af20, 'normalized': 0x10051b1ec}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'stage': STAGE, 'point': hex(POINT), 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        if STAGE == 'normalized' and reg('x30') not in (0x1001c70a4, 0x1001c721c):
            return False
        g = reg('x19')
        note = scalar(frame, g + 0x14)
        if note not in (21, 60, 69, 72, 74, 80, 108, 109):
            return False
        assert len(records) < 256
        if STAGE == 'frequency':
            family = {0x278: 'first', 0x2d8: 'second'}.get(reg('x0') - g)
            branch = {0x290: 'low', 0x2a8: 'high', 0x2f0: 'low', 0x308: 'high'}.get(reg('x1') - g)
            assert family and branch
            flags = reg('w3')
            record = {'note': note, 'family': family, 'branch': branch,
                      'frequencies': vector(frame, reg('x0')), 'inputDB': vector(frame, reg('x1')),
                      'controls': {'referenceFrequency': regfloat(frame, 's0', 'f'),
                                   'blend': regfloat(frame, 's1', 'f'), 'editFlag': flags},
                      'baseCurve': curve(frame, reg('x4')),
                      'editCurve': curve(frame, reg('x2')) if flags & 1 else None}
        elif STAGE == 'normalization':
            family = {0x278: 'first', 0x2d8: 'second'}.get(reg('x1') - g)
            assert family
            record = {'note': note, 'family': family, 'frequencies': vector(frame, reg('x1')),
                      'inputLowDB': vector(frame, reg('x3')), 'inputHighDB': vector(frame, reg('x4')),
                      'matrix': matrix(frame, reg('x0')), 'correction': vector(frame, reg('x2')),
                      'referenceAmplitude': regfloat(frame, 's0', 'f')}
        else:
            first = reg('x30') == 0x1001c70a4
            record = {'note': note, 'family': 'first' if first else 'second',
                      'frequencies': vector(frame, g + (0x278 if first else 0x2d8)),
                      'lowDB': vector(frame, g + (0x290 if first else 0x2f0)),
                      'highDB': vector(frame, g + (0x2a8 if first else 0x308))}
        records.append(record)
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
