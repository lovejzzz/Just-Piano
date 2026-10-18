"""Read-only complete body recurrence and pre-lattice mono composition targets."""
import hashlib
import json
import struct
import traceback
import pianoteq_capture_soundboard_responses as base
import pianoteq_capture_global_recurrence as modal
from pianoteq_damper_runtime_capture import scalar, unpack
from pianoteq_capture_source_amplitude import regfloat
from pianoteq_capture_feedback_allpass_probe import rows

SITES = (0x100829d48, 0x1006c2bf8, 0x1006ca950)
observations, errors = [], []
pending = None


def compact(state):
    values = state.pop('states')
    state['statesSha256'] = hashlib.sha256(struct.pack('<%df' % len(values), *values)).hexdigest()
    return state


def queue_state(frame, root):
    enabled = scalar(frame, root + 0x860, 'B')
    pointer = scalar(frame, root + 0x28, 'Q')
    result = {'enabled': enabled, 'hasFirst': bool(pointer)}
    if enabled == 1 and pointer:
        result.update(gains=list(unpack(frame, pointer + 0x38, 'ff')),
                      sources=[rows(frame, pointer + offset) for offset in (0x40, 0x78)])
    return result


def save():
    raw = json.dumps({'schema': 1, 'runStatus': base.run_status, 'errors': errors,
        'targetMutation': False, 'pending': pending is not None, 'sites': [hex(x) for x in SITES],
        'configs': modal.configs, 'observations': observations}, separators=(',', ':'), allow_nan=False)
    temporary = base.ROOT / 'runtime.json.tmp'; temporary.write_text(raw); temporary.replace(base.ROOT / 'runtime.json')


def begin_block(frame, ordinal):
    reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
    owners = [f for f in frame.GetThread() if f.GetPCAddress().GetFileAddress() == 0x1006c2be0]
    if len(owners) != 1: raise ValueError('Actual global drive caller required')
    root = owners[0].FindRegister('x20').GetValueAsUnsigned()
    workspace = owners[0].FindRegister('x23').GetValueAsUnsigned()
    if reg('x0') != scalar(frame, root + 0x88, 'Q'): raise ValueError('Actual global drive required')
    body = scalar(frame, root + 0x58, 'Q'); dispatch = modal.dispatch(frame, body, True)
    if dispatch['variant'] != 0 or len(dispatch['kernels']) != 3: raise ValueError('Three baseline modal kernels required')
    for kernel in dispatch['kernels']: compact(kernel)
    drive = reg('x0'); drive_state = scalar(frame, drive + 0xa0, 'Q')
    scratch = reg('x2'); height, capacity, width, pitch = unpack(frame, scratch, 'IIII')
    scratch_data = scalar(frame, scratch + 0x10, 'Q')
    stack_low, stack_high = reg('sp'), reg('x29')
    if height != 1 or not 1 <= capacity <= 8 or width != 64 or pitch < 64 or not stack_low <= scratch_data < scratch_data + 256 <= stack_high:
        raise ValueError('Complete scratch storage within the active global stack frame required')
    return {'ordinal': ordinal, '_root': root, '_workspace': workspace,
        '_scratch': reg('x2'), 'dispatch': dispatch,
        '_scratchData': scratch_data, '_scratchStackBounds': [stack_low, stack_high],
        'bodyBefore': rows(frame, workspace + 0x158), 'driveInputBefore': rows(frame, reg('x1')),
        'driveGain': regfloat(frame, 's0', 'f'), 'driveControlWords': list(unpack(frame, drive + 0x80, 'IIIIII')),
        'driveStateWords': list(unpack(frame, drive_state, 'I' * 68)),
        'queueBefore': queue_state(frame, scalar(frame, root + 0x70, 'Q'))}


def body_result(frame, record, include_output=True):
    workspace = record['_workspace']
    record['bodyInputs'] = [rows(frame, workspace + offset) for offset in (0x190, 0x1c8, 0x200)]
    record['bodyOutputObserved'] = include_output
    if include_output: record['bodyOutput'] = rows(frame, workspace + 0x158)
    descriptor = record.pop('_scratch'); storage = record.pop('_scratchData')
    low, high = record.pop('_scratchStackBounds')
    if include_output:
        record['driveScratch'] = rows(frame, descriptor)
    else:
        if frame.FindRegister('sp').GetValueAsUnsigned() != low or frame.FindRegister('x29').GetValueAsUnsigned() != high:
            raise ValueError('Original global stack allocation must remain active')
        record['driveScratch'] = [list(unpack(frame, storage, 'f' * 64))]
    record['scratchReadAfterDescriptorRelease'] = not include_output
    record['after'] = [compact(modal.kernel_state(frame, int(k['object'], 16))) for k in record['dispatch']['kernels']]


def finish_block(frame, record, state):
    root, workspace = record.pop('_root'), record.pop('_workspace')
    if state != scalar(frame, root + 0x50, 'Q'): raise ValueError('Same global mono state required')
    record['queueReturn'] = queue_state(frame, scalar(frame, root + 0x70, 'Q'))
    record['directSource'] = rows(frame, workspace + 0x238)
    record['directGain'] = scalar(frame, state + 0x110)
    record['scratchGain'] = scalar(frame, state + 0x36c)
    record['monoTarget'] = rows(frame, workspace + 0x158)


def observed(frame, location, _):
    global pending
    try:
        site = frame.GetPCAddress().GetFileAddress()
        if frame.GetThread().GetIndexID() != 1 or site != location.GetAddress().GetFileAddress():
            raise ValueError('Exact owned main-thread mono point required')
        reg = lambda name: frame.FindRegister(name).GetValueAsUnsigned()
        if site == 0x100829d48:
            if pending is not None: raise ValueError('Unique mono block required')
            pending = begin_block(frame, len(observations))
        elif site == 0x1006c2bf8:
            if pending is None or 'bodyOutput' in pending: raise ValueError('Body return predecessor required')
            body_result(frame, pending)
        elif site == 0x1006ca950:
            if pending is None or 'bodyOutput' not in pending: raise ValueError('Complete body result required')
            state = scalar(frame, pending['_root'] + 0x50, 'Q')
            if reg('x1') != state + 0x150: raise ValueError('Actual global lattice target required')
            if reg('x0') != pending['_workspace'] + 0x158: raise ValueError('Actual global mono input required')
            finish_block(frame, pending, state)
            observations.append(pending); pending = None
            if len(observations) % 128 == 0: save()
        else: raise ValueError('Unexpected mono site')
        return False
    except Exception:
        errors.append(traceback.format_exc()); save(); return True


def __lldb_init_module(debugger, _):
    import lldb
    target = debugger.GetSelectedTarget(); spec = target.GetModuleAtIndex(0).GetFileSpec()
    base.verify_text(base.Path(spec.GetDirectory()) / spec.GetFilename())
    if (base.ROOT / 'runtime.json').exists(): raise ValueError('Fresh mono capture required')
    for site in SITES:
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand('breakpoint set --hardware --thread-index 1 --address %#x --shlib "Pianoteq 9"' % site, result)
        if not result.Succeeded(): raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        error = hook.SetScriptCallbackFunction(__name__ + '.observed')
        if error and error.Fail(): raise RuntimeError(str(error))
        hook.SetAutoContinue(True); base.hooks.append(hook)
    base.save = save; save()
