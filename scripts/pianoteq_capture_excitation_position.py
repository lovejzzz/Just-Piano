"""Read-only snapshots after the strike-position correction in 692ffc."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, verify_text
from pianoteq_capture_final_excitation import table
from pianoteq_capture_modal_source import vector

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINT = 0x100693e24
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
        assert len(records) < 32
        scratch = frame.FindRegister('x19').GetValueAsUnsigned()
        k = scalar(frame, scratch + 0xb8, 'Q')
        params = scalar(frame, scratch + 0x118, 'Q')
        g = scalar(frame, params, 'Q')
        shared = scalar(frame, g + 0x1240, 'Q')
        records.append({'note': scalar(frame, g + 0x14), 'mode': scalar(frame, scratch + 0xec, 'I'),
                        **table(frame, k), 'coordinates': vector(frame, g + 0x7b8),
                        'sineWeights': vector(frame, shared + 0xc8),
                        'controls': {'referencePosition': scalar(frame, g + 0xa8),
                                     'positionFactor': scalar(frame, params + 0xb8),
                                     'positionScale': scalar(frame, g + 0xac),
                                     'amplitudePositionFlag': scalar(frame, shared + 0x1d, 'B') & 1,
                                     'phasePositionFlag': scalar(frame, shared + 0x1e, 'B') & 1}})
        records[-1]['controls'].update({'amplitudeReference': scalar(frame, g + 0xd8),
                                        'logOffsetSlope': scalar(frame, g + 0xf0)})
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
