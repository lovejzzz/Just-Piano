"""One read-only route-entry point: final voice matrices and actual cache heads.

Cache heads are observed coordinates, not an independently generated mix clock.
"""
import hashlib
import json
import os
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack, memory

rows, errors, voices, last = [], [], {}, {}
stream = None
main_thread = None
WITH_GLOBAL = os.environ.get('PIANOTEQ_KEY_GLOBAL') == '1'
global_rows, global_stream, waiting = [], None, []


def save():
    stream.flush()
    path = base.ROOT / 'runtime.json'
    data = {'schema': 1, 'runStatus': base.run_status, 'errors': base.errors,
            'hardwareBreakpoints': len(base.hooks), 'targetMutation': False}
    terminal = bool(base.run_status and base.run_status.get('terminal'))
    data.update(keyAudioRecords=rows, keyAudioErrors=errors, keyAudioSite='0x10051fad4',
                keyAudioFile='key-audio.bin', keyAudioBytes=stream.tell(),
                keyAudioSha256=hashlib.sha256((base.ROOT / 'key-audio.bin').read_bytes()).hexdigest() if terminal else None,
                cacheHeadsAreObserved=True, mainThread=main_thread, breakpointThreadIndex=1,
                breakpointDiagnostics=[{'id': h.GetID(), 'hits': h.GetHitCount(), 'hardware': h.IsHardware()}
                                       for h in base.hooks])
    if WITH_GLOBAL:
        global_stream.flush()
        data.update(keyGlobalSameRun=True, globalAudioRecords=global_rows,
                    globalAudioFile='global-audio.bin', globalAudioBytes=global_stream.tell(),
                    globalAudioSha256=hashlib.sha256((base.ROOT / 'global-audio.bin').read_bytes()).hexdigest() if terminal else None,
                    pendingGlobalContributors=waiting)
    temporary = base.ROOT / 'runtime.json.tmp'
    temporary.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False))
    temporary.chmod(0o600)
    temporary.replace(path)


def matrix(frame, descriptor):
    height, capacity, width, pitch = unpack(frame, descriptor, 'IIII')
    if height != 3 or not height <= capacity <= 8 or width != 64 or not width <= pitch <= 8192:
        raise ValueError('Three complete row-major route input rows required')
    pointer = scalar(frame, descriptor + 16, 'Q')
    return [memory(frame, pointer + row * pitch * 4, 256) for row in range(height)], [height, capacity, width, pitch]


def cache_heads(frame, root):
    begin, end = unpack(frame, root, 'QQ')
    if end - begin != 3 * 80: raise ValueError('Three route-cache rows required')
    result = []
    for i in range(3):
        row = begin + 80 * i
        result.append({name: scalar(frame, row + offset, 'I') for name, offset in
                       [('smallChunk', 0x38), ('bigChunk', 0x3c), ('total', 0x44), ('head', 0x48)]})
    return {'root': hex(root), 'sampleRate': scalar(frame, root + 24),
            'maximumDelay': scalar(frame, root + 28), 'rows': result}


def mapping(frame, pointer):
    begin, end = unpack(frame, pointer, 'QQ')
    if end < begin or (end - begin) % 96 or (end - begin) // 96 > 128:
        raise ValueError('Bounded routing mapping required')
    entries = []
    for address in range(begin, end, 96):
        source, destination = unpack(frame, address, 'II')
        taps = scalar(frame, address + 8, 'Q')
        if taps != 1: raise ValueError('Inspected single routing tap required')
        entries.append({'source': source, 'destination': destination,
                        'tapWords': list(unpack(frame, address + 16, 'IIIIII'))})
    return {'entries': entries, 'wrap': scalar(frame, pointer + 24, 'B')}


