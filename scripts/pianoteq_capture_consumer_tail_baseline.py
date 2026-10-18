"""Same-thread read-only capture before release injection and after terminal envelopes.

Consumer input is already downstream of worker/delay processing. It must never
be labeled raw worker output or used as independent synthesizer input.
"""
import hashlib
import json
import os
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack, memory
from pianoteq_capture_worker_tail_baseline import read_rows, tail_state

# Imported helpers install save wrappers. Use the original soundboard writer.
import pianoteq_capture_worker_audio_baseline as worker_helper
original_save = worker_helper.original_save
births, errors, records, streams, last = [], [], {'consumer': [], 'tail': []}, {}, {}
sites = {0x10035ef10: 'birth', 0x100460908: 'consumer', 0x100460f1c: 'tail'}
TAIL_ONLY = os.environ.get('PIANOTEQ_TAIL_ONLY') == '1'
if TAIL_ONLY: sites = {0x100460f1c: 'tail'}
voices = {}
main_thread = None


def save():
    original_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    terminal = bool(base.run_status and base.run_status.get('terminal'))
    data.update(consumerTailErrors=errors, birthRecords=births, mainThread=main_thread, tailOnly=TAIL_ONLY,
                consumerInputIsRawWorkerOutput=False,
                breakpointDiagnostics=[{'id': h.GetID(), 'hits': h.GetHitCount(),
                    'hardware': h.IsHardware(), 'enabled': h.IsEnabled()} for h in base.hooks])
    for name, rows in records.items():
        stream = streams[name]
        stream.flush()
        file = base.ROOT / (name + '-audio.bin')
        data[name + 'AudioRecords'] = rows
        data[name + 'AudioFile'] = file.name
        data[name + 'AudioBytes'] = stream.tell()
        data[name + 'AudioSha256'] = hashlib.sha256(file.read_bytes()).hexdigest() if terminal else None
    path.write_text(json.dumps(data, indent=2, allow_nan=False))


def record_stop_diagnostics(debugger):
    """Read the actual stop; never resume an exception or manufacture ownership."""
    process = debugger.GetSelectedTarget().GetProcess()
    threads = []
    for thread in list(process)[:64]:
        frames = []
        for frame in list(thread)[:8]:
            module = frame.GetModule().GetFileSpec()
            frames.append({'pc': hex(frame.GetPC()),
                           'fileAddress': hex(frame.GetPCAddress().GetFileAddress()),
                           'module': str(module), 'function': frame.GetFunctionName(),
                           'symbol': frame.GetSymbol().GetName()})
        threads.append({'id': thread.GetThreadID(), 'reason': thread.GetStopReason(),
                        'description': thread.GetStopDescription(512), 'frames': frames})
    result = {'state': process.GetState(), 'pid': process.GetProcessID(), 'threads': threads,
              'hooks': [{'id': h.GetID(), 'hits': h.GetHitCount(),
                         'address': hex(h.GetLocationAtIndex(0).GetAddress().GetFileAddress())}
                        for h in base.hooks], 'targetMutation': False, 'resumeAttempted': False}
    path = base.ROOT / 'stop-diagnostics.json'
    if path.exists(): raise ValueError('Fresh stop diagnostic required')
    path.write_text(json.dumps(result, indent=2))
    path.chmod(0o600)
    save()
    return result


def observed(frame, location, _):
    global main_thread
    try:
        pc = frame.GetPCAddress().GetFileAddress()
        if pc not in sites or pc != location.GetAddress().GetFileAddress():
            raise ValueError('Exact owned observation site required')
        thread = frame.GetThread().GetThreadID()
        if main_thread is None: main_thread = thread
        if thread != main_thread: raise ValueError('One consumer thread required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        name = sites[pc]
        if name == 'birth':
            voice, model = reg('x22'), reg('x25')
            if scalar(frame, model + 0x14) != 69 or len(births) >= 5 or voice in voices:
                raise ValueError('Five unique A4 source starts required')
            epoch = len(births)
            voices[voice] = epoch
            births.append({'epoch': epoch, 'voice': hex(voice), 'note': 69,
                           'managerSamples': scalar(frame, reg('x19') + 0xd00, 'Q')})
            save()
            return False
        voice, matrix = reg('x19'), reg('x23')
        if TAIL_ONLY and voice not in voices:
            if len(voices) >= 5 or scalar(frame, voice + 0x6c, 'I') != 0:
                raise ValueError('Five first-terminal counter-zero identities required')
            voices[voice] = len(voices)
            births.append({'epoch': voices[voice], 'voice': hex(voice),
                           'identitySource': 'first-terminal-counter-zero'})
        if voice not in voices or scalar(frame, matrix, 'Q') != 3:
            raise ValueError('Known three-group source voice required')
        epoch, counter = voices[voice], scalar(frame, voice + 0x6c, 'I')
        key = (name, epoch)
        if len(records[name]) >= 20000 or counter != last.get(key, -64) + 64:
            raise ValueError('Bounded complete contiguous consumer chronology required')
        if name == 'tail' and not TAIL_ONLY and (not records['consumer'] or
                (records['consumer'][-1]['epoch'], records['consumer'][-1]['consumerCounter']) != (epoch, counter)):
            raise ValueError('Same-call consumer input required')
        chunks, layouts = [], []
        for group in range(3):
            values, layout = read_rows(frame, matrix + 8 + 56 * group, 1)
            chunks.extend(values); layouts.append(layout)
        if name == 'tail':
            values, layout = read_rows(frame, reg('x21'), 3)
            chunks.extend(values); layouts.append(layout)
        raw, stream = b''.join(chunks), streams[name]
        row = {'ordinal': len(records[name]), 'epoch': epoch, 'voice': hex(voice),
               'consumerCounter': counter, 'workerCounter': scalar(frame, voice + 0x178, 'I'),
               'offset': stream.tell(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
               'layouts': layouts, 'currentControl': scalar(frame, voice + 0x2ec8),
               'publishedRelease': scalar(frame, voice + 0x2f24), 'rattle': scalar(frame, voice + 0x2f38),
               'tail': tail_state(frame, voice)}
        stream.write(raw); records[name].append(row); last[key] = counter
        if len(records[name]) % 128 == 0: save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks: hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh private directory required')
    for name in records: streams[name] = (base.ROOT / (name + '-audio.bin')).open('xb')
    for address in sites:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            'breakpoint set --hardware --address ' + hex(address) + ' --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save = save
    save()
