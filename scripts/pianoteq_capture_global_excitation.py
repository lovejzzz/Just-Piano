"""Read-only room/pedal observations at existing body and feedback hooks."""
import hashlib
from pianoteq_damper_runtime_capture import scalar, unpack, memory
from pianoteq_capture_feedback_allpass_probe import rows

pending = None
records = []
profile = None
transitions = []


def ring(frame, address, history=False):
    capacity, cursor, filled, width = unpack(frame, address + 8, 'QQQQ')
    begin, end = unpack(frame, address + 0x28, 'QQ')
    if not 1 <= capacity <= 4096 or not 1 <= width <= 8192 or end < begin or (end - begin) % 48 or (end - begin) // 48 != (capacity + 3) // 4:
        raise ValueError('Bounded complete vector delay ring required')
    pages = []
    for p in range(begin, end, 48):
        count, vectors = unpack(frame, p + 8, 'QQ')
        if count != width * 4 or vectors * 4 != count: raise ValueError('Complete four-block ring page required')
        empty = scalar(frame, p + 0x28, 'B')
        item = {'empty': empty}
        if history and empty == 0:
            item['sha256'] = hashlib.sha256(memory(frame, scalar(frame, p, 'Q'), count * 4)).hexdigest()
        pages.append(item)
    return {'capacity': capacity, 'cursor': cursor, 'filled': filled, 'width': width, 'pages': pages}


def bank(frame, address, history=False, static=False):
    channels, end = unpack(frame, address, 'QQ')
    if end < channels or (end - channels) % 0x168 or not 1 <= (end - channels) // 0x168 <= 8:
        raise ValueError('Complete bounded room channel bank required')
    result = {'damping': [ring(frame, address + o, history) for o in (0x18, 0x58)], 'channels': []}
    for p in range(channels, end, 0x168):
        first, finish = unpack(frame, p, 'QQ')
        ap_first, ap_end = unpack(frame, p + 0x18, 'QQ')
        if finish < first or (finish - first) % 80 or (finish - first) // 80 > 128 or ap_end < ap_first or (ap_end - ap_first) % 72 or (ap_end - ap_first) // 72 > 128:
            raise ValueError('Bounded complete room comb/allpass inventory required')
        item = {'input': ring(frame, p + 0x78, history), 'sum': ring(frame, p + 0xb8, history),
            'output': ring(frame, p + 0x30, history), 'combs': [], 'allpasses': [],
            'clock': scalar(frame, p + 0xfc, 'I'), 'updateCountdown': scalar(frame, p + 0x104, 'I'),
            'postFilterEnabled': scalar(frame, p + 0x108, 'I')}
        for c in range(first, finish, 80):
            item['combs'].append({'ring': ring(frame, c, history), 'damping': scalar(frame, c + 0x40),
                'mix': scalar(frame, c + 0x44), 'delay': scalar(frame, c + 0x48, 'I')})
        for a in range(ap_first, ap_end, 72):
            item['allpasses'].append({'ring': ring(frame, a, history), 'gain': scalar(frame, a + 0x40), 'delay': scalar(frame, a + 0x44, 'I')})
        item['outputDelay'] = scalar(frame, p + 0x70, 'I')
        if item['postFilterEnabled']:
            fir = p + 0x110
            count = scalar(frame, fir + 0x54, 'I')
            if count > 4096: raise ValueError('Bounded post-FIR required')
            item['postFir'] = {'blocks': count, 'cursor': scalar(frame, fir + 0x50, 'I'),
                'historySha256': hashlib.sha256(memory(frame, scalar(frame, fir + 0x28, 'Q'), count * 16)).hexdigest()}
            if static: item['postFir']['coefficients'] = list(unpack(frame, scalar(frame, fir, 'Q'), 'f' * (count * 4)))
        result['channels'].append(item)
    return result


def payload(status, errors):
    return {'schema': 1, 'runStatus': status, 'errors': errors, 'targetMutation': False,
        'pending': pending is not None, 'records': records, 'profile': profile, 'transitions': transitions}


def passive_begin(frame, root, workspace, ordinal):
    global pending
    if pending is not None or ordinal != len(records): raise ValueError('Continuous passive excitation capture required')
    owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1001bb9ac]
    if len(owners) != 1: raise ValueError('Actual global manager owner required')
    manager = owners[0].FindRegister('x19').GetValueAsUnsigned()
    wrapper = scalar(frame, root + 0x60, 'Q')
    pending = {'ordinal': ordinal, '_root': root, '_workspace': workspace, '_object': wrapper,
        '_autoGain': scalar(frame, manager + 0xe50, 'Q'), 'passiveBoundaries': True,
        'wrapperBefore': {'active': scalar(frame, wrapper + 0x80, 'I'), 'crossfade': scalar(frame, wrapper + 0x90, 'I'),
            'reset': scalar(frame, wrapper + 0x9c, 'B'), 'previousGains': list(unpack(frame, wrapper + 0x94, 'ff')),
            'transition': list(unpack(frame, wrapper + 0x84, 'fffI'))},
        'pedalsBefore': []}
    for offset in (0x78, 0x80):
        obj = scalar(frame, root + offset, 'Q'); parameter = scalar(frame, obj + 0x28, 'Q')
        pending['pedalsBefore'].append({'stateWords': list(unpack(frame, obj + 0x50, 'IIII')),
            'parameterValues': list(unpack(frame, parameter + 0x20, 'fffff'))})


def passive_finish(frame):
    global pending, profile
    if pending is None or not pending.get('passiveBoundaries'): raise ValueError('Passive excitation predecessor required')
    obj = pending['_object']; root = pending['_root']
    active = scalar(frame, obj + 0x80, 'I')
    if active not in (0, 1): raise ValueError('Two room banks required')
    selected = scalar(frame, obj + 0x70 + active * 8, 'Q')
    snapshot = bank(frame, selected, pending['ordinal'] % 64 == 0 or pending['ordinal'] == 2319, profile is None)
    if profile is None: profile = snapshot
    pending.update(bankAfter=snapshot, gains=list(unpack(frame, obj + 0x94, 'ff')),
        source=rows(frame, pending['_workspace'] + 0x238),
        audioAfter=rows(frame, frame.FindRegister('x19').GetValueAsUnsigned()),
        wrapperAfter={'active': active, 'crossfade': scalar(frame, obj + 0x90, 'I'), 'reset': scalar(frame, obj + 0x9c, 'B')},
        autoGainEnabled=scalar(frame, scalar(frame, pending['_autoGain'] + 0x58, 'Q') + 0xc, 'B'), pedalsAfter=[])
    for offset in (0x78, 0x80):
        generator = scalar(frame, root + offset, 'Q')
        pending['pedalsAfter'].append({'stateWords': list(unpack(frame, generator + 0x50, 'IIII'))})
    for key in ('_root', '_workspace', '_object', '_autoGain'): pending.pop(key)
    records.append(pending); pending = None
