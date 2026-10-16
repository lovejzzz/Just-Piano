"""Observe the two hardness-derived spectrum controls after their scaling."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_modal_source import vector
from pianoteq_capture_final_excitation import table
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINT = 0x100693ff8
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'point': hex(POINT), 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def capture_inputs(frame, scratch):
    params = scalar(frame, scratch + 0x118, 'Q')
    g = scalar(frame, params, 'Q')
    shared = scalar(frame, g + 0x1240, 'Q')
    return {'note': scalar(frame, g + 0x14), 'mode': scalar(frame, scratch + 0xec, 'I'),
                    **table(frame, scalar(frame, scratch + 0xb8, 'Q')),
                    'controls': {'velocity': scalar(frame, params + 0x20),
                                 'blendFloor': scalar(frame, params + 0x28),
                                 'inputBlend': scalar(frame, scratch + 0xc0),
                                 'u': scalar(frame, params + 0x2c),
                                 'attenuation': scalar(frame, params + 0x40),
                                 'repeatFlag': scalar(frame, params + 0x38, 'B'),
                                 'age': scalar(frame, params + 0x44),
                                 'repeatScale': scalar(frame, g + 0x380),
                                 'direction': scalar(frame, params + 0xd4, 'i'),
                                 'positiveGain': scalar(frame, g + 0x23c),
                                 'negativeGain': scalar(frame, g + 0x240),
                                 'sharedBlendCoefficients': list(unpack(frame, shared + 0xb8, 'ff')),
                                 'hardnessMode': scalar(frame, params + 0xd0, 'B'),
                                 'randomFlags': [scalar(frame, scalar(frame, g + 0xf88, 'Q') + off, 'I')
                                                 for off in (0, 0x10, 0x20)],
                                 'randomSeedPresent': bool(scalar(frame, params + 0x18, 'Q')),
                                 'fallbackFrequency': scalar(frame, g + 0x78)},
                    'curves': {name: {'knots': vector(frame, g + x), 'values': vector(frame, g + y),
                                      'edits': vector(frame, g + z)}
                               for name, x, y, z in [('primary', 0xef8, 0xf10, 0xf58), ('secondary', 0xf28, 0xf40, 0xf70)]}}


def observed(frame, bp, _):
    try:
        assert len(records) < 32
        scratch = frame.FindRegister('x19').GetValueAsUnsigned()
        record = capture_inputs(frame, scratch)
        record['actual'] = {name: regfloat(frame, register, 'f') for name, register in {
            'primary': 's1', 'secondary': 's8', 'referenceFrequency': 's11'}.items()}
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
