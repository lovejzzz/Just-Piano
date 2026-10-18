"""One-site read-only worker output; preserve every float32 block as private bytes."""
import hashlib
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack, memory

rows, errors, voices, last = [], [], {}, {}
stream = None
original_save = base.save


def save():
    if stream:
        stream.flush()
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    terminal = bool(base.run_status and base.run_status.get('terminal'))
    audio = base.ROOT / 'worker-audio.bin'
    data.update(workerAudioRecords=rows, workerAudioErrors=errors,
                workerAudioSite='0x100472fd0', workerAudioFile='worker-audio.bin',
                workerAudioBytes=stream.tell() if stream else 0,
                workerAudioSha256=hashlib.sha256(audio.read_bytes()).hexdigest() if terminal else None)
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x100472fd0 or \
                location.GetAddress().GetFileAddress() != 0x100472fd0 or len(rows) >= 20000:
            raise ValueError('Owned bounded worker-output site required')
        modal = frame.FindRegister('x19').GetValueAsUnsigned()
        voice = modal - 0x168
        matrix = frame.FindRegister('x20').GetValueAsUnsigned()
        if voice not in voices:
            if len(voices) >= 5:
                raise ValueError('Five-voice fixture required')
            voices[voice] = len(voices)
        epoch = voices[voice]
        counter = scalar(frame, modal + 0x10, 'I')
        groups = scalar(frame, matrix, 'Q')
        if groups != 3 or counter != last.get(epoch, 0) + 64:
            raise ValueError('Complete contiguous three-group worker output required')
        chunks, layouts = [], []
        for group in range(groups):
            descriptor = matrix + 8 + 56 * group
            height, row_capacity, width, row_pitch = unpack(frame, descriptor, 'IIII')
            # 6906ec..690710 addresses row r as data+r*descriptor[0xc].
            # Samples within that row are contiguous; +0xc is not sample stride.
            if height != 1 or not 1 <= row_capacity <= 8 or width != 64 or not width <= row_pitch <= 8192:
                raise ValueError('Supported row-major 64-sample matrix required')
            layouts.append([height, row_capacity, width, row_pitch])
            chunks.append(memory(frame, scalar(frame, descriptor + 16, 'Q'), 64 * 4))
        raw = b''.join(chunks)
        offset = stream.tell()
        stream.write(raw)
        rows.append({'ordinal': len(rows), 'epoch': epoch, 'voice': hex(voice),
                     'workerEndCounter': counter, 'consumerCounter': scalar(frame, voice + 0x6c, 'I'),
                     'velocity': scalar(frame, voice + 0x78), 'offset': offset, 'bytes': len(raw),
                     'layouts': layouts,
                     'sha256': hashlib.sha256(raw).hexdigest(),
                     'u': scalar(frame, modal + 0x8cc), 'releaseFlag': scalar(frame, modal + 0x924, 'B'),
                     'rattle': scalar(frame, modal + 0x8c4), 'releaseProgress': scalar(frame, modal + 0x948),
                     'duration': scalar(frame, modal + 0x944), 'rate': scalar(frame, modal + 0x7e4),
                     'gain': scalar(frame, modal + 0x7b0)})
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


def __lldb_init_module(debugger, _):
    import lldb
    global stream
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists():
        raise ValueError('Fresh observation directory required')
    stream = (base.ROOT / 'worker-audio.bin').open('xb')
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x100472fd0 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
