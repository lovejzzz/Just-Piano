"""Read-only raw/drive phase pairing for the complete stereo collector.

The raw and drive hooks alternate; all hook IDs are registered before launch.
No target writes, watchpoint continuation or runtime breakpoint creation.
"""
from pianoteq_capture_drive_level_producer import raw_keys, pairs
from pianoteq_damper_runtime_capture import scalar, unpack
from pianoteq_capture_source_amplitude import regfloat

RAW_SITE = 0x100096558
DRIVE_SITE = 0x100829d48
records, warmups, transitions = [], [], []
initial = None
pending = None
hooks = {}


def rotate(source, destination):
    if not hooks[source].IsEnabled() or hooks[destination].IsEnabled():
        raise ValueError('Exclusive registered raw/drive phase required')
    hooks[source].SetEnabled(False)
    hooks[destination].SetEnabled(True)
    transitions.append({'ordinal': len(records), 'from': hex(source), 'to': hex(destination)})


def finish(frame):
    global pending
    if pending is None: raise ValueError('Raw predecessor required')
    item = pending
    manager, driver, state = item.pop('_manager'), item.pop('_driver'), item.pop('_state')
    host = scalar(frame, manager + 0xc08, 'Q')
    source = scalar(frame, host + 0x2f8, 'Q')
    count = scalar(frame, source + 8, 'Q')
    if count != len(item['rawBefore']['keys']): raise ValueError('Complete raw key span required')
    item.update(input=list(unpack(frame, scalar(frame, source, 'Q'), 'f' * count)),
        rawAfter=raw_keys(frame, manager), pairsAfter=pairs(frame, state, count),
        levelTarget=scalar(frame, driver + 0x84), enabledGainTarget=scalar(frame, state + 0x14))
    (records if item['kind'] == 'render' else warmups).append(item)
    pending = None


def begin(frame):
    global pending, initial
    reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
    owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1001bb70c]
    render = bool(owners)
    if render and (len(owners) != 1 or owners[0].FindRegister('x19').GetValueAsUnsigned() != reg('x0')):
        raise ValueError('Actual render manager required')
    if pending is not None:
        if pending['kind'] != 'initialization' or not render: raise ValueError('Single setup before rendering required')
        finish(frame)
    if not render and (records or warmups): raise ValueError('Unexpected additional setup')
    manager = reg('x0'); root = scalar(frame, manager + 0xe00, 'Q')
    driver = scalar(frame, root + 0x88, 'Q'); state = scalar(frame, driver + 0xa0, 'Q')
    raw = raw_keys(frame, manager); count = len(raw['keys'])
    first, end = unpack(frame, state + 0xd8, 'QQ')
    if end - first != count * 4: raise ValueError('Complete sensor weights required')
    before = pairs(frame, state, count)
    if initial is None:
        initial = {'weights': list(unpack(frame, first, 'f' * count)), 'pairs': before,
            'enabledGain': scalar(frame, state + 0x14), 'timeStep': scalar(frame, state + 0x10),
            'rawKeys': raw, 'reset': scalar(frame, driver + 0x8c, 'B'), 'driverIdentity': hex(driver)}
    if initial['driverIdentity'] != hex(driver): raise ValueError('One sensor owner required')
    pending = {'ordinal': len(records) if render else len(warmups), 'kind': 'render' if render else 'initialization',
        'callerSites': [hex(f.GetPCAddress().GetFileAddress()) for f in list(frame.GetThread())[1:5]],
        '_manager': manager, '_driver': driver, '_state': state, 'rawBefore': raw,
        'dtTarget': regfloat(frame, 's0', 'f'), 'frameEndTarget': scalar(frame, manager + 0xd00, 'Q'),
        'pairsBefore': before, 'timeStepTarget': scalar(frame, state + 0x10),
        'resetTarget': scalar(frame, driver + 0x8c, 'B'), 'capTargetObserved': False}
    # No sensor-entry hook: the cap register is deliberately not claimed observed.
    if render: rotate(RAW_SITE, DRIVE_SITE)


def body(frame, ordinal):
    if pending is None or pending['kind'] != 'render' or pending['ordinal'] != ordinal:
        raise ValueError('Same-block raw/drive chronology required')
    finish(frame)
    rotate(DRIVE_SITE, RAW_SITE)


def payload(run_status, errors):
    return {'schema': 1, 'runStatus': run_status, 'errors': errors, 'targetMutation': False,
        'pending': pending is not None, 'sites': [hex(RAW_SITE), hex(DRIVE_SITE)],
        'initial': initial, 'warmups': warmups, 'records': records, 'phaseTransitions': transitions,
        'capRegisterObserved': False}
