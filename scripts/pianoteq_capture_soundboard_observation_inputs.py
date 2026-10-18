"""Four read-only hardware sites: distances and observation preparation, three groups."""
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
    data.update({'observationInputs': records, 'observationPending': pending, 'observationErrors': errors})
    p.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def reg(frame, name): return frame.FindRegister(name).GetValueAsUnsigned()


def scalar(frame, name):
    import lldb
    error = lldb.SBError(); value = frame.FindRegister(name).GetData().GetFloat(error, 0)
    if error.Fail(): raise RuntimeError(str(error))
    return value


def vector(frame, address, name):
    begin, end = struct.unpack('<2Q', base.memory(frame, address, 16))
    if end < begin or (end-begin) % 4 or end-begin > 1000000: raise RuntimeError('Invalid vector')
    return base.dump(name, base.memory(frame, begin, end-begin))


def distance_entry(frame, breakpoint, _):
    global pending
    try:
        if reg(frame, 'x30') != 0x100057040: return False
        if pending is not None: raise RuntimeError('Previous observation preparation pending')
        state = reg(frame, 'x0'); index = len(records)
        if index >= 3: raise RuntimeError('Too many observation groups')
        if records and len(records[-1]['preparations']) != len(records[-1]['geometry']): raise RuntimeError('Previous group incomplete')
        config = reg(frame, 'x19') + 0x18
        begin, end = struct.unpack('<2Q', base.memory(frame, state+0x110, 16))
        if end < begin or (end-begin) % 0x68 or not 0 < end-begin <= 64*0x68: raise RuntimeError('Invalid geometry vector')
        geometries = []
        for i, address in enumerate(range(begin, end, 0x68)):
            data = base.memory(frame, address, 0x68)
            coordinates = vector(frame, address, f'observation-{index}-geometry-{i}.bin')
            if coordinates['bytes'] != 12: raise RuntimeError('Three coordinates required')
            geometries.append({'coordinates': coordinates, 'amplitude': struct.unpack_from('<f', data, 0x18)[0],
                'identity': struct.unpack_from('<Q', data, 0x20)[0], 'channel': struct.unpack_from('<Q', data, 0x28)[0],
                'kind': struct.unpack_from('<I', data, 0x30)[0]})
        records.append({'index': index, 'thread': frame.GetThread().GetThreadID(), 'state': state,
            'config': base.dump(f'observation-{index}-config.bin', base.memory(frame, config, 0x130)),
            'bridge': vector(frame, config+0x68, f'observation-{index}-bridge.bin'),
            'gains': vector(frame, config+0x48, f'observation-{index}-gains.bin'),
            'planeHeight': scalar(frame, 's0'), 'geometry': geometries, 'preparations': []})
        pending = {'stage': 'distance', 'index': index}; save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def current(frame):
    if not records or records[-1]['thread'] != frame.GetThread().GetThreadID(): raise RuntimeError('Observation ownership differs')
    return records[-1]


def distance_return(frame, breakpoint, _):
    global pending
    try:
        r = current(frame)
        if pending != {'stage': 'distance', 'index': r['index']}: raise RuntimeError('Distance entry missing')
        r['distances'] = vector(frame, r['state']+0xe0, f"observation-{r['index']}-distances.bin")
        r['directions'] = vector(frame, r['state']+0xf8, f"observation-{r['index']}-directions.bin")
        pending = None; save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def prepare_entry(frame, breakpoint, _):
    global pending
    try:
        if reg(frame, 'x30') != 0x1005a89ac: return False
        r = current(frame)
        if pending is not None or len(r['preparations']) >= len(r['geometry']): raise RuntimeError('Preparation overlap/count differs')
        descriptor = reg(frame, 'x0'); begin, end = struct.unpack('<2Q', base.memory(frame, descriptor, 16))
        count = reg(frame, 'w4')
        if end < begin or (end-begin) % 20 or not 0 < count <= 100000: raise RuntimeError('Invalid preparation vector/count')
        i = len(r['preparations']); prefix = f"observation-{r['index']}-prepare-{i}"
        r['preparations'].append({'index': i, 'descriptor': descriptor, 'count': count,
            'inverseScale': scalar(frame, 's0'), 'amplitudeScale': scalar(frame, 's1'),
            'flags': reg(frame, 'w1'), 'phaseMode': reg(frame, 'w6'),
            'distances': base.dump(prefix+'-distances.bin', base.memory(frame, reg(frame, 'x2'), count*4)),
            'directions': base.dump(prefix+'-directions.bin', base.memory(frame, reg(frame, 'x3'), count*4))})
        pending = {'stage': 'prepare', 'index': r['index'], 'initialBytes': end-begin}; save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def prepare_return(frame, breakpoint, _):
    global pending
    try:
        r = current(frame)
        if pending is None or pending['stage'] != 'prepare' or pending['index'] != r['index']: raise RuntimeError('Preparation entry missing')
        p = r['preparations'][-1]; begin, end = struct.unpack('<2Q', base.memory(frame, p['descriptor'], 16))
        start = begin + pending['initialBytes']
        if end < start or end-start > p['count']*20: raise RuntimeError('Preparation output size differs')
        p['output'] = base.dump(f"observation-{r['index']}-prepare-{p['index']}-output.bin", base.memory(frame, start, end-start))
        pending = None
        if r['index'] == 2 and len(r['preparations']) == len(r['geometry']):
            for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh capture directory required'
    for address, callback in [(0x1004bcde8, 'distance_entry'), (0x100057040, 'distance_return'),
                              (0x10037e040, 'prepare_entry'), (0x1005a89ac, 'prepare_return')]:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints()-1)
        error = hook.SetScriptCallbackFunction(__name__+'.'+callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
