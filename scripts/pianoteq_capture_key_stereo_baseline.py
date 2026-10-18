"""Read-only full route/shared/feedback/cabinet/PCM observations for the NY fixture.

Raw input audio, IR initialization and DSP profiles are private diagnostic data.
The existing owned-resume driver is used without any exception relaxation.
"""
import hashlib
import json
import os
import traceback
import pianoteq_capture_key_audio_baseline as key
import pianoteq_capture_feedback_stereo as profile
from pianoteq_damper_runtime_capture import scalar, unpack, memory
from pianoteq_capture_key_routes import cache
from pianoteq_capture_source_amplitude import regfloat

base = key.base
original_key_save = key.save
records, errors, configurations, ir_inputs = [], [], {}, {}
stream = None
pending = None
WITH_WRITER = os.environ.get('PIANOTEQ_CAPTURE_WRITER') == '1'
writer_transitions = []
sites = {0x1002a4334: 'irCopy', 0x1006c2fd4: 'feedbackRoute',
         0x1000ef37c: 'cabinet', 0x1001bc114: 'pcm'}
if WITH_WRITER: sites[0x10091baa4] = 'writer'


def save():
    if stream: stream.flush()
    original_key_save()
    path = base.ROOT / 'runtime.json'
    data = json.loads(path.read_text())
    terminal = bool(base.run_status and base.run_status.get('terminal'))
    data.update(keyStereoSameRun=True, downstreamRecords=records, downstreamErrors=errors,
                downstreamFile='downstream-audio.bin', downstreamBytes=stream.tell() if stream else 0,
                downstreamSha256=hashlib.sha256((base.ROOT / 'downstream-audio.bin').read_bytes()).hexdigest() if terminal else None,
                downstreamConfigurations=configurations, irCopyCount=len(ir_inputs), downstreamPending=pending)
    data.update(writerInputObserved=WITH_WRITER, writerTransitions=writer_transitions,
                activeHardwareBreakpoints=sum(h.IsEnabled() for h in base.hooks))
    if WITH_WRITER:
        key.global_stream.flush()
        data.update(keyGlobalSameRun=True, globalAudioBoundary='post-feedback', globalSnapshotSite='0x1006c2fd4',
            globalAudioRecords=key.global_rows, globalAudioFile='global-audio.bin', globalAudioBytes=key.global_stream.tell(),
            globalAudioSha256=hashlib.sha256((base.ROOT / 'global-audio.bin').read_bytes()).hexdigest() if terminal else None,
            pendingGlobalContributors=key.waiting)
    temporary = base.ROOT / 'runtime.json.tmp'
    temporary.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False))
    temporary.chmod(0o600); temporary.replace(path)


def matrix(frame, descriptor, rows):
    height, capacity, width, pitch = unpack(frame, descriptor, 'IIII')
    if height != rows or not rows <= capacity <= 16 or width != 64 or not 64 <= pitch <= 8192:
        raise ValueError('Complete bounded downstream matrix required')
    pointer = scalar(frame, descriptor + 16, 'Q')
    return [memory(frame, pointer + row * pitch * 4, 256) for row in range(rows)], [height, capacity, width, pitch]


def append_audio(frame, row, matrices):
    chunks, layouts = [], []
    for descriptor, count in matrices:
        values, layout = matrix(frame, descriptor, count)
        chunks.extend(values); layouts.append(layout)
    raw = b''.join(chunks)
    row.update(ordinal=len(records), offset=stream.tell(), bytes=len(raw),
               sha256=hashlib.sha256(raw).hexdigest(), layouts=layouts)
    stream.write(raw); records.append(row)