def global_observed(frame, workspace=None):
    # A caller may supply an actual workspace pointer read from its owned frame.
    if workspace is None: workspace = frame.FindRegister('x2').GetValueAsUnsigned()
    begin, end = unpack(frame, workspace + 0x270, 'QQ')
    if end - begin != 312 or len(global_rows) >= 4096:
        raise ValueError('Bounded three-group global workspace required')
    chunks, layouts = [], []
    for descriptor in [begin + 104 * i for i in range(3)] + [workspace + 0x120]:
        values, layout = matrix(frame, descriptor)
        chunks.extend(values); layouts.append(layout)
    roots = [workspace + 0x2d0] + [begin + i * 104 + 56 for i in range(3)]
    metadata = [cache_heads(frame, root) for root in roots]
    for root, cache in zip(roots, metadata):
        rb = scalar(frame, root, 'Q')
        for i, row in enumerate(cache['rows']):
            fb, fe = unpack(frame, rb + 80 * i + 0x20, 'QQ')
            if fe - fb != row['total'] // row['bigChunk'] * 2:
                raise ValueError('Complete routing validity flags required')
            row['flags'] = list(unpack(frame, fb, 'H' * ((fe - fb) // 2)))
    raw = b''.join(chunks)
    global_rows.append({'ordinal': len(global_rows), 'globalFrame': len(global_rows) * 64,
                        'offset': global_stream.tell(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                        'layouts': layouts, 'cacheHeads': metadata, 'contributors': list(waiting)})
    global_stream.write(raw); waiting.clear()
    if len(global_rows) % 128 == 0: save()


def observed(frame, location, _):
    global main_thread
    try:
        pc = frame.GetPCAddress().GetFileAddress()
        if pc not in ([0x10051fad4, 0x1006c2ac4] if WITH_GLOBAL else [0x10051fad4]) or location.GetAddress().GetFileAddress() != pc:
            raise ValueError('Exact owned key routing entry required')
        thread = frame.GetThread().GetThreadID()
        if frame.GetThread().GetIndexID() != 1: raise ValueError('Main consumer thread index required')
        if main_thread is None: main_thread = thread
        if thread != main_thread: raise ValueError('Single routing thread required')
        if pc == 0x1006c2ac4:
            global_observed(frame)
            return False
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        manager, slot, workspace, voice = [reg(r) for r in ('x0', 'x1', 'x2', 'x3')]
        age = scalar(frame, voice + 0x6c, 'I')
        if voice not in voices:
            if age != 64 or len(voices) >= 5: raise ValueError('Five age-64 routing starts required')
            voices[voice] = len(voices)
        epoch, counter = voices[voice], age - 64
        if len(rows) >= 20000 or counter != last.get(epoch, -64) + 64 or scalar(frame, workspace, 'Q') != 3:
            raise ValueError('Complete bounded contiguous three-group voice required')
        chunks, layouts = [], []
        for descriptor in [workspace + 8 + 56 * i for i in range(3)] + [workspace + 0xb0]:
            values, layout = matrix(frame, descriptor)
            chunks.extend(values); layouts.append(layout)
        begin, end = unpack(frame, workspace + 0x270, 'QQ')
        if end - begin != 312: raise ValueError('Three group-route descriptors required')
        roots = [workspace + 0x2d0] + [begin + i * 104 + 56 for i in range(3)]
        count = scalar(frame, voice + 0x100, 'Q')
        if count != 3: raise ValueError('Three group selection flags required')
        raw = b''.join(chunks)
        rows.append({'ordinal': len(rows), 'epoch': epoch, 'voice': hex(voice),
                     'voiceBlockCounter': counter, 'nativeAge': age, 'offset': stream.tell(),
                     'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'layouts': layouts,
                     'manager': hex(manager), 'slot': hex(slot), 'workspace': hex(workspace),
                     'cacheHeads': [cache_heads(frame, root) for root in roots],
                     'groupGains': list(unpack(frame, voice + 0xb8, 'fff')),
                     'selectionMask': list(unpack(frame, voice + 0x108, 'III'))})
        if WITH_GLOBAL:
            begin, end = unpack(frame, slot + 0xe8, 'QQ')
            if end - begin != 96: raise ValueError('Three per-group routing tables required')
            rows[-1].update(globalOrdinal=len(global_rows),
                            mappings=[mapping(frame, slot + 0xc8)] + [mapping(frame, begin + 32 * i) for i in range(3)])
            waiting.append({'epoch': epoch, 'counter': counter, 'keyOrdinal': len(rows) - 1})
        stream.write(raw); last[epoch] = counter
        if len(rows) % 128 == 0: save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks: hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    global stream, global_stream
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh private directory required')
    stream = (base.ROOT / 'key-audio.bin').open('xb')
    if WITH_GLOBAL: global_stream = (base.ROOT / 'global-audio.bin').open('xb')
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address 0x10051fad4 --shlib "Pianoteq 9"', result)
    if not result.Succeeded(): raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    error = hook.SetScriptCallbackFunction(__name__ + '.observed')
    if error and error.Fail(): raise RuntimeError(str(error))
    hook.SetAutoContinue(True); base.hooks.append(hook)
    if WITH_GLOBAL:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address 0x1006c2ac4 --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save = save
    save()
