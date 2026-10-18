"""Read-only global drive entry, nonlinear result and caller return."""
import hashlib
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_feedback_allpass_probe import rows

SITES = (0x100829d48, 0x10012a100, 0x1006c2be0)
records, errors, configs = [], [], {}
pending = None
DIRECTION = 0x100c40060


def controls(frame, obj):
    return {'previousLevel': scalar(frame, obj + 0x80), 'level': scalar(frame, obj + 0x84),
        'peak': scalar(frame, obj + 0x88), 'reset': scalar(frame, obj + 0x8c, 'B'),
        'cursor': scalar(frame, obj + 0x90, 'I'), 'direction': scalar(frame, DIRECTION)}


def filter_state(frame, obj):
    cfg = scalar(frame, obj + 0xd0, 'Q')
    return {'gain': scalar(frame, obj + 0x50), 'active': scalar(frame, obj + 0x54, 'I'),
        'defaultActive': scalar(frame, cfg + 0x38, 'I')}


def save():
    raw = json.dumps({'schema': 1, 'runStatus': base.run_status, 'targetMutation': False,
        'errors': errors, 'pending': pending is not None, 'sites': [hex(x) for x in SITES],
        'configs': configs, 'records': records}, separators=(',', ':'), allow_nan=False)
    temporary = base.ROOT / 'runtime.json.tmp'; temporary.write_text(raw); temporary.replace(base.ROOT / 'runtime.json')


def observed(frame, location, _):
    global pending
    try:
        site = frame.GetPCAddress().GetFileAddress()
        if site != location.GetAddress().GetFileAddress() or frame.GetThread().GetIndexID() != 1:
            raise ValueError('Owned main-thread drive point required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        if site == 0x100829d48:
            if pending is not None: raise ValueError('One active global drive call required')
            owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1006c2be0]
            if len(owners) != 1: raise ValueError('Actual global drive caller required')
            root = owners[0].FindRegister('x20').GetValueAsUnsigned()
            obj, source, scratch = reg('x0'), reg('x1'), reg('x2')
            if obj != scalar(frame, root + 0x88, 'Q'): raise ValueError('Actual global drive object required')
            state = scalar(frame, obj + 0xa0, 'Q'); identity = hex(state)
            if identity not in configs:
                if configs: raise ValueError('One baseline drive profile required')
                count = scalar(frame, state + 0xa0, 'I'); pointer = scalar(frame, state + 0xa8, 'Q')
                if not 1 <= count <= 131072: raise ValueError('Bounded drive window required')
                window = [v for offset in range(0, count, 4096) for v in unpack(frame, pointer + offset * 4, 'f' * min(4096, count - offset))]
                configs[identity] = {'stateWords': list(unpack(frame, state, 'I' * 68)),
                    'initial': controls(frame, obj), 'window': window,
                    'windowSha256': hashlib.sha256(struct.pack('<%df' % count, *window)).hexdigest()}
            pending = {'ordinal': len(records), 'identity': identity, 'before': controls(frame, obj),
                'stateBefore': list(unpack(frame, state, 'I' * 68)), 'gain': regfloat(frame, 's0', 'f'),
                'inputBefore': rows(frame, source), '_obj': obj, '_state': state, '_filter': scalar(frame, obj + 0x98, 'Q'),
                '_source': source, '_scratch': scratch}
        elif site == 0x10012a100:
            if pending is None: return False
            if reg('x0') != pending['_filter'] or reg('x1') != pending['_scratch']:
                return False
            if 'coreOutput' in pending: raise ValueError('One owned filter call required')
            pending['coreOutput'] = rows(frame, reg('x1'))
            pending['coreStateAfter'] = list(unpack(frame, pending['_state'], 'I' * 68))
            pending['coreControlsAfter'] = controls(frame, pending['_obj'])
            pending['filterBefore'] = filter_state(frame, reg('x0'))
            pending['filterRequestedGain'] = regfloat(frame, 's0', 'f')
        elif site == 0x1006c2be0:
            if pending is None or 'coreOutput' not in pending: raise ValueError('Complete nonlinear drive predecessor required')
            pending['scratchOutput'] = rows(frame, pending.pop('_scratch'))
            pending['inputAfter'] = rows(frame, pending.pop('_source'))
            pending['stateAfter'] = list(unpack(frame, pending.pop('_state'), 'I' * 68))
            pending['after'] = controls(frame, pending.pop('_obj'))
            pending['filterAfter'] = filter_state(frame, pending.pop('_filter'))
            records.append(pending); pending = None
            if len(records) % 128 == 0: save()
        else: raise ValueError('Unexpected drive point')
        return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh drive capture required')
    for site in SITES:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address %#x --shlib "Pianoteq 9"' % site, result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save = save; save()
