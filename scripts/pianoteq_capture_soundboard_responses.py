"""Read-only capture of first propagation's observation groups and raw responses.

Six hardware breakpoints: propagation inputs, worker, block completion,
conversion, trim and filter completion. No target writes or expressions.
"""
import hashlib
import json
import os
import signal
from pathlib import Path
import struct
import traceback

from pianoteq_damper_runtime_capture import verify_text

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
LEADING_CAPTURE = os.environ.get('PIANOTEQ_CAPTURE_LEADING') == '1'
BLEND_CAPTURE = os.environ.get('PIANOTEQ_CAPTURE_BLEND') == '1' or LEADING_CAPTURE
hooks = []
records = []
errors = []
completed = False
captured_source = None
converted = []
trimmed = []
filtered = []
processing = None
blended = []
leading = []
run_status = None


def memory(frame, address, size):
    import lldb
    if size < 0 or size > 8000000:
        raise RuntimeError('Read size out of bounds')
    error = lldb.SBError()
    data = frame.GetThread().GetProcess().ReadMemory(address, size, error)
    if error.Fail() or len(data) != size:
        raise RuntimeError(str(error))
    return data


def dump(name, data):
    with open(ROOT / name, 'xb') as stream:
        stream.write(data)
    os.chmod(ROOT / name, 0o600)
    return {'file': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def save():
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'records': records, 'errors': errors,
        'completed': completed, 'hardwareBreakpoints': len(hooks),
        'capturedSource': captured_source,
        'converted': converted,
        'trimmed': trimmed,
        'filtered': filtered, 'processing': processing,
        'blended': blended, 'blendCapture': BLEND_CAPTURE,
        'leading': leading, 'leadingCapture': LEADING_CAPTURE,
        'runStatus': run_status,
        'targetMutation': False,
    }, indent=2, allow_nan=False))
    os.chmod(ROOT / 'runtime.json', 0o600)


