"""Read-only same-run shaping/normalization inputs and outputs, five HW sites."""
import json
import struct
import traceback

import pianoteq_capture_soundboard_responses as base

original_save = base.save
tail = {'shaping': None, 'shaped': [], 'normalization': None, 'normalized': []}


def save():
    original_save()
    filename = base.ROOT / 'runtime.json'
    data = json.loads(filename.read_text())
    data.update(tail)
    data['breakpointHits'] = [hook.GetHitCount() for hook in base.hooks]
    filename.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def source_entry(frame, breakpoint, context):
    return base.source_entry(frame, breakpoint, context)


def worker(frame, breakpoint, context):
    return base.worker(frame, breakpoint, context)


def channel_headers(frame, state):
    begin, end = struct.unpack('<2Q', base.memory(frame, state + 0x110, 16))
    if end < begin or (end - begin) % 0x68 or (end - begin) // 0x68 > 64:
        raise RuntimeError('Invalid response descriptors')
    result = []
    for address in range(begin, end, 0x68):
        data = base.memory(frame, address, 0x68)
        identity, kind, flag = struct.unpack_from('<Q8xII', data, 0x20)
        pointer, length = struct.unpack_from('<2Q', data, 0x38)
        result.append({'identity': str(identity), 'kind': kind, 'flag': flag,
                       'pointer': pointer, 'length': length,
                       'normalizationValueBits': struct.unpack_from('<I', data, 0x60)[0]})
    return result


