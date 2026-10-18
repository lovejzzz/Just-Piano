"""Read-only cold and post-key snapshots for the 5f1e58 recurrence."""
import hashlib
import json
from pianoteq_damper_runtime_capture import scalar, unpack, memory

initial = None
observations = []
coefficient_versions = {}


def snapshot(frame, root):
    body = scalar(frame, root + 0x58, 'Q')
    if scalar(frame, body + 0x1b8, 'B') != 0: raise ValueError('Inspected key recurrence variant required')
    state = scalar(frame, body + 0x1b0, 'Q')
    first, end = unpack(frame, state + 0x10, 'QQ')
    if end < first or (end - first) % 128 or not 1 <= (end - first) // 128 <= 128:
        raise ValueError('Complete bounded key recurrence inventory required')
    result = []
    for index, record in enumerate(range(first, end, 128)):
        begin, finish = unpack(frame, record + 0x38, 'QQ')
        if finish < begin or (finish - begin) % 24 or (finish - begin) // 24 > 2048:
            raise ValueError('Bounded key modal links required')
        count = (finish - begin) // 24
        raw = memory(frame, begin, finish - begin) if count else b''
        digest = hashlib.sha256(raw).hexdigest()
        if digest not in coefficient_versions:
            coefficient_versions[digest] = [dict(zip(('modeIndex', 'decay', 'b', 'a', 'c', 'd'),
                unpack(frame, begin + i * 24, 'Ifffff'))) for i in range(count)]
        pointer = scalar(frame, record + 0x50, 'Q')
        vectors = scalar(frame, record + 0x60, 'Q')
        if not 0 <= vectors <= 1024 or vectors * 4 < count * 2:
            raise ValueError('Bounded complete padded modal history required')
        history = memory(frame, pointer, vectors * 16) if vectors else b''
        result.append({'index': index, 'modeCount': count, 'stateFloats': vectors * 4,
            'coefficientSha256': digest, 'stateSha256': hashlib.sha256(history).hexdigest(),
            'stateAllPositiveZero': not any(history), 'previousInput': scalar(frame, record + 0x78),
            'sleeping': scalar(frame, record + 0x29, 'B'), 'gain': scalar(frame, record + 0x2c)})
    return result


def initialize(frame):
    global initial
    if initial is not None: raise ValueError('Unique cold key recurrence observation required')
    manager = frame.FindRegister('x0').GetValueAsUnsigned()
    root = scalar(frame, manager + 0xe00, 'Q')
    initial = snapshot(frame, root)


def observe(frame, root, ordinal):
    if initial is None or ordinal != len(observations): raise ValueError('Cold predecessor and continuous key recurrence required')
    observations.append({'ordinal': ordinal, 'keys': snapshot(frame, root)})


def payload(run_status, errors):
    return {'schema': 1, 'runStatus': run_status, 'errors': errors, 'targetMutation': False,
        'initial': initial, 'observations': observations, 'coefficientVersions': coefficient_versions,
        'nativeCoefficientTablesStillObserved': True}
