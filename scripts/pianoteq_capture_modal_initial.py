"""Read-only initial-state snapshots at one fixed hardware point per run."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_INITIAL_STAGE', 'initial')
POINT = {'initial': 0x1008634d8, 'final': 0x100864d28}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'stage': STAGE, 'point': hex(POINT),
        'records': records, 'errors': errors, 'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def floats(frame, pointer, count):
    return list(unpack(frame, pointer, 'f' * count))


def observed(frame, bp, _):
    try:
        fp = frame.FindRegister('x29').GetValueAsUnsigned()
        v = scalar(frame, fp - 0x168, 'Q') if STAGE == 'initial' else frame.FindRegister('x24').GetValueAsUnsigned() - 0x18
        if scalar(frame, v + 0x18, 'B') != 1:
            return False
        if len(records) >= 1024:
            raise RuntimeError('Initial capture limit exceeded')
        o = scalar(frame, v, 'Q')
        pointers = {name: scalar(frame, v + offset, 'Q') for name, offset in {
            'frequency': 0x20, 'J': 0x1b0, 'amplitude_or_R': 0x160,
            'sin_inverse': 0x138, 'S': 0x110, 'K': 0xe8, 'energy': 0x188,
        }.items()}
        pointers['P'] = scalar(frame, o + 0x58, 'Q')
        pointers['Q'] = scalar(frame, o + 0x80, 'Q')
        groups = scalar(frame, o + 0xa8, 'Q')
        assert 0 < groups <= 8
        layout = [list(unpack(frame, o + 0xb0 + 16 * g, 'IIII')) for g in range(groups)]
        assert all(0 <= r[0] <= r[0] + r[3] <= 8192 for r in layout)
        record = {'V': hex(v), 'thread': frame.GetThread().GetThreadID(),
                  'input_mode': scalar(frame, o + 0xf0, 'I'), 'layout': layout,
                  'controls': {hex(offset): scalar(frame, v + offset) for offset in (0xc, 0x780, 0x784, 0x800, 0x804)}}
        if STAGE == 'initial':
            offset = frame.FindRegister('x22').GetValueAsUnsigned()
            assert offset % 16 == 0 and offset < 8192 * 4
            record.update({'lane': offset // 4,
                           'theta': floats(frame, fp - 0x120, 4),
                           'phase': floats(frame, fp - 0xf0, 4),
                           'sin_theta': floats(frame, fp - 0x140, 4),
                           'cos_theta': floats(frame, fp - 0x130, 4),
                           'sin_phase': floats(frame, fp - 0x160, 4),
                           'cos_phase': floats(frame, fp - 0x150, 4)})
            record.update({name: floats(frame, pointer + offset, 4) for name, pointer in pointers.items()})
        else:
            record['lanes'] = []
            a = scalar(frame, o + 8, 'Q')
            for group, (start, padded, capacity, count) in enumerate(layout):
                for lane in range(start // 4 * 4, (start + count + 3) // 4 * 4):
                    row = {name: scalar(frame, pointer + lane * 4) for name, pointer in pointers.items()}
                    index = lane // 4 * 8 + lane % 4
                    row.update({'lane': lane, 'group': group, 'valid': start <= lane < start + count,
                                'A': scalar(frame, a + index * 4), 'B': scalar(frame, a + (index + 4) * 4)})
                    record['lanes'].append(row)
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
