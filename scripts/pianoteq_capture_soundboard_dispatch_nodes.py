"""Read-only dispatcher output provenance and final nine-node boundary."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
records = []
node_record = None
pending = {}
errors = []
original_save = base.save


def save():
    original_save()
    path = base.ROOT / 'runtime.json'; data = json.loads(path.read_text())
    data.update({'dispatchRecords': records, 'nodeRecord': node_record,
                 'dispatchPending': pending, 'dispatchErrors': errors})
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def entry(frame, breakpoint, _):
    try:
        thread = str(frame.GetThread().GetThreadID())
        if thread in pending: raise RuntimeError('Nested dispatcher call')
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        config = frame.FindRegister('x1').GetValueAsUnsigned()
        header = base.memory(frame, config, 0x240)
        index = len(records)
        records.append({'number': index, 'state': state, 'config': config,
            'header': base.dump(f'dispatch-{index}-config.bin', header),
            'outputRate': struct.unpack_from('<f', header, 0x44)[0],
            'inputRate': struct.unpack_from('<f', header, 0x3c)[0],
            'mode': struct.unpack_from('<I', header, 0xfc)[0],
            'duration': struct.unpack_from('<f', header, 0xc4)[0]})
        pending[thread] = index
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def completed(frame, breakpoint, _):
    try:
        thread = str(frame.GetThread().GetThreadID())
        if thread not in pending: raise RuntimeError('Dispatcher entry missing')
        record = records[pending[thread]]
        if frame.FindRegister('x19').GetValueAsUnsigned() != record['config']: raise RuntimeError('Dispatcher config differs')
        begin, end = struct.unpack('<2Q', base.memory(frame, record['config'], 16))
        if end < begin or (end - begin) % 0x30 or end - begin > 4096: raise RuntimeError('Invalid dispatcher output vector')
        record['outputs'] = []
        for i, address in enumerate(range(begin, end, 0x30)):
            header = base.memory(frame, address, 0x30)
            pointer, length = struct.unpack_from('<2Q', header)
            if not 1 <= length <= 100000: raise RuntimeError('Invalid dispatcher response shape')
            record['outputs'].append({'length': length, 'normalizationBits': struct.unpack_from('<I', header, 0x28)[0],
                'data': base.dump(f"dispatch-{record['number']}-output-{i}.bin", base.memory(frame, pointer, length * 4))})
        del pending[thread]
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def model(frame, breakpoint, _):
    global node_record
    try:
        if node_record is not None: return False
        if pending: raise RuntimeError('Model reached with unfinished dispatcher calls')
        source = frame.FindRegister('x1').GetValueAsUnsigned()
        sentinel = source + 0xd30
        current = struct.unpack('<Q', base.memory(frame, sentinel + 8, 8))[0]
        targets = []; seen = set()
        while current != sentinel:
            if current in seen or len(targets) >= 16 or current < 0x1000: raise RuntimeError('Invalid node list')
            seen.add(current)
            words = struct.unpack('<6Q', base.memory(frame, current, 48))
            holder, offset, length = words[2], words[4], words[5]
            if holder < 0x1000 or not 1 <= length <= 100000: raise RuntimeError('Invalid node buffer')
            pointer = struct.unpack('<Q', base.memory(frame, holder, 8))[0] + offset * 4
            index = len(targets)
            targets.append({'index': index, 'length': length,
                'data': base.dump(f'ir-node-{index}.bin', base.memory(frame, pointer, length * 4))})
            current = words[1]
        record = {'visibleNodes': len(targets), 'targets': targets}
        node_record = record
        for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    for address, callback in [(0x100056f98, 'entry'), (0x100057390, 'completed'), (0x10073abf0, 'model')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
