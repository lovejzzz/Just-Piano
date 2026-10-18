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
WITH_LATTICE = os.environ.get('PIANOTEQ_CAPTURE_LATTICE') == '1'
WITH_MONO = os.environ.get('PIANOTEQ_CAPTURE_MONO') == '1'
if WITH_MONO:
    import pianoteq_capture_mono_body_continuous as mono
    if not WITH_LATTICE: raise ValueError('Body mode requires lattice mode')
WITH_KEY_MONO = os.environ.get('PIANOTEQ_CAPTURE_KEY_MONO') == '1'
if WITH_KEY_MONO and not WITH_MONO: raise ValueError('Key mono sources require mono targets')
WITH_LEVEL = os.environ.get('PIANOTEQ_CAPTURE_LEVEL') == '1'
if WITH_LEVEL:
    if not WITH_MONO: raise ValueError('Level phases require mono mode')
    import pianoteq_capture_drive_level_phases as level
WITH_KEY_RESONANCE = os.environ.get('PIANOTEQ_CAPTURE_KEY_RESONANCE') == '1'
if WITH_KEY_RESONANCE:
    if not WITH_KEY_MONO or not WITH_LEVEL: raise ValueError('Key recurrence requires complete mono/level capture')
    import pianoteq_capture_key_resonance as key_resonance
WITH_EXCITATION = os.environ.get('PIANOTEQ_CAPTURE_GLOBAL_EXCITATION') == '1'
if WITH_EXCITATION:
    if not WITH_KEY_RESONANCE: raise ValueError('Global excitation requires full key recurrence capture')
    import pianoteq_capture_global_excitation as excitation
mono_rows = []
mono_pending = None
if WITH_LATTICE:
    import pianoteq_capture_feedback_allpass_continuous as lattice
    if not WITH_WRITER: raise ValueError('Lattice mode requires actual writer observation')
lattice_rows, lattice_errors = [], []
lattice_pending = None
writer_transitions = []
sites = {(0x1006ca950 if WITH_LATTICE else 0x1002a4334): ('lattice' if WITH_LATTICE else 'irCopy'), 0x1006c2fd4: 'feedbackRoute',
         0x1000ef37c: 'cabinet', 0x1001bc114: 'pcm'}
if WITH_WRITER: sites[0x10091baa4] = 'writer'
if WITH_LATTICE: del sites[0x1001bc114]
if WITH_MONO:
    del sites[0x1006ca950]
    sites = {0x100829d48: 'bodyDrive', **sites}

