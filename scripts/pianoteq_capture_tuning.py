"""Observe final tuning/stiffness production with one hardware point.

8a3c60 follows the final G+28 update. Captures target memory only; never calls
target methods. Simple getter instruction decoding is limited to ldr/add+ret.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_weights import curve
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_TUNING_STAGE', 'final')
POINT = {'final': 0x1008a3c60, 'stretched': 0x1009626b4, 'anchor': 0x1004c3898}[STAGE]
records, configurations, errors = [], [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'point': hex(POINT), 'stage': STAGE, 'records': records,
        'configurations': configurations, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def getter(frame, model, method):
    address = scalar(frame, scalar(frame, model, 'Q') + method * 8, 'Q')
    first, second = unpack(frame, address, 'II')
    pointer = None
    if second == 0xd65f03c0:
        offset = ((first >> 10) & 0xfff)
        if first & 0xffc003ff == 0xf9400000:
            pointer = scalar(frame, model + offset * 8, 'Q')
        elif first & 0xffc003ff == 0x91000000:
            pointer = model + offset
    return {'method_address': hex(address), 'instruction_words': [hex(first), hex(second)], 'pointer': pointer}


def observed(frame, bp, _):
    try:
        if len(records) >= 512:
            return False
        if STAGE == 'anchor':
            records.append({'target_frequency': regfloat(frame, 's8', 'f'),
                            'anchor_frequency': regfloat(frame, 's9', 'f'),
                            'registry_multiplier': regfloat(frame, 'd0', 'd')})
            save()
            return False
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        if STAGE == 'final':
            g, tuning, owner = reg('x8') - 0x18, reg('x26'), reg('x28')
            assert g == scalar(frame, owner, 'Q') + reg('x19') * 0x1248
            model = scalar(frame, reg('sp') + 0xf8, 'Q')
        else:
            g, tuning = reg('x23') - 0x5c, reg('x19')
            owner = scalar(frame, reg('sp') + 0x80, 'Q')
            model = scalar(frame, reg('sp') + 0x78, 'Q')
        if not configurations:
            table, end, capacity = unpack(frame, owner + 0x7a0, 'QQQ')
            assert table <= end <= capacity and (end - table) == 128 * 0x18
            b, a = getter(frame, model, 0), getter(frame, model, 1)
            config = {
                'tuning_controls': {hex(o): scalar(frame, tuning + o) for o in (0x20, 0x38, 0x198, 0x280)},
                'tuning_integers': {hex(o): scalar(frame, tuning + o, 'I') for o in (0xe8, 0x100, 0x190, 0x1a0)},
                'ageing_enabled': scalar(frame, tuning + 0x288, 'B'),
                'pitch_edits': curve(frame, tuning + 0x1f8),
                'component_ratios': vector(frame, tuning + 0x258),
                'stretch_table': vector(frame, tuning + 0x298),
                'stiffness_table': [scalar(frame, table + i * 0x18 + 0x10, 'd') for i in range(128)],
                'model_getters': {'B': b, 'A': a},
            }
            if STAGE == 'stretched':
                config['registry_constants'] = {'pitch_scale': regfloat(frame, 'd8', 'd'),
                                                'reference_note': regfloat(frame, 'd9', 'd')}
            if b['pointer'] and a['pointer']:
                config['base_curves'] = {hex(o): curve(frame, b['pointer'] + o) for o in (0x1b40, 0x1b98, 0x2560)}
                config['preset_curves'] = {hex(o): curve(frame, a['pointer'] + o) for o in (0x490, 0x4e0, 0xf48)}
            configurations.append(config)
        records.append({
            'note': scalar(frame, g + 0x14), 'note_index': scalar(frame, g + 8, 'I'),
            'G_controls': {hex(o): scalar(frame, g + o) for o in (0x28, 0x58, 0x5c, 0x60, 0x78, 0x80)},
            'component_stiffness': vector(frame, g + 0x40),
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
        f'breakpoint set --hardware --address {POINT:#x} --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
