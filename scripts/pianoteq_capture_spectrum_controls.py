"""Observe hardness-to-spectrum controls or the completed logarithmic spectrum."""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, unpack, verify_text
from pianoteq_capture_modal_source import vector
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_final_excitation import table

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
STAGE = os.environ.get('PIANOTEQ_SPECTRUM_STAGE', 'controls')
POINT = {'controls': 0x100694148, 'spectrum': 0x1006950c8,
         'weights': 0x100695108, 'weighted': 0x100695248}[STAGE]
records, errors = [], []
hook = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'stage': STAGE, 'point': hex(POINT), 'records': records,
        'errors': errors, 'hits': hook.GetHitCount() if hook else 0,
    }, indent=2))


def observed(frame, bp, _):
    try:
        assert len(records) < 32
        scratch = frame.FindRegister('x19').GetValueAsUnsigned()
        params = scalar(frame, scratch + 0x118, 'Q')
        g = scalar(frame, params, 'Q')
        shared = scalar(frame, g + 0x1240, 'Q')
        controls = {'scale': scalar(frame, g + 0xf0), 'slopeBlend': scalar(frame, shared + 0x274),
                    'referenceTable': list(unpack(frame, scalar(frame, g + 0x190, 'Q'), 'fff')),
                    'referenceBlend': scalar(frame, scratch + 0x70),
                    'repeatFlag': scalar(frame, params + 0x38, 'B'),
                    'u': scalar(frame, params + 0x2c), 'lowerBase': scalar(frame, g + 0x1014),
                    'lowerControl': scalar(frame, params + 0x34), 'lowerScale': scalar(frame, g + 0xe7c),
                    'lowerUSupport': scalar(frame, shared + 0x4f8)}
        record = {'note': scalar(frame, g + 0x14), 'mode': scalar(frame, scratch + 0xec, 'I'),
                  'controls': controls}
        if STAGE in ('weights', 'weighted'):
            record['table'] = table(frame, scalar(frame, scratch + 0xb8, 'Q'))
            count = scalar(frame, scratch + 0xf8, 'I')
            assert 0 < count <= 4096
            record['expWeights'] = list(unpack(frame, scalar(frame, scratch + 0x278, 'Q'), 'f' * count))
        elif STAGE == 'controls':
            record['neighborControls'] = {
                'amplitudeFloor': scalar(frame, g + 0x1d4), 'amplitudeBlend': scalar(frame, g + 0x1dc),
                'phaseFloor': scalar(frame, g + 0x1d8), 'phaseBlend': scalar(frame, g + 0x1e0),
                'floor': scalar(frame, params + 0x28), 'blend': scalar(frame, scratch + 0xc0),
                'mix': scalar(frame, scratch + 0x70), 'decayInput': scalar(frame, scratch + 0x10),
                'decayScale': scalar(frame, params + 0xc0),
                'rowsToModify': frame.FindRegister('w22').GetValueAsUnsigned(),
                'columns': scalar(frame, scratch + 0x100, 'I')}
            record['input'] = {'primary': regfloat(frame, 's11', 'f'), 'secondary': regfloat(frame, 's8', 'f')}
            record['actual'] = {'slope': regfloat(frame, 's12', 'f'), 'referenceNumerator': regfloat(frame, 's15', 'f')}
        else:
            count = scalar(frame, scratch + 0xf8, 'I')
            assert 0 < count <= 4096
            read_array = lambda address: list(unpack(frame, address, 'f' * count))
            record['count'] = count
            record['coordinates'] = vector(frame, g + 0x7b8)
            record['baseTable'] = read_array(scalar(frame, scalar(frame, scratch + 0x1c0, 'Q'), 'Q'))
            record['extraTables'] = {name: vector(frame, g + off) for name, off in {
                'floor': 0xc98, 'blend': 0xcb0, 'u': 0xcc8, 'history': 0xc80,
                'control30': 0xe60, 'positive': 0xce0, 'negative': 0xcf8}.items()}
            record['extraControls'] = {'floor': scalar(frame, params + 0x28), 'blend': scalar(frame, scratch + 0xc0),
                                       'u': scalar(frame, params + 0x2c), 'history': scalar(frame, scratch + 0xb4),
                                       'control30': scalar(frame, params + 0x30), 'direction': scalar(frame, params + 0xd4, 'i')}
            record['actual'] = {'slope': scalar(frame, scratch + 0x230), 'baseScale': scalar(frame, scratch + 0x240),
                                'reference': regfloat(frame, 's15', 'f'), 'lower': regfloat(frame, 's10', 'f'),
                                'extraTable': read_array(scalar(frame, scratch + 0x2a0, 'Q')),
                                'logSpectrum': read_array(scalar(frame, scratch + 0x278, 'Q'))}
        records.append(record)
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