if WITH_LEVEL: sites[level.RAW_SITE] = 'rawKeys'



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
    data.update(keyMonoSourcesObserved=WITH_KEY_MONO)
    data.update(writerInputObserved=WITH_WRITER, writerTransitions=writer_transitions,
                activeHardwareBreakpoints=sum(h.IsEnabled() for h in base.hooks))
    if WITH_LATTICE:
        lattice_bytes = json.dumps({'schema': 1, 'runStatus': base.run_status, 'errors': lattice_errors,
            'targetMutation': False, 'pending': lattice_pending is not None,
            'sites': ['0x100829d48' if WITH_MONO else '0x1006ca950', '0x1006c2fd4'], 'observations': lattice_rows}, separators=(',', ':'), allow_nan=False).encode()
        (base.ROOT / 'feedback-lattice.json').write_bytes(lattice_bytes)
        data.update(feedbackLatticeSameRun=True, feedbackLatticeFile='feedback-lattice.json',
            feedbackLatticeSha256=hashlib.sha256(lattice_bytes).hexdigest(),
            convolutionIrTimeInputsCaptured=False, writerOnlyStereoTarget=True)
    if WITH_MONO:
        mono_bytes = json.dumps({'schema': 1, 'runStatus': base.run_status, 'errors': errors,
            'targetMutation': False, 'pending': mono_pending is not None,
            'sites': ['0x100829d48', '0x1006c2fd4'], 'configs': mono.modal.configs,
            'observations': mono_rows}, separators=(',', ':'), allow_nan=False).encode()
        (base.ROOT / 'mono-body.json').write_bytes(mono_bytes)
        data.update(monoBodySameRun=True, monoBodyFile='mono-body.json', monoBodySha256=hashlib.sha256(mono_bytes).hexdigest())
    if WITH_LEVEL:
        level_bytes = json.dumps(level.payload(base.run_status, errors), separators=(',', ':'), allow_nan=False).encode()
        (base.ROOT / 'drive-level.json').write_bytes(level_bytes)
        data.update(driveLevelSameRun=True, driveLevelFile='drive-level.json',
            driveLevelSha256=hashlib.sha256(level_bytes).hexdigest(), driveLevelPhaseTransitions=level.transitions)
    if WITH_KEY_RESONANCE:
        resonance_bytes = json.dumps(key_resonance.payload(base.run_status, errors), separators=(',', ':'), allow_nan=False).encode()
        (base.ROOT / 'key-resonance.json').write_bytes(resonance_bytes)
        data.update(keyResonanceSameRun=True, keyResonanceFile='key-resonance.json', keyResonanceSha256=hashlib.sha256(resonance_bytes).hexdigest())
    if WITH_EXCITATION:
        excitation_bytes = json.dumps(excitation.payload(base.run_status, errors), separators=(',', ':'), allow_nan=False).encode()
        (base.ROOT / 'global-excitation.json').write_bytes(excitation_bytes)
        data.update(globalExcitationSameRun=True, globalExcitationPassive=True, globalExcitationFile='global-excitation.json', globalExcitationSha256=hashlib.sha256(excitation_bytes).hexdigest())
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
    global pending, lattice_pending, mono_pending
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
                if WITH_KEY_MONO:
                    voice = frame.FindRegister('x3').GetValueAsUnsigned()
                    workspace = frame.FindRegister('x2').GetValueAsUnsigned()
                    source = mono.rows(frame, workspace + 0xe8)
                    slot_before = mono.rows(frame, slot + 0x100)
                    if len(source) != 1 or len(slot_before) != 1: raise ValueError('Complete mono contribution and slot required')
                    row.update(keyIndex=scalar(frame, voice + 0x64, 'I'),
                        mixLevels=list(unpack(frame, voice + 0xf0, 'ffff')),
                        monoContribution=source[0], slotMonoBefore=slot_before[0],
                        slotMonoReset=scalar(frame, slot + 0x138, 'B'))
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
        if name == 'rawKeys':
            if WITH_KEY_RESONANCE and key_resonance.initial is None: key_resonance.initialize(frame)
            level.begin(frame)
            return False
        if name == 'bodyDrive':
            if WITH_LEVEL: level.body(frame, len(key.global_rows))
            if mono_pending is not None or lattice_pending is not None: raise ValueError('Unique body/lattice block required')
            mono_pending = mono.begin_block(frame, len(key.global_rows))
            if WITH_KEY_RESONANCE: key_resonance.observe(frame, mono_pending['_root'], len(key.global_rows))
            state = scalar(frame, mono_pending['_root'] + 0x50, 'Q')
            if WITH_EXCITATION:
                mono_pending['keyDirectBefore'] = mono.rows(frame, mono_pending['_workspace'] + 0x238)
                mono_pending['directScratchGain'] = scalar(frame, state + 0x370)
                excitation.passive_begin(frame, mono_pending['_root'], mono_pending['_workspace'], len(key.global_rows))
            external = scalar(frame, mono_pending['_root'] + 0x68, 'Q')
            begin, end = unpack(frame, external + 8, 'QQ')
            if end < begin or (end - begin) % 56 or not 1 <= (end - begin) // 56 <= 64:
                raise ValueError('Bounded compiled feedback program vector required')
            active_begin, active_end = unpack(frame, external + 0x38, 'QQ')
            if active_end - active_begin != 8: raise ValueError('One active feedback descriptor required')
            descriptor_index = scalar(frame, active_begin, 'Q')
            descriptor_begin, descriptor_end = unpack(frame, external + 0x20, 'QQ')
            if descriptor_end < descriptor_begin or (descriptor_end - descriptor_begin) % 56 or descriptor_index >= (descriptor_end - descriptor_begin) // 56:
                raise ValueError('Bounded actual feedback descriptor required')
            descriptor = descriptor_begin + descriptor_index * 56
            program_index = scalar(frame, descriptor, 'Q')
            if program_index >= (end - begin) // 56: raise ValueError('Bounded selected compiled feedback program required')
            program = begin + program_index * 56
            table, table_end = unpack(frame, program, 'QQ')
            if table_end - table != 3 * 72: raise ValueError('Three compiled feedback filters required')
            states = [lattice.probe.filter_state(frame, table + 72 * i) for i in range(3)]
            if lattice_rows:
                for item in states: del item['ring']
            lattice_pending = {'globalOrdinal': len(key.global_rows), 'before': states,
                'postFilterEnabled': scalar(frame, program + 0x18, 'B'),
                'programSelection': {'descriptor': descriptor_index, 'program': program_index,
                    'descriptorGains': list(unpack(frame, descriptor + 0x28, 'ff'))},
                'routeBefore': lattice.route_config(frame, state), '_table': table, '_state': state}
            return False
        if name == 'lattice':
            if lattice_pending is not None: raise ValueError('Unique feedback lattice call required')
            owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1006c2c6c]
            if len(owners) != 1: raise ValueError('Actual external-feedback global caller required')
            owner_root = owners[0].FindRegister('x20').GetValueAsUnsigned()
            state = scalar(frame, owner_root + 0x50, 'Q')
            source, target, table = reg('x0'), reg('x1'), reg('x2')
            if scalar(frame, source, 'I') != 1 or target != state + 0x150:
                raise ValueError('Actual mono-to-three feedback descriptor required')
            states = [lattice.probe.filter_state(frame, table + 72 * i) for i in range(3)]
            if lattice_rows:
                for item in states: del item['ring']
            lattice_pending = {'globalOrdinal': len(key.global_rows), 'source': lattice.probe.rows(frame, source),
                'before': states, 'postFilterEnabled': scalar(frame, reg('x21') + 0x18, 'B'),
                'routeBefore': lattice.route_config(frame, state), '_table': table, '_state': state}
            return False
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
            if WITH_EXCITATION: excitation.passive_finish(frame)
            state = reg('x21')
            if WITH_MONO:
                if mono_pending is None or mono_pending['ordinal'] != len(key.global_rows): raise ValueError('Same-block mono predecessor required')
                mono.body_result(frame, mono_pending, include_output=False)
                mono.finish_block(frame, mono_pending, state)
                lattice_pending['source'] = mono_pending['monoTarget']
                mono_rows.append(mono_pending); mono_pending = None
            if WITH_LATTICE:
                if lattice_pending is None or lattice_pending.pop('_state') != state or lattice_pending['globalOrdinal'] != len(key.global_rows):
                    raise ValueError('Complete same-block lattice predecessor required')
                table = lattice_pending.pop('_table')
                lattice_pending['output'] = lattice.probe.rows(frame, state + 0x150)
                lattice_pending['wrapperOutput'] = lattice_pending['output']
                lattice_pending['after'] = [lattice.probe.filter_state(frame, table + 72 * i) for i in range(3)]
                for item in lattice_pending['after']: del item['ring']
                lattice_pending['feedbackOutput'] = lattice.probe.rows(frame, state + 0x118)
                lattice_pending['routeAfter'] = lattice.route_config(frame, state)
                lattice_rows.append(lattice_pending); lattice_pending = None
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
                if WITH_LATTICE:
                    config = {}
                    for kind, offset, size, reader in [('head', 0xb8, 64, profile.head_config), ('tail', 0xc0, 512, profile.tail_config)]:
                        node = scalar(frame, state + offset, 'Q')
                        if scalar(frame, node + 0x38, 'Q') != 1 or scalar(frame, node + 0x40, 'I') != 0:
                            raise ValueError('Cold supported convolution node required')
                        bank = scalar(frame, node + 8, 'Q')
                        if scalar(frame, bank + 8, 'Q') != size or scalar(frame, bank + 0x10, 'Q') != 9:
                            raise ValueError('Complete convolution bank required')
                        config[kind] = {'node': hex(node), 'bank': hex(bank), 'configuration': reader(frame, bank)}
                    configurations[identity] = config
                else:
                    profile.time_inputs = ir_inputs
                    configurations[identity] = profile.configure(frame, state)
                configurations[identity]['post'] = profile.post_profile(frame, manager)
                if WITH_WRITER and not WITH_LATTICE:
                    copy_hook, writer_hook = base.hooks[1], base.hooks[-1]
                    copy_hook.SetEnabled(False); writer_hook.SetEnabled(True)
                    writer_transitions.append({'globalOrdinal': ordinal, 'disabled': copy_hook.GetID(),
                        'enabled': writer_hook.GetID(), 'active': sum(h.IsEnabled() for h in base.hooks)})
            pending = {'state': identity, 'globalOrdinal': ordinal, 'manager': hex(manager)}
            append_audio(frame, {'stage': name, **pending, 'mode': reg('w4'),
                'gain': list(unpack(frame, state + 0x30, 'ffff'))},
                [(reg('x2'), 9), (reg('x3'), 3), (workspace + 0x120, 3)])
            if WITH_LATTICE: pending = None
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
        if address == 0x10091baa4 and not WITH_LATTICE: hook.SetEnabled(False)
        if WITH_LEVEL and address in (level.RAW_SITE, level.DRIVE_SITE):
            level.hooks[address] = hook
            hook.SetEnabled(address == level.RAW_SITE)
        hook.SetAutoContinue(True); base.hooks.append(hook)
    for hook in base.hooks:
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
    if len(base.hooks) != (6 if WITH_LEVEL else 5 if WITH_LATTICE else 6) or sum(h.IsEnabled() for h in base.hooks) != (5 if WITH_WRITER else 6):
        raise ValueError('Six registered hardware points and bounded writer handoff required')
    base.save = save
    save()
