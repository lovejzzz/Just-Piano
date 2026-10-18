"""Three read-only sites: source identities, worker blocks, terminal groups/auxiliary."""
import hashlib
import json
import traceback
import pianoteq_capture_worker_audio_baseline as worker
from pianoteq_damper_runtime_capture import scalar, unpack, memory

base = worker.base
rows, errors, last, births, unowned = [], [], {}, [], []
stream = None
worker_callbacks = 0


def save():
    if stream:
        stream.flush()
    worker.save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    terminal = bool(base.run_status and base.run_status.get('terminal'))
    file = base.ROOT / 'tail-audio.bin'
    data.update(tailAudioRecords=rows, tailAudioErrors=errors, tailAudioSite='0x100460f1c',
                tailAudioFile='tail-audio.bin', tailAudioBytes=stream.tell() if stream else 0,
                tailAudioSha256=hashlib.sha256(file.read_bytes()).hexdigest() if terminal else None,
                birthRecords=births, unownedTailCalls=unowned,
                workerCallbackCount=worker_callbacks,
                breakpointDiagnostics=[{'id': hook.GetID(), 'hits': hook.GetHitCount(),
                                        'enabled': hook.IsEnabled(), 'hardware': hook.IsHardware(),
                                        'locations': hook.GetNumLocations()}
                                       for hook in base.hooks])
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def worker_observed(frame, location, internal):
    """Resolve through the LLDB-imported owner instead of an ordinary Python import."""
    global worker_callbacks
    worker_callbacks += 1
    return worker.observed(frame, location, internal)


def birth(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x10035ef10 or location.GetAddress().GetFileAddress() != 0x10035ef10:
            raise ValueError('Owned source-strike identity site required')
        voice = frame.FindRegister('x22').GetValueAsUnsigned()
        model = frame.FindRegister('x25').GetValueAsUnsigned()
        manager = frame.FindRegister('x19').GetValueAsUnsigned()
        if scalar(frame, model + 0x14) != 69 or len(births) >= 5 or voice in worker.voices:
            raise ValueError('Five unique A4 source starts required')
        epoch = len(births)
        worker.voices[voice] = epoch
        births.append({'epoch': epoch, 'voice': hex(voice), 'note': 69,
                       'managerSamples': scalar(frame, manager + 0xd00, 'Q')})
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:
            hook.SetEnabled(False)
        save()
        return True


def read_rows(frame, descriptor, expected_rows):
    height, capacity, width, pitch = unpack(frame, descriptor, 'IIII')
    if height != expected_rows or not height <= capacity <= 8 or width != 64 or not width <= pitch <= 8192:
        raise ValueError('Supported row-major terminal matrix required')
    pointer = scalar(frame, descriptor + 16, 'Q')
    return [memory(frame, pointer + row * pitch * 4, 64 * 4) for row in range(height)], [height, capacity, width, pitch]


def tail_state(frame, voice):
    def envelope(offset):
        a = voice + offset
        return dict(zip(('period', 'slope', 'scale', 'gain', 'step', 'target'), unpack(frame, a, 'ffffff')),
                    enabled=scalar(frame, a + 0x18, 'B'), ready=scalar(frame, a + 0x19, 'B'))
    a = voice + 0x2d88
    return {'primary': envelope(0xc80), 'secondary': envelope(0xcd4),
            'secondaryEnabled': scalar(frame, voice + 0x160, 'B'),
            'time': {'enabled': scalar(frame, a, 'B'), 'delay': scalar(frame, a + 4, 'I'),
                     'attack': scalar(frame, a + 8, 'I'), 'decay': scalar(frame, a + 12, 'I'),
                     'counter': scalar(frame, a + 16, 'I'), 'attackRate': scalar(frame, a + 24, 'd'),
                     'decayRate': scalar(frame, a + 32, 'd'), 'value': scalar(frame, a + 40, 'd')}}


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x100460f1c or \
                location.GetAddress().GetFileAddress() != 0x100460f1c or len(rows) >= 20000:
            raise ValueError('Owned bounded terminal voice site required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        voice, matrix, auxiliary = reg('x19'), reg('x23'), reg('x21')
        if voice not in worker.voices:
            if len(unowned) >= 128:
                raise ValueError('Bounded non-source terminal calls required')
            unowned.append({'voice': hex(voice), 'counter': scalar(frame, voice + 0x6c, 'I'),
                            'velocity': scalar(frame, voice + 0x78), 'groups': scalar(frame, matrix, 'Q')})
            save()
            return False
        if scalar(frame, matrix, 'Q') != 3:
            raise ValueError('Same-run initialized three-group voice required')
        epoch = worker.voices[voice]
        counter = scalar(frame, voice + 0x6c, 'I')
        if counter != last.get(epoch, -64) + 64:
            raise ValueError('Contiguous terminal voice blocks required')
        chunks, layouts = [], []
        for group in range(3):
            values, layout = read_rows(frame, matrix + 8 + group * 56, 1)
            chunks.extend(values)
            layouts.append(layout)
        values, layout = read_rows(frame, auxiliary, 3)
        chunks.extend(values)
        layouts.append(layout)
        raw = b''.join(chunks)
        offset = stream.tell()
        stream.write(raw)
        rows.append({'ordinal': len(rows), 'epoch': epoch, 'voice': hex(voice),
                     'consumerCounter': counter, 'workerCounter': scalar(frame, voice + 0x178, 'I'),
                     'velocity': scalar(frame, voice + 0x78), 'offset': offset, 'bytes': len(raw),
                     'sha256': hashlib.sha256(raw).hexdigest(), 'layouts': layouts,
                     'currentControl': scalar(frame, voice + 0x2ec8),
                     'publishedRelease': scalar(frame, voice + 0x2f24),
                     'rattle': scalar(frame, voice + 0x2f38), 'tail': tail_state(frame, voice)})
        last[epoch] = counter
        if len(rows) % 128 == 0:
            save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks:
            hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, internal):
    import lldb
    global stream
    if (base.ROOT / 'runtime.json').exists():
        raise ValueError('Fresh observation directory required')
    stream = (base.ROOT / 'tail-audio.bin').open('xb')
    worker.__lldb_init_module(debugger, internal)
    error = base.hooks[0].SetScriptCallbackFunction(__name__ + '.worker_observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    target = debugger.GetSelectedTarget()
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x100460f1c --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x10035ef10 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.birth')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    # Registering the imported worker callback can load its module into LLDB's
    # script namespace and restore worker.save. Bind the combined writer last.
    base.save = save
    save()
