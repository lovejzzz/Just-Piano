"""Read-only stretch-system snapshots, one fixed hardware point per run."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_source_weights import curve
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_STRETCH_STAGE', 'before')
POINT = {'before': 0x1003281c0, 'after': 0x100328208, 'lu': 0x10076eb0c,
         'weights': 0x100327388, 'table': 0x1003283d8}[STAGE]
records, errors = [], []
hook = None


def vector64(frame, address):
    begin, end, capacity = unpack(frame, address, 'QQQ')
    assert begin <= end <= capacity and (end - begin) % 8 == 0
    count = (end - begin) // 8
    assert count <= 131072
    values = []
    for i in range(0, count, 1024):
        values.extend(unpack(frame, begin + i * 8, 'd' * min(1024, count - i)))
    return values


def matrix64(frame, address):
    columns, rows = unpack(frame, address + 0x18, 'QQ')
    values = vector64(frame, address)
    assert columns * rows == len(values)
    return {'rows': rows, 'columns': columns, 'values': values, 'layout': 'column-major'}


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 2, 'point': hex(POINT), 'stage': STAGE, 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        if len(records) >= 8:
            return False
        if STAGE == 'lu':
            fp = frame.FindRegister('x29').GetValueAsUnsigned()
            if scalar(frame, fp + 8, 'Q') != 0x1003281c4:
                return False
            begin, end, capacity = unpack(frame, fp - 0x90, 'QQQ')
            assert begin <= end <= capacity and (end - begin) % 4 == 0
            count = (end - begin) // 4
            assert count <= 1024
            records.append({'lu': matrix64(frame, fp - 0x78),
                            'pivots': list(unpack(frame, begin, 'i' * count)),
                            'rhs': vector64(frame, frame.FindRegister('x19').GetValueAsUnsigned()),
                            'solution': vector64(frame, frame.FindRegister('x20').GetValueAsUnsigned())})
            save()
            return False
        sp = frame.FindRegister('sp').GetValueAsUnsigned()
        tuning = scalar(frame, sp + 0x20, 'Q')
        if STAGE == 'weights':
            sine_pointer = scalar(frame, sp + 0xd0, 'Q')
            records.append({'middle_weight': regfloat(frame, 'd0', 'd'),
                            'gram_scale': regfloat(frame, 'd10', 'd'),
                            'sines': list(unpack(frame, sine_pointer, 'd' * 107)),
                            'interval': scalar(frame, tuning + 0x50, 'i')})
            save()
            return False
        source = scalar(frame, sp + 0x78, 'Q')
        begin, end, capacity = unpack(frame, source + 0x10, 'QQQ')
        assert begin <= end <= capacity and end - begin == 128 * 0x18
        record = {
            'matrix': matrix64(frame, sp + 0x150), 'rhs': vector64(frame, sp + 0x110),
            'solution': vector64(frame, sp + 0xf8),
            'tuning_controls': {hex(o): scalar(frame, tuning + o) for o in (0x20, 0x38, 0xb8)},
            'interval': scalar(frame, tuning + 0x50, 'i'),
            'weight_curve': curve(frame, tuning + 0x58),
            'stiffness_table': [scalar(frame, begin + 0x18 * i + 0x10, 'd') for i in range(128)],
        }
        if STAGE in ('after', 'table'):
            record['product'] = vector64(frame, sp + 0xe0)
        if STAGE == 'table':
            record['table'] = vector(frame, tuning + 0x298)
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