def source_entry(frame, breakpoint, _):
    global captured_source
    try:
        import lldb
        from pianoteq_capture_soundboard_state import dump_state_arrays
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        data = memory(frame, state, 0x200)
        arrays = dump_state_arrays(frame, data)
        rows = {record['label']: record['rowsPath'] for record in arrays if 'rowsPath' in record}
        if set(rows) != {'va0', 'vc0'}:
            raise RuntimeError('Both same-run sparse matrices required')
        scalars = []
        for index in range(6):
            error = lldb.SBError()
            value = frame.FindRegister(f's{index}').GetData().GetFloat(error, 0)
            if error.Fail():
                raise RuntimeError(str(error))
            scalars.append(value)
        begin, end = struct.unpack_from('<2Q', data, 0x70)
        if end - begin != 16:
            raise RuntimeError('Expected four excitation samples')
        h, tau = struct.unpack_from('<2f', data)
        config = {
            'matrixA': rows['va0'], 'matrixC': rows['vc0'],
            'controls': dict(zip(['T', 'p', 'q', 'r'], scalars[:4]), h=h, tau=tau),
            'conversion': {'mode': frame.FindRegister('w1').GetValueAsUnsigned(),
                           'speed': scalars[4], 'density': scalars[5]},
            'excitation': list(struct.unpack('<4f', memory(frame, begin, 16))),
            'excitationIndex': struct.unpack_from('<I', data, 0x68)[0],
        }
        descriptor = dump('source.json', json.dumps(config, indent=2, allow_nan=False).encode())
        captured_source = {'state': state, 'config': descriptor, 'arrays': arrays}
        breakpoint.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def worker(frame, breakpoint, _):
    try:
        start = frame.FindRegister('x2').GetValueAsUnsigned() & 0xffffffff
        if start != 0:
            return False
        pointer = frame.FindRegister('x0').GetValueAsUnsigned()
        if any(record['pointer'] == pointer for record in records):
            return False
        if len(records) >= 64:
            raise RuntimeError('Too many observation records')
        words = struct.unpack('<15Q', memory(frame, pointer, 0x78))
        begin, end, coefficient_pointer = words[3], words[4], words[6]
        if end < begin or (end - begin) % 4 or end - begin > 1000000:
            raise RuntimeError('Invalid group vector')
        data = memory(frame, begin, end - begin)
        ints = struct.unpack('<' + 'I' * (len(data) // 4), data)
        cursor = 0
        entry_count = 0
        while cursor < len(ints):
            if cursor + 2 > len(ints):
                raise RuntimeError('Truncated group header')
            count = ints[cursor + 1]
            cursor += 2 + count
            if cursor > len(ints):
                raise RuntimeError('Truncated group entries')
            entry_count += count
        cache_ref = frame.FindRegister('x1').GetValueAsUnsigned()
        cache = struct.unpack('<Q', memory(frame, cache_ref, 8))[0]
        index = len(records)
        record = {
            'pointer': pointer, 'thread': frame.GetThread().GetThreadID(),
            'blockStart': start, 'output': words[9], 'length': words[10] & 0xffffffff,
            'groupData': dump(f'record-{index}-groups.bin', data),
            'coefficients': dump(f'record-{index}-coefficients.bin',
                                 memory(frame, coefficient_pointer, entry_count * 12)),
            'cache': dump(f'record-{index}-cache.bin', memory(frame, cache, 1500 * 65 * 4)),
        }
        records.append(record)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def after_propagation(frame, breakpoint, _):
    global completed
    try:
        if not records:
            return False
        state = frame.FindRegister('x19').GetValueAsUnsigned()
        if captured_source and state != captured_source['state']:
            raise RuntimeError('Completed state differs from captured source')
        frame_pointer = frame.FindRegister('x29').GetValueAsUnsigned()
        begin = struct.unpack('<Q', memory(frame, frame_pointer - 0xd8, 8))[0]
        count = struct.unpack('<Q', memory(frame, state + 0x130, 8))[0]
        if count < 1 or count > 64 or count != len(records):
            raise RuntimeError('Unexpected completed worker record count')
        outputs = {}
        for index in range(count):
            address = begin + index * 0x78
            pointer, length = struct.unpack('<2Q', memory(frame, address + 0x48, 16))
            outputs[address] = (pointer, length)
        for index, record in enumerate(records):
            if outputs.get(record['pointer']) != (record['output'], record['length']):
                raise RuntimeError('Worker output not owned by completed state')
            record['workerIndex'] = (record['pointer'] - begin) // 0x78
            record['response'] = dump(f'record-{index}-response.bin',
                                     memory(frame, record['output'], record['length'] * 4))
        completed = True
        for hook in hooks[:3]:
            hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def after_conversion(frame, breakpoint, _):
    try:
        if not completed or not captured_source:
            return False
        state = frame.FindRegister('x19').GetValueAsUnsigned()
        if state != captured_source['state']:
            raise RuntimeError('Converted state differs from captured source')
        begin, end = struct.unpack('<2Q', memory(frame, state + 0x110, 16))
        if end < begin or (end - begin) % 0x68 or (end - begin) // 0x68 > 64:
            raise RuntimeError('Invalid converted record vector')
        for offset in range(0, end - begin, 0x68):
            pointer, length = struct.unpack('<2Q', memory(frame, begin + offset + 0x38, 16))
            converted.append(dump(f'converted-{len(converted)}.bin', memory(frame, pointer, length * 4)))
        for hook in hooks[:4]:
            hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def after_trim(frame, breakpoint, _):
    global processing
    try:
        if not completed or not captured_source:
            return False
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != captured_source['state']:
            raise RuntimeError('Trimmed state differs from captured source')
        if frame.FindRegister('x20').GetValueAsUnsigned() != state:
            raise RuntimeError('Unexpected wrapper ABI')
        wrapper = frame.FindRegister('x19').GetValueAsUnsigned()
        import lldb
        argument_values = []
        for name in ['s0', 's1']:
            error = lldb.SBError()
            argument_values.append(frame.FindRegister(name).GetData().GetFloat(error, 0))
            if error.Fail():
                raise RuntimeError(str(error))
        processing = {
            'sampleRate': struct.unpack('<f', memory(frame, wrapper + 0x3c, 4))[0],
            'cutoff': struct.unpack('<f', memory(frame, wrapper + 0x164, 4))[0],
            'adjustmentNumerator': argument_values[0],
            'adjustmentDenominator': argument_values[1], 'channels': [],
        }
        begin, end = struct.unpack('<2Q', memory(frame, state + 0x110, 16))
        if end < begin or (end - begin) % 0x68 or (end - begin) // 0x68 > 64:
            raise RuntimeError('Invalid trimmed record vector')
        for offset in range(0, end - begin, 0x68):
            identity, kind, flag = struct.unpack('<Q8xII', memory(frame, begin + offset + 0x20, 24))
            processing['channels'].append({'identity': identity, 'kind': kind, 'flag': flag})
            pointer, length = struct.unpack('<2Q', memory(frame, begin + offset + 0x38, 16))
            trimmed.append(dump(f'trimmed-{len(trimmed)}.bin', memory(frame, pointer, length * 4)))
        for hook in hooks[:4 if BLEND_CAPTURE else 5]:
            hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def after_filter(frame, breakpoint, _):
    global processing
    try:
        if not completed or not captured_source:
            return False
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != captured_source['state']:
            raise RuntimeError('Filtered state differs from captured source')
        begin, end = struct.unpack('<2Q', memory(frame, state + 0x110, 16))
        if end < begin or (end - begin) % 0x68 or (end - begin) // 0x68 > 64:
            raise RuntimeError('Invalid filtered record vector')
        if processing is None:
            if not LEADING_CAPTURE or frame.FindRegister('x20').GetValueAsUnsigned() != state:
                raise RuntimeError('Missing processing configuration')
            wrapper = frame.FindRegister('x19').GetValueAsUnsigned()
            processing = {
                'sampleRate': struct.unpack('<f', memory(frame, wrapper + 0x3c, 4))[0],
                'cutoff': struct.unpack('<f', memory(frame, wrapper + 0x164, 4))[0],
                'adjustmentNumerator': struct.unpack('<f', memory(frame, wrapper + 0xa0, 4))[0],
                'adjustmentDenominator': struct.unpack('<f', memory(frame, wrapper + 0x1e0, 4))[0],
                'channels': [],
            }
            for offset in range(0, end - begin, 0x68):
                identity, kind, flag = struct.unpack('<Q8xII', memory(frame, begin + offset + 0x20, 24))
                processing['channels'].append({'identity': identity, 'kind': kind, 'flag': flag})
        for offset in range(0, end - begin, 0x68):
            pointer, length = struct.unpack('<2Q', memory(frame, begin + offset + 0x38, 16))
            filtered.append(dump(f'filtered-{len(filtered)}.bin', memory(frame, pointer, length * 4)))
        if BLEND_CAPTURE:
            vector = frame.FindRegister('x1').GetValueAsUnsigned()
            first, last = struct.unpack('<2Q', memory(frame, vector, 16))
            if last < first or (last - first) % 4 or last - first > 4096:
                raise RuntimeError('Invalid blend coefficients')
            kernel = frame.FindRegister('x4').GetValueAsUnsigned()
            kernel_length = struct.unpack('<Q', memory(frame, kernel + 8, 8))[0]
            processing['blend'] = {
                'coefficients': list(struct.unpack('<' + 'f' * ((last - first) // 4),
                                                  memory(frame, first, last - first))),
                'kernelLength': kernel_length,
                'mainCount': struct.unpack('<Q', memory(frame, state + 0x128, 8))[0],
                'flags': frame.FindRegister('w2').GetValueAsUnsigned(),
            }
        for hook in hooks[:4 if LEADING_CAPTURE else 5 if BLEND_CAPTURE else 6]:
            hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def after_blend(frame, breakpoint, _):
    try:
        if not filtered or not processing or not BLEND_CAPTURE:
            return False
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != captured_source['state']:
            raise RuntimeError('Blended state differs from captured source')
        begin, end = struct.unpack('<2Q', memory(frame, state + 0x110, 16))
        if end < begin or (end - begin) % 0x68 or (end - begin) // 0x68 > 64:
            raise RuntimeError('Invalid blended record vector')
        processing['blend']['leadingSilenceMode'] = frame.FindRegister('w1').GetValueAsUnsigned()
        for offset in range(0, end - begin, 0x68):
            pointer, length = struct.unpack('<2Q', memory(frame, begin + offset + 0x38, 16))
            blended.append(dump(f'blended-{len(blended)}.bin', memory(frame, pointer, length * 4)))
        for hook in hooks[:5 if LEADING_CAPTURE else len(hooks)]:
            hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def after_leading(frame, breakpoint, _):
    try:
        if not blended or not processing or not LEADING_CAPTURE:
            return False
        state = frame.FindRegister('x0').GetValueAsUnsigned()
        if state != captured_source['state']:
            raise RuntimeError('Leading-silence state differs from captured source')
        begin, end = struct.unpack('<2Q', memory(frame, state + 0x110, 16))
        if end < begin or (end - begin) % 0x68 or (end - begin) // 0x68 > 64:
            raise RuntimeError('Invalid leading-silence record vector')
        for offset in range(0, end - begin, 0x68):
            pointer, length = struct.unpack('<2Q', memory(frame, begin + offset + 0x38, 16))
            leading.append(dump(f'leading-{len(leading)}.bin', memory(frame, pointer, length * 4)))
        for hook in hooks:
            hook.SetEnabled(False)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def launch_and_run(debugger, argv):
    """Resume only initial launch and callback-owned breakpoint/trace stops."""
    import lldb
    global run_status
    debugger.SetAsync(False)
    target = debugger.GetSelectedTarget()
    launch = lldb.SBLaunchInfo(argv)
    launch.SetLaunchFlags(lldb.eLaunchFlagStopAtEntry | lldb.eLaunchFlagDisableASLR)
    error = lldb.SBError()
    process = target.Launch(launch, error)
    if error.Fail():
        raise RuntimeError(str(error))
    owned_ids = {hook.GetID() for hook in hooks}
    audit = []
    initial = True
    while process.GetState() == lldb.eStateStopped:
        if len(audit) >= 128:
            raise RuntimeError('Owned stop limit exceeded')
        stops = []
        for thread in process:
            reason = thread.GetStopReason()
            if reason in (lldb.eStopReasonNone, lldb.eStopReasonInvalid):
                continue
            detail = {'thread': thread.GetThreadID(), 'reason': reason,
                      'description': thread.GetStopDescription(256)}
            stops.append(detail)
            owned = reason == lldb.eStopReasonTrace
            if reason == lldb.eStopReasonBreakpoint:
                ids = [thread.GetStopReasonDataAtIndex(i)
                       for i in range(0, thread.GetStopReasonDataCount(), 2)]
                owned = bool(ids) and all(value in owned_ids for value in ids)
            launch_stop = initial and (reason == lldb.eStopReasonExec or
                (reason == lldb.eStopReasonSignal and
                 thread.GetStopReasonDataAtIndex(0) == signal.SIGSTOP))
            if not owned and not launch_stop:
                raise RuntimeError('Unowned stop: ' + json.dumps(detail))
        audit.append({'initial': initial, 'threads': stops})
        initial = False
        run_status = {'pid': process.GetProcessID(), 'ownedResumes': audit, 'terminal': False}
        save()
        error = process.Continue()
        if error.Fail():
            raise RuntimeError(str(error))
    run_status = {'pid': process.GetProcessID(), 'ownedResumes': audit,
                  'state': process.GetState(), 'terminal': process.GetState() == lldb.eStateExited,
                  'exitStatus': process.GetExitStatus()}
    save()
    return run_status


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    assert not (ROOT / 'runtime.json').exists(), 'Fresh directory required'
    sites = [(0x1005a8874, 'source_entry'), (0x1005ab0e0, 'worker'),
             (0x1005a91c8, 'after_propagation')]
    if not BLEND_CAPTURE:
        sites.append((0x1005a9578, 'after_conversion'))
    if not LEADING_CAPTURE:
        sites.append((0x100817ab0, 'after_trim'))
    sites.append((0x1006c5ce8, 'after_filter'))
    if BLEND_CAPTURE:
        sites.append((0x10019dfc4, 'after_blend'))
    if LEADING_CAPTURE:
        sites.append((0x10069c084, 'after_leading'))
    for address, callback in sites:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        hook.SetScriptCallbackFunction(__name__ + '.' + callback)
        hook.SetAutoContinue(True)
        hooks.append(hook)
    save()
