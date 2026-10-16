"""Read one contiguous release window: producer, coefficients, 16/8-lane DSP.

Four fixed hardware points; exact authorized build, short single A4 fixture.
Initial modal state is observed once; subsequent before/after states are targets.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, verify_text
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_coefficients import capture_record
from pianoteq_capture_recurrence import register, floats, lanes

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
MODE = os.environ.get('PIANOTEQ_RELEASE_RENDER_MODE', 'combined')
POINTS = {'producer': 0x1005e2164, 'coefficients': 0x100864d28,
          'sixteen': 0x1007c0d50, 'eight': 0x1007c0ec4}
START, END = 3264, 4160
records, errors, hooks, contexts = [], [], [], {}
window_complete = False


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'mode': MODE, 'counterWindow': [START, END], 'windowComplete': window_complete,
        'records': records, 'errors': errors,
        'hooks': [{'id': h.GetID(), 'hits': h.GetHitCount(),
                   'enabled': h.IsEnabled()} for h in hooks],
    }, indent=2))


def producer(frame, h):
    manager = register(frame, 'x19')
    clock = scalar(frame, manager + 0xc08, 'Q')
    state = scalar(frame, manager + 0xe00, 'Q')
    node = register(frame, 'x9')
    r = {'node': hex(node), 'nodePosition': scalar(frame, node),
         'nodeIntermediate': scalar(frame, node + 4), 'velocity': scalar(frame, node + 8),
         'keyCap': regfloat(frame, 's15', 'f'), 'softCap': regfloat(frame, 's12', 'f'),
         'dt': regfloat(frame, 's8', 'f'), 'sampleRate': scalar(frame, clock + 0xc),
         'producerBlockSamples': scalar(frame, clock + 0x198, 'I'),
         'producerSampleCounter': scalar(frame, manager + 0xd00, 'Q'),
         'mode': scalar(frame, h + 0x2fa4, 'B'), 'ignorePedal': scalar(frame, h + 0x2fa5, 'B'),
         'pedalDrive': regfloat(frame, 'd2', 'd'), 'pedalAmount': scalar(frame, state + 0xe8),
         'keyLimit': regfloat(frame, 'd3', 'd'), 'softLimit': regfloat(frame, 'd4', 'd'),
         'pendingPosition': scalar(frame, h + 0x2f9c),
         'pendingRelease': scalar(frame, h + 0x2f99, 'B'),
         'pendingDirection': scalar(frame, h + 0x2f9a, 'B'),
         'pendingPedal': register(frame, 'w2'), 'pendingSamples': scalar(frame, h + 0x2f94, 'I'),
         'skipPending': scalar(frame, h + 0x2fa7, 'B'),
         'currentPosition': scalar(frame, h + 0x2ec8),
         'currentRelease': scalar(frame, h + 0x2ec5, 'B'),
         'currentDirection': scalar(frame, h + 0x2ec6, 'B'),
         'pedalLatched': scalar(frame, h + 0x2ed4, 'B'),
         'positionBlend': scalar(frame, h + 0x3084),
         'additionalCapActive': scalar(frame, h + 0x1ac0, 'B'),
         'additionalCapAmount': scalar(frame, h + 0x2880),
         'additionalCapTarget': scalar(frame, h + 0x28a0),
         'voiceType': scalar(frame, h + 0x2f90, 'I'),
         'typeTwoCap': scalar(frame, h + 0x2dcc),
         'forceReleaseActive': scalar(frame, h + 0x2f48, 'B'),
         'forceReleaseFlag': scalar(frame, h + 0x1739, 'B')}
    return r


def observed(frame, location, _):
    global window_complete
    try:
        if window_complete:
            return False
        point = frame.GetPCAddress().GetFileAddress()
        stage = next(k for k, v in POINTS.items() if v == point)
        thread = frame.GetThread().GetThreadID()
        if stage in ('producer', 'coefficients'):
            v = register(frame, 'x16') + 0x168 if stage == 'producer' else register(frame, 'x24') - 0x18
            counter = scalar(frame, v + 0x10, 'I')
            if not START <= counter <= END:
                if stage == 'coefficients':
                    contexts.pop(thread, None)
                    # This thread has finished every kernel of the preceding
                    # block. The producer can run ahead while kernels remain.
                    if counter > END and records:
                        window_complete = True
                        for hook in hooks:
                            hook.SetEnabled(False)
                        save()
                return False
            if stage == 'producer':
                r = producer(frame, v - 0x168)
            else:
                r = capture_record(frame)
                r['releaseFields'] = {hex(o): scalar(frame, v + o) for o in
                                       (0x8c4, 0x8cc, 0x91c, 0x914, 0x94c, 0x950,
                                        0x954, 0x958, 0x910, 0x90c, 0x920, 0x944)}
                contexts[thread] = {'V': hex(v), 'counter': counter,
                                    'P_pointer': r['P_pointer']}
            r.update({'stage': stage, 'V': hex(v), 'counter': counter, 'thread': thread})
        else:
            if thread not in contexts:
                return False
            c = contexts[thread]
            wide = stage == 'sixteen'
            p = register(frame, 'x9' if wide else 'x23')
            q = register(frame, 'x8' if wide else 'x22')
            width = 16 if wide else 8
            count = register(frame, 'w21')
            assert count == 64
            lane = (p - c['P_pointer']) // 4
            assert 0 <= lane <= 8192 and (p - c['P_pointer']) % 4 == 0
            r = {'stage': stage, 'V': c['V'], 'counter': c['counter'], 'thread': thread,
                 'lane': lane, 'samples': count, 'outputPointer': register(frame, 'x19'),
                 'P_before': floats(frame, p, width), 'Q_before': floats(frame, q, width),
                 'coefficients': floats(frame, register(frame, 'x20'), width * 2),
                 'output': floats(frame, register(frame, 'x19'), count),
                 'P_after': sum((lanes(frame, reg) for reg in
                                 (('v21', 'v20', 'v23', 'v16') if wide else ('v6', 'v4'))), []),
                 'Q_after': sum((lanes(frame, reg) for reg in
                                 (('v22', 'v19', 'v18', 'v17') if wide else ('v7', 'v5'))), [])}
        records.append(r)
        assert len(records) <= 1024
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    assert MODE in ('combined', 'worker')
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    for stage, address in POINTS.items():
        if MODE == 'worker' and stage == 'producer':
            continue
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        hook.SetScriptCallbackFunction(__name__ + '.observed')
        hooks.append(hook)
    save()
