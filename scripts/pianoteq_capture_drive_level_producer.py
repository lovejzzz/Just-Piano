"""Complete raw-key input through threshold/timer drive-level production."""
import json
import traceback
import pianoteq_capture_soundboard_responses as base
from pianoteq_damper_runtime_capture import scalar, unpack
from pianoteq_capture_source_amplitude import regfloat

SITES = (0x100096558, 0x100195200, 0x1001bb70c)
records, errors = [], []
warmups = []
initial = None
pending = None


def raw_keys(frame, manager):
    host = scalar(frame, manager + 0xc08, 'Q'); root = scalar(frame, manager + 0xe00, 'Q')
    shared = scalar(frame, root + 0x50, 'Q')
    begin, end = unpack(frame, manager + 0xc88, 'QQ')
    if end < begin or (end - begin) % 320 or not 1 <= (end - begin) // 320 <= 128:
        raise ValueError('Bounded complete raw keyboard required')
    bypass = [scalar(frame, scalar(frame, scalar(frame, manager + 0xe48, 'Q') + 0x50, 'Q') + 0xc, 'B'),
              scalar(frame, scalar(frame, scalar(frame, manager + 0xe50, 'Q') + 0x58, 'Q') + 0xc, 'B')]
    keys = []
    for p in range(begin, end, 320):
        nodes = []; pointer = scalar(frame, p + 0x20, 'Q'); seen = set()
        while pointer:
            if pointer in seen or len(nodes) >= 16: raise ValueError('Bounded acyclic raw nodes required')
            seen.add(pointer); nxt = scalar(frame, pointer + 0x18, 'Q')
            nodes.append({'object': hex(pointer), 'position': scalar(frame, pointer), 'intermediate': scalar(frame, pointer + 4),
                'velocity': scalar(frame, pointer + 8), 'id': scalar(frame, pointer + 0xc, 'I'),
                'tag': scalar(frame, pointer + 0x10, 'I'), 'next': hex(nxt)})
            pointer = nxt
        keys.append({'flags': [scalar(frame, p + o, 'B') for o in (0x1c, 0x1d, 0x1e)],
            'localControl': scalar(frame, p + 0x30), 'localSoftControl': scalar(frame, p + 0x34), 'nodes': nodes})
    return {'samples': scalar(frame, host + 0x198, 'I'), 'sampleRate': scalar(frame, host + 0xc),
        'hostControl': scalar(frame, host + 0xc0), 'hostBlend': scalar(frame, host + 0xbc),
        'softControl': scalar(frame, root + 0xe8), 'pedalControl': scalar(frame, root + 0x90),
        'extraPedalControl': scalar(frame, root + 0xa4), 'binaryPedal': scalar(frame, shared + 0x18, 'B'),
        'bypassFlags': bypass, 'keys': keys}


def pairs(frame, state, count):
    begin, end = unpack(frame, state + 0x110, 'QQ')
    if end - begin != count * 8: raise ValueError('Complete drive sensor pairs required')
    return [list(unpack(frame, begin + i * 8, 'ff')) for i in range(count)]


def save():
    raw = json.dumps({'schema': 1, 'runStatus': base.run_status, 'errors': errors,
        'targetMutation': False, 'pending': pending is not None, 'sites': [hex(x) for x in SITES],
        'initial': initial, 'warmups': warmups, 'records': records}, separators=(',', ':'), allow_nan=False)
    temporary = base.ROOT / 'runtime.json.tmp'; temporary.write_text(raw); temporary.replace(base.ROOT / 'runtime.json')


def observed(frame, location, _):
    global pending, initial
    try:
        site = frame.GetPCAddress().GetFileAddress()
        if site != location.GetAddress().GetFileAddress() or frame.GetThread().GetIndexID() != 1:
            raise ValueError('Exact owned main-thread key/level point required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        if site == 0x100096558:
            owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1001bb70c]
            render = bool(owners)
            if render and (len(owners) != 1 or owners[0].FindRegister('x19').GetValueAsUnsigned() != reg('x0')):
                raise ValueError('Actual render-manager key update required')
            if pending is not None and pending['kind'] == 'initialization' and 'input' in pending:
                finish(frame)
            if pending is not None: raise ValueError('One raw-key phase per block required')
            if not render and records: raise ValueError('Unexpected post-initialization raw producer')
            manager = reg('x0'); root = scalar(frame, manager + 0xe00, 'Q')
            pending = {'ordinal': len(records) if render else len(warmups), 'kind': 'render' if render else 'initialization',
                'callerSites': [hex(f.GetPCAddress().GetFileAddress()) for f in list(frame.GetThread())[1:5]],
                '_manager': manager, '_driver': scalar(frame, root + 0x88, 'Q'),
                'rawBefore': raw_keys(frame, manager), 'dtTarget': regfloat(frame, 's0', 'f'),
                'frameEndTarget': scalar(frame, manager + 0xd00, 'Q')}
        elif site == 0x100195200:
            if pending is None or reg('x0') != pending['_driver']: return False
            if 'input' in pending: raise ValueError('Unique owned sensor producer required')
            source = reg('x1'); count = scalar(frame, source + 8, 'Q')
            if count != len(pending['rawBefore']['keys']): raise ValueError('Complete sensor key input required')
            state = scalar(frame, reg('x0') + 0xa0, 'Q'); begin, end = unpack(frame, state + 0xd8, 'QQ')
            if end - begin != count * 4: raise ValueError('Complete per-key sensor weights required')
            if initial is None:
                initial = {'weights': list(unpack(frame, begin, 'f' * count)), 'pairs': pairs(frame, state, count),
                    'enabledGain': scalar(frame, state + 0x14), 'timeStep': scalar(frame, state + 0x10),
                    'rawKeys': pending['rawBefore'], 'reset': scalar(frame, reg('x0') + 0x8c, 'B')}
                initial['driverIdentity'] = hex(reg('x0'))
            if hex(reg('x0')) != initial['driverIdentity']: raise ValueError('One initializing/rendering sensor owner required')
            pending.update({'_state': state, 'input': list(unpack(frame, scalar(frame, source, 'Q'), 'f' * count)),
                'cap': regfloat(frame, 's0', 'f'), 'pairsBefore': pairs(frame, state, count),
                'resetTarget': scalar(frame, reg('x0') + 0x8c, 'B'), 'timeStepTarget': scalar(frame, state + 0x10),
                'rawAfter': raw_keys(frame, pending['_manager'])})
        elif site == 0x1001bb70c:
            if pending is None or pending['kind'] != 'render' or reg('x19') != pending['_manager'] or 'input' not in pending:
                raise ValueError('Complete same-block raw/sensor predecessor required')
            finish(frame)
            if len(records) % 128 == 0: save()
        else: raise ValueError('Unexpected key/level point')
        return False
    except Exception:
        errors.append(traceback.format_exc())
        for hook in base.hooks: hook.SetEnabled(False)
        save(); return True


def finish(frame):
    global pending
    state = pending.pop('_state'); count = len(pending['input'])
    pending['pairsAfter'] = pairs(frame, state, count)
    pending['levelTarget'] = scalar(frame, pending['_driver'] + 0x84)
    pending['enabledGainTarget'] = scalar(frame, state + 0x14)
    pending.pop('_manager'); pending.pop('_driver')
    (records if pending['kind'] == 'render' else warmups).append(pending)
    pending = None


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh sensor capture required')
    for site in SITES:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address %#x --shlib "Pianoteq 9"' % site, result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save = save; save()
