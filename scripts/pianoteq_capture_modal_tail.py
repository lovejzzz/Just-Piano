"""Read-only completed eight-lane free-response tail, before state stores."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import verify_text
from pianoteq_capture_recurrence import register, floats, lanes

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'address': '0x1007c0ec4', 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    if len(records) >= 16:
        return False
    try:
        count = register(frame, 'w21')
        assert 0 < count <= 8192 and count % 4 == 0
        records.append({
            'samples': count, 'thread': frame.GetThread().GetThreadID(), 'sp': register(frame, 'sp'),
            'remaining_four_lane_groups': register(frame, 'w24'),
            'P_pointer': register(frame, 'x23'), 'Q_pointer': register(frame, 'x22'),
            'coefficient_pointer': register(frame, 'x20'), 'output_pointer': register(frame, 'x19'),
            'P_before': floats(frame, register(frame, 'x23'), 8),
            'Q_before': floats(frame, register(frame, 'x22'), 8),
            'coefficients_interleaved': floats(frame, register(frame, 'x20'), 16),
            'output_after': floats(frame, register(frame, 'x19'), count),
            'P_after': lanes(frame, 'v6') + lanes(frame, 'v4'),
            'Q_after': lanes(frame, 'v7') + lanes(frame, 'v5'),
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
        'breakpoint set --hardware --address 0x1007c0ec4 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
