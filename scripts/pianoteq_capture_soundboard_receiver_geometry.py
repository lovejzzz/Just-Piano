"""Two read-only hardware sites: receiver/image geometry entry and return."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
records = []
pending = None
errors = []
original_save = base.save


def save():
    original_save()
    p = base.ROOT / 'runtime.json'; data = json.loads(p.read_text())
    data.update({'receiverGeometryRecords': records, 'receiverGeometryPending': pending, 'receiverGeometryErrors': errors})
    p.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def reg(frame, name): return frame.FindRegister(name).GetValueAsUnsigned()


def vector(frame, address, label):
    begin, end = struct.unpack('<2Q', base.memory(frame, address, 16))
    if end < begin or (end-begin) % 4 or end-begin > 1000000: raise RuntimeError('Invalid vector')
    return base.dump(label, base.memory(frame, begin, end-begin))


def vectors(frame, address, label):
    begin, end = struct.unpack('<2Q', base.memory(frame, address, 16))
    if end < begin or (end-begin) % 24 or not 0 < end-begin <= 64*24: raise RuntimeError('Invalid coordinate list')
    return [vector(frame, p, f'{label}-{i}.bin') for i, p in enumerate(range(begin, end, 24))]


def entry(frame, breakpoint, _):
    global pending
    try:
        import lldb
        if reg(frame, 'x30') != 0x100057034: return False
        if pending is not None or len(records) >= 3: raise RuntimeError('Geometry overlap/count differs')
        index = len(records); state = reg(frame, 'x0'); config = reg(frame, 'x19')+0x18
        parameters = []
        for i in range(8):
            error = lldb.SBError(); parameters.append(frame.FindRegister(f's{i}').GetData().GetFloat(error, 0))
            if error.Fail(): raise RuntimeError(str(error))
        records.append({'index': index, 'config': base.dump(f'receiver-{index}-config.bin', base.memory(frame, config, 0x130)),
            'bridge': vector(frame, config+0x68, f'receiver-{index}-bridge.bin'),
            'primary': vectors(frame, reg(frame, 'x1'), f'receiver-{index}-primary'),
            'offsets': vectors(frame, reg(frame, 'x2'), f'receiver-{index}-offset'),
            'parents': vector(frame, reg(frame, 'x3'), f'receiver-{index}-parents.bin'),
            'parameters': parameters, 'mirror': reg(frame, 'w4'),
            'offsetScale': struct.unpack('<f', base.memory(frame, reg(frame, 'sp'), 4))[0]})
        pending = {'index': index, 'state': state, 'thread': frame.GetThread().GetThreadID()}
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def returned(frame, breakpoint, _):
    global pending
    try:
        if pending is None or pending['thread'] != frame.GetThread().GetThreadID() or pending['state'] != reg(frame, 'x20'): raise RuntimeError('Geometry return ownership differs')
        index = pending['index']; state = pending['state']; r = records[index]
        r['shape'] = vector(frame, state+0x88, f'receiver-{index}-shape.bin')
        begin, end = struct.unpack('<2Q', base.memory(frame, state+0x110, 16))
        if end < begin or (end-begin) % 0x68 or not 0 < end-begin <= 192*0x68: raise RuntimeError('Invalid geometry output')
        r['geometry'] = []
        for i, address in enumerate(range(begin, end, 0x68)):
            data = base.memory(frame, address, 0x68)
            r['geometry'].append({'coordinates': vector(frame, address, f'receiver-{index}-output-{i}.bin'),
                'amplitude': struct.unpack_from('<f', data, 0x18)[0], 'identity': struct.unpack_from('<Q', data, 0x20)[0],
                'channel': struct.unpack_from('<Q', data, 0x28)[0], 'kind': struct.unpack_from('<I', data, 0x30)[0],
                'serial': struct.unpack_from('<I', data, 0x34)[0]})
        pending = None
        if len(records) == 3:
            for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh capture directory required'
    for address, callback in [(0x10049d778, 'entry'), (0x100057034, 'returned')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error = hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
