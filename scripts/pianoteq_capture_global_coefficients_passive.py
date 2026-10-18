"""Global coefficient production observations at existing raw/drive boundaries.

No breakpoints, process resume, evaluation, or target writes are implemented here.
"""
import hashlib
import struct
import pianoteq_capture_global_control_producer as control
import pianoteq_capture_global_key_mapping as mapping
import pianoteq_capture_global_recurrence as modal
from pianoteq_damper_runtime_capture import scalar

initial = None
warmup = None
records = []
owner = None
root_identity = None


def scalar_state(frame, root):
    shared = scalar(frame, root + 0x50, 'Q')
    return {'pedal': scalar(frame, root + 0x90), 'extraPedal': scalar(frame, root + 0xa4),
        'threshold': scalar(frame, root + 0x9c), 'forceExtra': scalar(frame, shared + 0x19, 'B'),
        'sampleRate': scalar(frame, shared + 0xc), 'samples': scalar(frame, shared + 0x10, 'I'),
        'previousAbove': scalar(frame, root + 0xbc, 'B'), 'rearmRemaining': scalar(frame, root + 0xb8, 'I'),
        'holdRemaining': scalar(frame, root + 0xc0, 'I'), 'holdValue': scalar(frame, root + 0xc8),
        'effective': scalar(frame, root + 0x118), 'bodyEnabled': scalar(frame, shared + 0x10c, 'B'),
        'excitationEnabled': scalar(frame, shared + 0x10d, 'B')}


def packed_dynamic(rows):
    return b''.join(struct.pack('<fffB', *row) for row in rows)


def initialize(frame, manager):
    global initial, owner, root_identity
    if initial is not None:
        return
    root = scalar(frame, manager + 0xe00, 'Q')
    root_identity = root
    body = scalar(frame, root + 0x58, 'Q')
    dispatch = modal.dispatch(frame, body, True)
    if dispatch['variant'] != 0 or len(dispatch['kernels']) != 3:
        raise ValueError('Three-kernel global coefficient source required')
    owner = int(dispatch['state'], 16)
    mapping.owner = owner
    before = control.snapshot(frame, owner, True)
    before['rawGlobalControl'] = scalar(frame, owner + 0x170)
    shared = scalar(frame, root + 0x50, 'Q')
    digest = mapping.curve(frame, shared + 0x30)
    initial = {'globalScalar': scalar_state(frame, root), 'producer': before, 'keys': mapping.keys(frame, True),
        'curve': mapping.curves[digest], 'kernelObjects': [k['object'] for k in dispatch['kernels']]}


def target(frame):
    state = control.snapshot(frame, owner)
    return {'globalControl': state['globalControl'], 'rawGlobalControl': scalar(frame, owner + 0x170),
        'dynamicSha256': hashlib.sha256(packed_dynamic(state['dynamic'])).hexdigest(),
        'bitsets': state['bitsets'], 'keys': mapping.keys(frame)}


def raw(frame, manager):
    global warmup
    initialize(frame, manager)
    # The zero-time initialization has finished before the next render raw call.
    # No numerical target is fed back into the predictor.
    if warmup is None:
        warmup = {'kind': 'pending'}
    elif warmup['kind'] == 'pending':
        warmup = {'kind': 'completed', 'target': target(frame)}


def body(frame, root, ordinal):
    if initial is None or warmup is None or warmup['kind'] != 'completed' or ordinal != len(records):
        raise ValueError('Cold initializer and ordered coefficient targets required')
    body = scalar(frame, root + 0x58, 'Q')
    if scalar(frame, body + 0x1b0, 'Q') != owner:
        raise ValueError('One continuous global coefficient owner required')
    records.append({'ordinal': ordinal, 'target': target(frame), 'scalarTarget': scalar_state(frame, root)})


def payload(run_status, errors):
    return {'schema': 1, 'runStatus': run_status, 'errors': errors, 'targetMutation': False,
        'initial': initial, 'warmup': warmup, 'records': records,
        'sitesAdded': [], 'nativeDynamicCoefficientsUsedForPrediction': False}
