"""One-site read-only note-off inputs, key nodes and linked voice handoff state."""
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar

records, errors = [], []
original_save = base.save


def regfloat(frame, name):
    import lldb
    error = lldb.SBError()
    word = frame.FindRegister(name).GetData().GetUnsignedInt32(error, 0)
    if error.Fail():
        raise RuntimeError(str(error))
    return struct.unpack('<f', struct.pack('<I', word))[0]


def save():
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    data.update(noteOffRecords=records, noteOffErrors=errors,
                noteOffSite='0x1005b5698', targetMutation=False)
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


base.save = save


def observed(frame, location, _):
    try:
        if frame.GetPCAddress().GetFileAddress() != 0x1005b5698 or \
                location.GetAddress().GetFileAddress() != 0x1005b5698:
            raise ValueError('Owned note-off site required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        key = reg('x0')
        node = scalar(frame, key + 0x20, 'Q')
        if not node:
            return False  # Initialization/empty-key calls are not voice-link observations.
        if len(records) >= 16:
            raise ValueError('Bounded nonempty note-off calls required')
        nodes, visited = [], set()
        while node:
            if node in visited or len(nodes) >= 16:
                raise ValueError('Bounded acyclic key-node chain required')
            visited.add(node)
            voice = scalar(frame, node + 0x20, 'Q')
            voices, voice_seen = [], set()
            while voice:
                if voice in voice_seen or len(voices) >= 16:
                    raise ValueError('Bounded acyclic voice chain required')
                voice_seen.add(voice)
                voices.append({'voice': hex(voice), 'counter': scalar(frame, voice + 0x6c, 'I'),
                               'velocity': scalar(frame, voice + 0x78),
                               'override14c': scalar(frame, voice + 0x14c),
                               'position': scalar(frame, voice + 0x2ec8),
                               'pendingPosition': scalar(frame, voice + 0x2f9c),
                               'pendingSamples': scalar(frame, voice + 0x2f94, 'I'),
                               'pending': scalar(frame, voice + 0x2f98, 'B'),
                               'release': scalar(frame, voice + 0x2f99, 'B'),
                               'direction': scalar(frame, voice + 0x2f9a, 'B'),
                               'mode': scalar(frame, voice + 0x2fa4, 'B'),
                               'cap3084': scalar(frame, voice + 0x3084)})
                voice = scalar(frame, voice + 0x30f0, 'Q')
            nodes.append({'node': hex(node), 'id': scalar(frame, node + 0xc, 'I'),
                          'tag': scalar(frame, node + 0x10, 'I'), 'mask': scalar(frame, node + 0x28, 'I'),
                          'position': scalar(frame, node), 'intermediate': scalar(frame, node + 4),
                          'velocity': scalar(frame, node + 8), 'voices': voices})
            node = scalar(frame, node + 0x18, 'Q')
        records.append({'ordinal': len(records), 'key': hex(key), 'release': regfloat(frame, 's0'),
                        'id': reg('w1'), 'tag': reg('w2'), 'clearMask': reg('w3'),
                        'negativeOnly': reg('w4'), 'controls': {
                            'baseTime': scalar(frame, key + 0x38),
                            'maximumTime': scalar(frame, key + 0x3c),
                            'amplitudeScale': scalar(frame, key + 0x40)}, 'nodes': nodes})
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
        raise ValueError('Fresh observation directory required')
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        'breakpoint set --hardware --address 0x1005b5698 --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail():
        raise RuntimeError(str(error))
    hook.SetAutoContinue(True)
    base.hooks.append(hook)
    save()