def raw_complete(frame, breakpoint, context):
    try:
        if base.completed or base.captured_source is None:
            return False
        state = frame.FindRegister('x19').GetValueAsUnsigned()
        if state != base.captured_source['state']:
            raise RuntimeError('Raw state ownership differs')
        fp = frame.FindRegister('x29').GetValueAsUnsigned()
        begin = struct.unpack('<Q', base.memory(frame, fp - 0xd8, 8))[0]
        count = struct.unpack('<Q', base.memory(frame, state + 0x130, 8))[0]
        if not 1 <= count <= 64: raise RuntimeError('Invalid raw worker count')
        for i in range(count):
            pointer = begin + i * 0x78
            words = struct.unpack('<15Q', base.memory(frame, pointer, 0x78))
            first, last = words[3:5]
            if last < first or (last - first) % 4 or last - first > 1000000:
                raise RuntimeError('Invalid raw observation vector')
            data = base.memory(frame, first, last - first)
            ints = struct.unpack('<' + 'I' * (len(data) // 4), data)
            cursor = entries = 0
            while cursor < len(ints):
                if cursor + 2 > len(ints): raise RuntimeError('Truncated group')
                number = ints[cursor + 1]; cursor += 2 + number; entries += number
                if cursor > len(ints): raise RuntimeError('Truncated entries')
            length = words[10] & 0xffffffff
            base.records.append({'pointer': pointer, 'workerIndex': i, 'blockStart': 0,
                'output': words[9], 'length': length,
                'groupData': base.dump(f'record-{i}-groups.bin', data),
                'coefficients': base.dump(f'record-{i}-coefficients.bin', base.memory(frame, words[6], entries * 12)),
                'response': base.dump(f'record-{i}-response.bin', base.memory(frame, words[9], length * 4))})
        base.completed = True
        base.processing = {'channels': channel_headers(frame, state)}
        for hook in base.hooks[:2]: hook.SetEnabled(False)
        save(); return False
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def floats(frame, count):
    import lldb
    values = []
    for i in range(count):
        error = lldb.SBError()
        values.append(frame.FindRegister(f's{i}').GetData().GetFloat(error, 0))
        if error.Fail():
            raise RuntimeError(str(error))
    return values


def vector(frame, address, label, stride=4):
    begin, end = struct.unpack('<2Q', base.memory(frame, address, 16))
    if end < begin or (end - begin) % stride or end - begin > 1000000:
        raise RuntimeError('Invalid shaping vector')
    return base.dump(label + '.bin', base.memory(frame, begin, end - begin))


def object_snapshot(frame, address, label):
    data = base.memory(frame, address, 80)
    descriptor = base.dump(label + '.bin', data)
    ranges = []
    for offset in range(0, 64, 8):
        begin, end = struct.unpack_from('<2Q', data, offset)
        if 0x1000 <= begin < end < 0x8000000000 and end - begin <= 65536:
            try:
                ranges.append({'offset': offset, 'data': base.dump(f'{label}-range-{offset}.bin',
                               base.memory(frame, begin, end - begin))})
            except RuntimeError as error:
                ranges.append({'offset': offset, 'optionalReadError': str(error)})
    return {'header': descriptor, 'candidateRanges': ranges}


def input_shaping(frame, breakpoint, _):
    try:
        if not base.completed or tail['shaping'] is not None:
            return False
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != base.captured_source['state'] or frame.FindRegister('x20').GetValueAsUnsigned() != state:
            raise RuntimeError('Shaping state ownership differs')
        wrapper = frame.FindRegister('x19').GetValueAsUnsigned()
        p = base.processing
        for name, offset in [('sampleRate', 0x3c), ('cutoff', 0x164),
                             ('adjustmentNumerator', 0xa0), ('adjustmentDenominator', 0x1e0)]:
            p[name] = struct.unpack('<f', base.memory(frame, wrapper + offset, 4))[0]
        begin, end = struct.unpack('<2Q', base.memory(frame, wrapper + 0x1b0, 16))
        if end < begin or end - begin > 256 or (end - begin) % 4:
            raise RuntimeError('Invalid blend vector')
        stack = frame.FindRegister('sp').GetValueAsUnsigned()
        p['blend'] = {
            'coefficients': list(struct.unpack('<' + 'f' * ((end - begin) // 4), base.memory(frame, begin, end - begin))),
            'kernelLength': struct.unpack('<Q', base.memory(frame, stack + 0x48, 8))[0],
            'mainCount': struct.unpack('<Q', base.memory(frame, state + 0x128, 8))[0],
            'flags': base.memory(frame, wrapper + 0x1e7, 1)[0],
            'leadingSilenceMode': base.memory(frame, wrapper + 0x1e6, 1)[0],
        }
        registers = [frame.FindRegister(f'x{i}').GetValueAsUnsigned() for i in range(1, 6)]
        shapes = {
            'scalars': floats(frame, 3),
            'floatVector': vector(frame, registers[0], 'shaping-float-vector'),
            'intVector': vector(frame, registers[1], 'shaping-int-vector'),
            'globalCurve': object_snapshot(frame, registers[2], 'shaping-global-curve'),
            'channelCurves': vector(frame, registers[3], 'shaping-channel-curves', 80),
            'blendVector': vector(frame, registers[4], 'shaping-blend-vector'), 'input': [],
        }
        graph_begin, graph_end = struct.unpack('<2Q', base.memory(frame, registers[3], 16))
        shapes['channelCurveObjects'] = [object_snapshot(frame, address, f'shaping-curve-{i}')
            for i, address in enumerate(range(graph_begin, graph_end, 80))]
        for i, channel in enumerate(channel_headers(frame, state)):
            shapes['input'].append(base.dump(f'shaping-input-{i}.bin',
                base.memory(frame, channel['pointer'], channel['length'] * 4)))
        tail['shaping'] = shapes
        breakpoint.SetEnabled(False)
        save()
        return False
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def input_normalization(frame, breakpoint, _):
    try:
        if tail['shaping'] is None or tail['shaped']:
            return False
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != base.captured_source['state']:
            raise RuntimeError('Normalization state ownership differs')
        tail['normalization'] = floats(frame, 3)
        for i, channel in enumerate(channel_headers(frame, state)):
            tail['shaped'].append(base.dump(f'shaped-{i}.bin', base.memory(frame, channel['pointer'], channel['length'] * 4)))
        breakpoint.SetEnabled(False); save(); return False
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def input_resampling(frame, breakpoint, _):
    try:
        if not tail['shaped'] or tail['normalized']:
            return False
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != base.captured_source['state']:
            raise RuntimeError('Resampling state ownership differs')
        tail['resampling'] = floats(frame, 2)
        tail['normalizedHeaders'] = channel_headers(frame, state)
        for i, channel in enumerate(tail['normalizedHeaders']):
            tail['normalized'].append(base.dump(f'normalized-{i}.bin', base.memory(frame, channel['pointer'], channel['length'] * 4)))
        for hook in base.hooks: hook.SetEnabled(False)
        save(); return False
    except Exception:
        base.errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    assert not (base.ROOT / 'runtime.json').exists(), 'Fresh directory required'
    sites = [(0x1005a8874, __name__ + '.source_entry'),
             (0x1005a91c8, __name__ + '.raw_complete'), (0x10069c084, __name__ + '.input_shaping'),
             (0x1006bc7ec, __name__ + '.input_normalization'), (0x1008d78e0, __name__ + '.input_resampling')]
    for address, callback in sites:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(callback)
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    save()
