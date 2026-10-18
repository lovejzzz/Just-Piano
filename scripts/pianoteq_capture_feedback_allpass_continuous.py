"""Read-only continuous entry/return targets for the scalar feedback lattice."""
import json
import traceback
import pianoteq_capture_feedback_allpass_probe as probe
base = probe.base
observations, errors = [], []
pending = None
SITES = (0x1006ca950, 0x1006c2d64, 0x1006c2d98)


def route_config(frame, state):
    scalar, unpack = probe.scalar, probe.unpack
    root = state + 0x2f8
    begin, end = unpack(frame, root, 'QQ')
    if end - begin != 3 * 80: raise ValueError('Three feedback cache rings required')
    cache = {'sampleRate': scalar(frame, root + 24), 'maximumDelay': scalar(frame, root + 28), 'rings': []}
    for r in range(begin, end, 80):
        fb, fe = unpack(frame, r + 0x20, 'QQ')
        if fe < fb or (fe - fb) % 2 or fe - fb > 256: raise ValueError('Bounded cache flags required')
        cache['rings'].append({'smallChunk': scalar(frame, r + 0x38, 'I'), 'bigChunk': scalar(frame, r + 0x3c, 'I'),
            'total': scalar(frame, r + 0x44, 'I'), 'head': scalar(frame, r + 0x48, 'I'),
            'flags': list(unpack(frame, fb, 'H' * ((fe - fb) // 2)))})
    mapping = state + 0x2a8
    begin, end = unpack(frame, mapping, 'QQ')
    if end < begin or (end - begin) % 96 or end - begin > 128 * 96: raise ValueError('Bounded feedback mapping required')
    entries = []
    for a in range(begin, end, 96):
        src, dst = unpack(frame, a, 'II'); n = scalar(frame, a + 8, 'Q')
        if n != 1: raise ValueError('Single constant tap required')
        entries.append({'source': src, 'destination': dst, 'tapWords': list(unpack(frame, a + 16, 'IIIIII'))})
    return {'cache': cache, 'entries': entries, 'wrap': scalar(frame, mapping + 24, 'B')}


def save():
    (base.ROOT / 'runtime.json').write_text(json.dumps({
        'schema': 1, 'runStatus': base.run_status, 'errors': errors,
        'targetMutation': False, 'pending': pending is not None,
        'sites': [hex(x) for x in SITES], 'observations': observations,
    }, allow_nan=False))


def observed(frame, location, _):
    global pending
    try:
        site = frame.GetPCAddress().GetFileAddress()
        if frame.GetThread().GetIndexID() != 1 or site != location.GetAddress().GetFileAddress():
            raise ValueError('Owned main-thread location required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        if site == 0x1006ca950:
            if pending is not None: raise ValueError('Overlapping scalar call')
            source, target, table = reg('x0'), reg('x1'), reg('x2')
            if probe.scalar(frame, source, 'I') != 1 or probe.scalar(frame, target, 'I') != 3:
                raise ValueError('Mono-to-three-row branch required')
            states = [probe.filter_state(frame, table + 72 * i) for i in range(3)]
            if observations:
                for state in states: del state['ring']
            pending = {'source': probe.rows(frame, source), 'before': states,
                       'postFilterEnabled': probe.scalar(frame, reg('x21') + 0x18, 'B'),
                       '_target': target, '_table': table}
        elif site == 0x1006c2d64:
            if pending is None: raise ValueError('Return without entry')
            pending['output'] = probe.rows(frame, pending.pop('_target'))
            table = pending.pop('_table')
            pending['after'] = [probe.filter_state(frame, table + 72 * i) for i in range(3)]
            for state in pending['after']: del state['ring']
            observations.append(pending); pending = None
            state = reg('x24')
            observations[-1]['routeBefore'] = route_config(frame, state)
            observations[-1]['wrapperOutput'] = probe.rows(frame, state + 0x150)
        elif site == 0x1006c2d98:
            if not observations or 'routeBefore' not in observations[-1] or 'feedbackOutput' in observations[-1]: raise ValueError('Unique routing predecessor required')
            state = probe.scalar(frame, reg('x20') + 0x50, 'Q')
            observations[-1]['feedbackOutput'] = probe.rows(frame, state + 0x118)
            observations[-1]['routeAfter'] = route_config(frame, state)
            if len(observations) % 128 == 0: save()
        else: raise ValueError('Unexpected scalar site')
        return False
    except Exception:
        errors.append(traceback.format_exc()); save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh capture directory required')
    for site in SITES:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address %#x --shlib "Pianoteq 9"' % site, result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save = save; save()
