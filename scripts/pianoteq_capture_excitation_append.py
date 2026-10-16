"""Read-only observations around the modal append portion of 692ffc."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_modal_source import vector
from pianoteq_capture_final_excitation import table
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_APPEND_STAGE', 'before')
POINT = {'before': 0x100695248, 'appended': 0x100695860, 'final': 0x100696308}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({'schema': 1, 'stage': STAGE,
        'point': hex(POINT), 'records': records, 'errors': errors,
        'hits': hook.GetHitCount() if hook else 0}, indent=2))


def observed(frame, bp, _):
    try:
        assert len(records) < 32
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        scratch = reg('x19')
        params = scalar(frame, scratch + 0x118, 'Q')
        g = scalar(frame, params, 'Q')
        shared = scalar(frame, g + 0x1240, 'Q')
        r = {'note': scalar(frame, g + 0x14), 'mode': scalar(frame, scratch + 0xec, 'I'),
             **table(frame, scalar(frame, scratch + 0xb8, 'Q'))}
        if STAGE == 'before':
            columns, base_rows = r['header'][:2]
            count, second_count = reg('w22'), reg('w23')
            assert count <= 1024 and second_count <= 1024
            array = lambda address, n, fmt: list(unpack(frame, address, fmt * n)) if n else []
            r['indices'] = array(scalar(frame, scratch + 0x220, 'Q'), count, 'I')
            r['logAmplitudes'] = array(reg('x21'), count, 'f')
            r['secondIndices'] = array(scalar(frame, scratch + 0x260, 'Q'), second_count, 'I')
            r['secondLogAmplitudes'] = array(scalar(frame, scratch + 0x250, 'Q'), second_count, 'f')
            r['referenceFrequencies'] = array(scalar(frame, scratch + 0x210, 'Q'), columns, 'f')
            r['secondReferenceFrequencies'] = array(scalar(frame, scratch + 0x200, 'Q'), columns, 'f') if second_count else []
            r['coordinates'] = vector(frame, g + 0x7b8)
            r['tables'] = {name: vector(frame, g + off) for name, off in {
                'frequencies': 0x278, 'lowLog': 0x290, 'highLog': 0x2a8, 'decayMultipliers': 0x2c0,
                'secondFrequencies': 0x2d8, 'secondLowLog': 0x2f0, 'secondHighLog': 0x308,
                'secondDecay': 0x320}.items()}
            r['controls'] = {'scale': scalar(frame, g + 0xf0), 'logOffset': scalar(frame, g + 0x112c),
                'frequencyLimit': scalar(frame, shared + 0x84), 'supportMode': scalar(frame, shared + 0x170, 'I'),
                'supportScale': regfloat(frame, 's13', 'f'), 'amplitudeGain': regfloat(frame, 's14', 'f'),
                'secondAmplitudeGain': scalar(frame, g + 0x1110),
                'repeatFlag': scalar(frame, params + 0x38, 'B'), 'attenuation': scalar(frame, params + 0x40),
                'singleSplit': scalar(frame, g + 0x338), 'splitCoordinates': vector(frame, shared + 0x1b8)}
        records.append(r)
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    global hook
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    result = lldb.SBCommandReturnObject()
    debugger.GetCommandInterpreter().HandleCommand(
        f'breakpoint set --hardware --address {POINT:#x} --shlib "Pianoteq 9"', result)
    if not result.Succeeded():
        raise RuntimeError(result.GetError())
    hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
    hook.SetScriptCallbackFunction(__name__ + '.observed')
    save()