def observed(frame, location, internal):
    global pending
    try:
        pc = frame.GetPCAddress().GetFileAddress()
        if pc != location.GetAddress().GetFileAddress() or frame.GetThread().GetIndexID() != 1:
            raise ValueError('Exact main-thread owned downstream point required')
        if pc in (0x10051fad4, 0x1006c2ac4):
            if pc == 0x1006c2ac4 and pending is not None:
                raise ValueError('Prior cabinet call must complete before next workspace')
            result = key.observed(frame, location, internal)
            if key.errors: return result
            if pc == 0x10051fad4 and WITH_WRITER:
                row = key.rows[-1]
                slot = frame.FindRegister('x1').GetValueAsUnsigned()
                begin, end = unpack(frame, slot + 0xe8, 'QQ')
                if end - begin != 96: raise ValueError('Three per-group routing tables required')
                row.update(globalOrdinal=len(key.global_rows),
                    mappings=[key.mapping(frame, slot + 0xc8)] + [key.mapping(frame, begin + 32 * i) for i in range(3)])
                key.waiting.append({'epoch': row['epoch'], 'counter': row['voiceBlockCounter'], 'keyOrdinal': row['ordinal']})
            if pc == 0x1006c2ac4:
                state = scalar(frame, frame.FindRegister('x0').GetValueAsUnsigned() + 0x50, 'Q')
                key.global_rows[-1].update(feedbackGain=scalar(frame, state + 0x114),
                    feedbackPreRoute=scalar(frame, state + 0x329, 'B') & 1,
                    feedbackEnabled=scalar(frame, state + 0x10c, 'B'),
                    globalExcitationEnabled=scalar(frame, state + 0x10d, 'B'))
            return result
        if pc not in sites or len(records) >= 16000: raise ValueError('Bounded downstream point required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        name = sites[pc]
        if name == 'irCopy':
            if configurations: return False
            obj, span = reg('x0'), reg('x1')
            size = scalar(frame, obj + 8, 'Q')
            if size not in (64, 512): return False
            if scalar(frame, span + 8, 'Q') != size: raise ValueError('Exact IR copy span required')
            ir_inputs[(size, hex(obj))] = list(unpack(frame, scalar(frame, span, 'Q'), 'f' * size))
            return False
        if name == 'writer':
            samples, channels, offset = reg('w24'), reg('w22'), reg('w27')
            if pending is not None or channels != 2 or not 0 < samples <= 4096 or offset + samples > 4096:
                raise ValueError('Bounded post-render stereo writer span required')
            pointers = unpack(frame, reg('x20'), 'QQ')
            raw = b''.join(memory(frame, p + offset * 4, samples * 4) for p in pointers)
            records.append({'stage': name, 'ordinal': len(records), 'afterGlobalBlocks': len(key.global_rows),
                'samples': samples, 'channels': channels, 'sourceOffsetFrames': offset,
                'offset': stream.tell(), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
            stream.write(raw)
            if len(records) % 128 == 0: save()
            return False
        if name == 'feedbackRoute':
            state = reg('x21')
            if WITH_WRITER:
                owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1001bb9ac]
                if len(owners) != 1: raise ValueError('Unique actual global-route manager caller required')
                manager = owners[0].FindRegister('x19').GetValueAsUnsigned()
                workspace = scalar(frame, scalar(frame, manager + 0xc08, 'Q') + 0x2f0, 'Q')
                key.global_observed(frame, workspace)
                key.global_rows[-1].update(feedbackGain=scalar(frame, state + 0x114),
                    feedbackPreRoute=scalar(frame, state + 0x329, 'B') & 1,
                    feedbackEnabled=scalar(frame, state + 0x10c, 'B'),
                    globalExcitationEnabled=scalar(frame, state + 0x10d, 'B'))
            if not key.global_rows: raise ValueError('Actual workspace predecessor required')
            ordinal = len(key.global_rows) - 1
            flags_begin, flags_end = unpack(frame, state + 0x3a0, 'QQ')
            if flags_end - flags_begin != 12: raise ValueError('Three feedback row masks required')
            append_audio(frame, {'stage': name, 'globalOrdinal': ordinal,
                'state': hex(state), 'cache': cache(frame, state + 0x2c8),
                'mapping': profile.mapping(frame, state + 0x288), 'gain': regfloat(frame, 's0', 'f'),
                'gateEnabled': scalar(frame, state + 0x3b8, 'B'),
                'rowFlags': list(unpack(frame, flags_begin, 'III'))}, [(reg('x19'), 2), (state + 0x118, 3)])
        elif name == 'cabinet':
            if not key.global_rows: raise ValueError('Actual global-route predecessor required')
            ordinal = len(key.global_rows) - 1
            state = reg('x1')
            if scalar(frame, state, 'I') != 0x3d396: return False
            if pending is not None: raise ValueError('One cabinet call at a time required')
            owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1001bbce4]
            if len(owners) != 1: raise ValueError('Unique actual cabinet manager caller required')
            manager = owners[0].FindRegister('x19').GetValueAsUnsigned()
            workspace = scalar(frame, scalar(frame, manager + 0xc08, 'Q') + 0x2f0, 'Q')
            if reg('x2') != workspace + 0x288: raise ValueError('Actual flattened cabinet descriptor required')
            identity = hex(state)
            if identity not in configurations:
                if configurations: raise ValueError('One cabinet configuration required')
                profile.time_inputs = ir_inputs
                configurations[identity] = profile.configure(frame, state)
                configurations[identity]['post'] = profile.post_profile(frame, manager)
                if WITH_WRITER:
                    copy_hook, writer_hook = base.hooks[1], base.hooks[-1]
                    copy_hook.SetEnabled(False); writer_hook.SetEnabled(True)
                    writer_transitions.append({'globalOrdinal': ordinal, 'disabled': copy_hook.GetID(),
                        'enabled': writer_hook.GetID(), 'active': sum(h.IsEnabled() for h in base.hooks)})
            pending = {'state': identity, 'globalOrdinal': ordinal, 'manager': hex(manager)}
            append_audio(frame, {'stage': name, **pending, 'mode': reg('w4'),
                'gain': list(unpack(frame, state + 0x30, 'ffff'))},
                [(reg('x2'), 9), (reg('x3'), 3), (workspace + 0x120, 3)])
        else:
            if pending is None or pending['manager'] != hex(reg('x19')):
                raise ValueError('Same-call cabinet/PCM owner required')
            append_audio(frame, {'stage': name, **pending,
                'level': list(unpack(frame, reg('x19') + 0xdd8, 'ffff'))}, [(reg('x23'), 2)])
            pending = None
        if len(records) % 128 == 0: save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks: hook.SetEnabled(False)
        save()
        return True


def __lldb_init_module(debugger, internal):
    import lldb
    global stream
    if not key.WITH_GLOBAL: raise ValueError('Paired key/global mode required')
    stream = (base.ROOT / 'downstream-audio.bin').open('xb')
    if WITH_WRITER:
        key.WITH_GLOBAL = False
        key.global_stream = (base.ROOT / 'global-audio.bin').open('xb')
    key.save = save
    key.__lldb_init_module(debugger, internal)
    target = debugger.GetSelectedTarget()
    for address in sites:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            'breakpoint set --hardware --thread-index 1 --address ' + hex(address) + ' --shlib "Pianoteq 9"', result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        if address == 0x10091baa4: hook.SetEnabled(False)
        hook.SetAutoContinue(True); base.hooks.append(hook)
    for hook in base.hooks:
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
    if len(base.hooks) != 6 or sum(h.IsEnabled() for h in base.hooks) != (5 if WITH_WRITER else 6):
        raise ValueError('Six registered hardware points and bounded writer handoff required')
    base.save = save
    save()
