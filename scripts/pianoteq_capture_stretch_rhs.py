"""One fixed read-only hardware observation point per stretch RHS run."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_weights import curve
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ['PIANOTEQ_STRETCH_RHS_STAGE']
POINT = {'counts': 0x100327188, 'raw': 0x100327de0, 'filter': 0x10089755c}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'stage': STAGE, 'point': hex(POINT),
        'records': records, 'errors': errors, 'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        if len(records) >= 8:
            return False
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        sp = reg('sp')
        if STAGE == 'filter':
            fp = reg('x29')
            if scalar(frame, fp + 8, 'Q') != 0x100327f08:
                return False
            records.append({
                'input': vector(frame, reg('x22')), 'output': vector(frame, reg('x19')),
                'coefficients': list(unpack(frame, sp + 0x48, 'f' * 5)),
                'delay': reg('w26'), 'extend': reg('w21'),
                'smoothing': regfloat(frame, 's8', 'f'),
                'numerator': list(unpack(frame, sp + 0x88, 'ddd')),
                'denominator': list(unpack(frame, fp - 0x80, 'ddd')),
            })
        else:
            tuning = reg('x24') if STAGE == 'counts' else scalar(frame, sp + 0x20, 'Q')
            source = scalar(frame, sp + 0x78, 'Q')
            begin, end, capacity = unpack(frame, source + 0x10, 'QQQ')
            assert begin <= end <= capacity and end - begin == 128 * 24
            record = {
                'interval': scalar(frame, tuning + 0x50, 'i'),
                'controls': {hex(o): scalar(frame, tuning + o) for o in (0x20, 0x38, 0xb8)},
                'weight_curve': curve(frame, tuning + 0x58),
                'stiffness_table': [scalar(frame, begin + i * 24 + 0x10, 'd') for i in range(128)],
                'interval_ratio': regfloat(frame, 'd11', 'd'),
            }
            if STAGE == 'counts':
                record.update({'partials': list(unpack(frame, reg('x23'), 'i' * 115)),
                               'rational_numerator': regfloat(frame, 'd13', 'd'),
                               'rational_denominator': reg('w19'), 'partial_limit': reg('w21')})
            else:
                n = 107 - record['interval']
                record.update({'raw': list(unpack(frame, reg('x25'), 'f' * n)),
                               'normalized': vector(frame, sp + 0x130),
                               'scaled_low': list(unpack(frame, reg('x24'), 'd' * n)),
                               'scaled_high': list(unpack(frame, scalar(frame, sp + 0xb0, 'Q'), 'd' * n))})
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
