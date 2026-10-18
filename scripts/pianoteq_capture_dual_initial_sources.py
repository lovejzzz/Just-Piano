"""Observe complete primary and secondary initial source tables at their actual consumer without target writes."""
import json
import os
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack

NOTES = {int(n) for n in os.environ.get('PIANOTEQ_BASE_TABLE_NOTES', '69').split(',')}
if not NOTES or any(n < 0 or n > 127 for n in NOTES):
    raise ValueError('Explicit MIDI note set required')
records, errors = [], []
original_save = base.save


def vector(frame, address):
    begin, end, capacity = unpack(frame, address, 'QQQ')
    if not begin <= end <= capacity or (end - begin) % 4 or end - begin > 16384:
        raise ValueError('Bounded history curve required')
    return list(unpack(frame, begin, 'f' * ((end - begin) // 4))) if end > begin else []


def save():
    original_save()
    file = base.ROOT / 'runtime.json'
    data = json.loads(file.read_text())
    data.update(initialSourceRecords=records, initialSourceErrors=errors)
    file.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, bp, _):
    try:
        reg = lambda n: frame.FindRegister(n).GetValueAsUnsigned()
        active = frame.GetPCAddress().GetFileAddress() == 0x100695108
        g = reg('x25') if active else reg('x19')
        note = scalar(frame, g + 0x14)
        if note not in NOTES:
            return False
        rows, columns = unpack(frame, g + 0x730, 'QQ')
        if not 0 < rows <= 512 or columns not in (1, 2, 3):
            raise ValueError('Bounded initial primary source required')
        pointer = scalar(frame, g + 0x718, 'Q')
        frequencies = list(unpack(frame, pointer, 'f' * (rows * columns)))
        row = dict(stage='active' if active else 'configured', note=note, source=hex(g),
                   sampleRate=scalar(frame, g + 0x98),
                   initialPrimary=dict(rows=rows, columns=columns, frequency=frequencies),
                   tables={'negative': vector(frame, g + 0x248), 'positive': vector(frame, g + 0x260)},
                   coordinates=vector(frame, g + 0x7b8))
        row['initialTables'] = {'frequency': frequencies}
        for name, offset in [('decay', 0x740), ('amplitude', 0x768), ('phase', 0x790)]:
            start = scalar(frame, g + offset, 'Q')
            shape = unpack(frame, g + offset + 0x18, 'QQ')
            if shape != (rows, columns):
                raise ValueError('Matching initial source matrix shape required')
            row['initialTables'][name] = list(unpack(frame, start, 'f' * (rows * columns)))
        secondary = {}
        for name, offset in [('frequency', 0x990), ('decay', 0x9b8), ('amplitude', 0x9e0), ('phase', 0xa08)]:
            start = scalar(frame, g + offset, 'Q')
            sr, sc = unpack(frame, g + offset + 0x18, 'QQ')
            if not 0 < sr <= 512 or sc not in (1, 2, 3):
                raise ValueError('Bounded secondary source required')
            if secondary and (sr, sc) != (secondary['rows'], secondary['columns']):
                raise ValueError('Matching secondary matrix shapes required')
            secondary.update(rows=sr, columns=sc)
            secondary[name] = list(unpack(frame, start, 'f' * (sr * sc)))
        row['initialSecondary'] = secondary
        if active:
            scratch = reg('x19')
            row['mode'] = scalar(frame, scratch + 0xec, 'i')
            row['slope'] = scalar(frame, scratch + 0x230)
            count = scalar(frame, scratch + 0xf8, 'I')
            header = scalar(frame, scratch + 0x1c0, 'Q')
            data = scalar(frame, header, 'Q')
            if not 0 < count <= rows:
                raise ValueError('Complete selected base table required')
            row['selected'] = list(unpack(frame, data, 'f' * count))
        if len(records) >= 256:
            raise ValueError('Spectrum observation bound exceeded')
        records.append(row)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:
            hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists():
        raise ValueError('Fresh native output required')
    for address in (0x100695108,):
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail():
            raise RuntimeError(str(error))
        hook.SetAutoContinue(True)
        base.hooks.append(hook)
    save()
