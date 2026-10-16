"""Read weighted sine sums and log-ratio return before amplitude updates."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, verify_text
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
POINT = 0x100693614
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
        assert len(records) < 8192
        scratch = frame.FindRegister('x19').GetValueAsUnsigned()
        params = scalar(frame, scratch + 0x118, 'Q')
        g = scalar(frame, params, 'Q')
        records.append({'note': scalar(frame, g + 0x14), 'mode': scalar(frame, scratch + 0xec, 'I'),
                        'row': frame.FindRegister('w26').GetValueAsUnsigned(),
                        **{name: regfloat(frame, reg, 'f') for name, reg in {
                            'coordinate': 's10', 'referenceSum': 's11', 'positionSum': 's13',
                            'offset': 's8', 'logRatio': 's0'}.items()}})
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
