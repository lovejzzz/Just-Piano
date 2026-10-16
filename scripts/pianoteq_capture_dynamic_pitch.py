"""Read-only dynamic-pitch state at the fixed control-update return point."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_PITCH_STAGE', 'return')
POINT = {'return': 0x1006e5158, 'exp': 0x1006e5584}[STAGE]
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
        v = frame.FindRegister('x19').GetValueAsUnsigned()
        o = scalar(frame, v, 'Q')
        groups = scalar(frame, o + 0xa8, 'Q')
        if not 0 < groups <= 8:
            return False
        stage = 'released' if scalar(frame, v + 0x924, 'B') else 'held'
        if sum(r['stage'] == stage for r in records) >= 32:
            return False
        rows = [list(unpack(frame, o + 0xb0 + i * 16, 'IIII')) for i in range(groups)]
        record = {
            'stage': stage, 'V': hex(v), 'thread': frame.GetThread().GetThreadID(), 'layout': rows,
            'sample_age': scalar(frame, v + 0x10, 'I'), 'last_block_samples': scalar(frame, v + 0x904, 'I'),
            'changed': frame.FindRegister('w20').GetValueAsUnsigned() & 1,
            'controls': {hex(offset): scalar(frame, v + offset) for offset in (
                0x25c, 0x780, 0x784, 0x7f8, 0x82c, 0x8bc, 0x8d8, 0x8e0, 0x8e4, 0x8e8,
                0x8ec, 0x8f0, 0x8f4, 0x8f8, 0x8fc, 0x938, 0x93c, 0x940)},
            'flags': {hex(offset): scalar(frame, v + offset, 'B') for offset in (
                0x83d, 0x8ae, 0x924, 0x925, 0x930, 0x931, 0x934)},
        }
        if STAGE == 'exp':
            record.update({'time': regfloat(frame, 's8', 'f'), 'exponential': regfloat(frame, 's0', 'f')})
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
