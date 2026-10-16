"""Associate release producer, queue consumer and setter in one native run.

Fixed hardware points and reads only, for the authorized exact debug build.
Fresh PIANOTEQ_CAPTURE_DIR; PIANOTEQ_QUEUE_STAGE=combined (default) or producer.
The bounded counter window is specific to the short single-note fixture.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, verify_text
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_QUEUE_STAGE', 'combined')
POINTS = {'producer': 0x1005e2164, 'consumer': 0x10020df90,
          'setter': 0x100533818, 'coefficients': 0x1006e5344}
records, errors, hooks = [], [], []
seen = False


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schemaVersion': 4, 'mode': STAGE, 'counterWindow': [3000, 4608],
        'records': records, 'errors': errors,
        'hooks': [{'id': h.GetID(), 'hits': h.GetHitCount(),
                   'enabled': h.IsEnabled()} for h in hooks],
    }, indent=2))


def observed(frame, location, _):
    global seen
    try:
        point = frame.GetPCAddress().GetFileAddress()
        stage = next(k for k, v in POINTS.items() if v == point)
        x0 = frame.FindRegister('x0').GetValueAsUnsigned()
        h = frame.FindRegister('x16').GetValueAsUnsigned() if stage == 'producer' else (
            frame.FindRegister('x19').GetValueAsUnsigned() - 0x168 if stage == 'coefficients'
            else x0 - 0x168 if stage == 'setter' else x0)
        v = h + 0x168
        counter = scalar(frame, v + 0x10, 'I')
        if not 3000 <= counter <= 4608:
            if seen and counter > 4608:
                for hook in hooks:
                    hook.SetEnabled(False)
                save()
            return False
        seen = True
        r = {
            'stage': stage, 'point': hex(point), 'H': hex(h), 'V': hex(v),
            'thread': frame.GetThread().GetThreadID(), 'counter': counter,
            'previousBlockSamples': scalar(frame, v + 0x904, 'I'),
            'pendingSamples': scalar(frame, h + 0x2f94, 'I'),
            'pending': scalar(frame, h + 0x2f98, 'B'),
            'pendingPosition': scalar(frame, h + 0x2f9c),
            'pendingRelease': scalar(frame, h + 0x2f99, 'B'),
            'pendingDirection': scalar(frame, h + 0x2f9a, 'B'),
            'pendingPedal': scalar(frame, h + 0x2fa0, 'B'),
            'skipPending': scalar(frame, h + 0x2fa7, 'B'),
            'currentPosition': scalar(frame, h + 0x2ec8),
            'currentRelease': scalar(frame, h + 0x2ec5, 'B'),
            'currentDirection': scalar(frame, h + 0x2ec6, 'B'),
            'voicePosition': scalar(frame, v + 0x8cc),
            'cachedPosition': scalar(frame, v + 0x8c8),
            'positionBlend': scalar(frame, h + 0x3084),
            'pedalLatched': scalar(frame, h + 0x2ed4, 'B'),
            'additionalCapActive': scalar(frame, h + 0x1ac0, 'B'),
            'additionalCapAmount': scalar(frame, h + 0x2880),
            'additionalCapTarget': scalar(frame, h + 0x28a0),
            'voiceType': scalar(frame, h + 0x2f90, 'I'),
            'typeTwoCap': scalar(frame, h + 0x2dcc),
            'forceReleaseActive': scalar(frame, h + 0x2f48, 'B'),
            'forceReleaseFlag': scalar(frame, h + 0x1739, 'B'),
        }
        if stage == 'producer':
            node = frame.FindRegister('x9').GetValueAsUnsigned()
            r['node'] = hex(node)
            r['keyIndex'] = frame.FindRegister('w21').GetValueAsUnsigned()
            r['nodePosition'] = scalar(frame, node)
            r['nodeIntermediate'] = scalar(frame, node + 4)
            r['velocity'] = scalar(frame, node + 8)
            r['dt'] = regfloat(frame, 's8', 'f')
            r['keyCap'] = regfloat(frame, 's15', 'f')
            r['softCap'] = regfloat(frame, 's12', 'f')
            r['computedPosition'] = regfloat(frame, 's18', 'f')
            r['mode'] = scalar(frame, h + 0x2fa4, 'B')
            r['ignorePedal'] = scalar(frame, h + 0x2fa5, 'B')
            r['pedalDrive'] = regfloat(frame, 'd2', 'd')
            r['keyLimit'] = regfloat(frame, 'd3', 'd')
            r['softLimit'] = regfloat(frame, 'd4', 'd')
            manager = frame.FindRegister('x19').GetValueAsUnsigned()
            manager_state = scalar(frame, manager + 0xe00, 'Q')
            r['pedalAmount'] = scalar(frame, manager_state + 0xe8)
            clock = scalar(frame, manager + 0xc08, 'Q')
            r['producerBlockSamples'] = scalar(frame, clock + 0x198, 'I')
            r['sampleRate'] = scalar(frame, clock + 0xc)
            r['producerSampleCounter'] = scalar(frame, manager + 0xd00, 'Q')
            r['computedPendingPedal'] = frame.FindRegister('w2').GetValueAsUnsigned()
            r['overridePosition'] = scalar(frame, h + 0x14c)
        elif stage == 'consumer':
            r['blockSamples'] = frame.FindRegister('w1').GetValueAsUnsigned()
        elif stage == 'setter':
            r['caller'] = hex(frame.FindRegister('x30').GetValueAsUnsigned())
            r['inputPosition'] = regfloat(frame, 's0', 'f')
        else:
            r['coefficientFields'] = {hex(o): scalar(frame, v + o) for o in
                                      (0x8c4, 0x91c, 0x914, 0x94c, 0x950, 0x954,
                                       0x958, 0x910, 0x90c, 0x920, 0x944, 0x7e4, 0x7b0)}
        records.append(r)
        assert len(records) <= 512, 'Single-voice fixture required'
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    assert STAGE in ('combined', 'producer')
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    assert target.GetTriple().startswith('arm64-')
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    for stage in (POINTS if STAGE == 'combined' else ('producer',)):
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {POINTS[stage]:#x} '
            '--shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        hook.SetScriptCallbackFunction(__name__ + '.observed')
        hooks.append(hook)
    save()
