"""Read successive active releasing-key inputs at one native arithmetic point.

Only the short single-note fixture is supported. One fixed hardware point;
no stepping, process writes, evaluated expressions, or software breakpoints.
"""
import json
import os
from pathlib import Path
import traceback
from pianoteq_damper_runtime_capture import scalar, verify_text
from pianoteq_capture_source_amplitude import regfloat

ROOT = Path(os.environ['PIANOTEQ_CAPTURE_DIR'])
records, errors, hooks, pending, rejected = [], [], [], {}, []
selected_node = None


def save():
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'runtime.json').write_text(json.dumps({
        'points': ['0x1005e1e94'],
        'output_observation': 'same node at next moving-release entry',
        'records': records, 'errors': errors,
        'initial_rejected_inputs': rejected,
        'unmatched_entries': list(pending.values()),
        'hooks': [{'id': h.GetID(), 'hits': h.GetHitCount(),
                   'enabled': h.IsEnabled()} for h in hooks],
    }, indent=2))


def observed(frame, location, _):
    global selected_node
    try:
        node = frame.FindRegister('x1').GetValueAsUnsigned()
        thread = frame.GetThread().GetThreadID()
        key = (thread, node)
        position = scalar(frame, node)
        velocity = scalar(frame, node + 8)
        dt = regfloat(frame, 's8', 'f')
        if velocity * dt >= 0:
            if len(rejected) < 8:
                rejected.append({'position': position, 'velocity': velocity, 'dt': dt})
                save()
            return False
        if position <= 0 and selected_node is None:
            return False
        if selected_node is not None and node != selected_node:
            # Other inactive keys can be visited between this node's calls.
            if position <= 0:
                return False
            raise RuntimeError('Single releasing-node fixture required')
        selected_node = node
        if key in pending:
            record = pending.pop(key)
            record['actual_position'] = position
            record['actual_intermediate'] = scalar(frame, node + 4)
            records.append(record)
        if position <= 0:
            assert not pending
            for hook in hooks:
                hook.SetEnabled(False)
            save()
            return False
        assert key not in pending
        assert len(records) < 64
        pending[key] = {
            'node': hex(node), 'thread': thread,
            'key_index': frame.FindRegister('w21').GetValueAsUnsigned(),
            'input_position': position, 'velocity': velocity, 'dt': dt,
            'key_cap': regfloat(frame, 's15', 'f'),
            'soft_cap': regfloat(frame, 's12', 'f'),
        }
        save()
        return False
    except Exception:
        errors.append(traceback.format_exc())
        save()
        return True


def __lldb_init_module(debugger, _):
    import lldb
    assert not (ROOT / 'runtime.json').exists(), 'Use a fresh output directory'
    target = debugger.GetSelectedTarget()
    assert target.GetTriple().startswith('arm64-')
    spec = target.GetModuleAtIndex(0).GetFileSpec()
    verify_text(Path(spec.GetDirectory()) / spec.GetFilename())
    for address in (0x1005e1e94,):
        result = lldb.SBCommandReturnObject()
        debugger.GetCommandInterpreter().HandleCommand(
            f'breakpoint set --hardware --address {address:#x} --shlib "Pianoteq 9"', result)
        if not result.Succeeded():
            raise RuntimeError(result.GetError())
        hook = target.GetBreakpointAtIndex(target.GetNumBreakpoints() - 1)
        hook.SetScriptCallbackFunction(__name__ + '.observed')
        hooks.append(hook)
    save()
